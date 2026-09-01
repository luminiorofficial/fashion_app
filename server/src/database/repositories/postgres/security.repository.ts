import type {Pool} from "pg";
import {withTransaction} from "../../postgres";
import type {SecurityRepository} from "../../../types/repositories";

export class PostgresSecurityRepository implements SecurityRepository {
  constructor(private readonly pool: Pool) {}

  async consumeRateLimit({bucketKey, limit, windowSeconds}: {bucketKey: string; limit: number; windowSeconds: number}) {
    const result = await this.pool.query<{request_count: number; reset_at: Date | string}>(
      `INSERT INTO rate_limit_buckets (bucket_key, request_count, reset_at)
       VALUES ($1, 1, now() + ($2 * interval '1 second'))
       ON CONFLICT (bucket_key) DO UPDATE SET
         request_count = CASE WHEN rate_limit_buckets.reset_at <= now() THEN 1 ELSE rate_limit_buckets.request_count + 1 END,
         reset_at = CASE WHEN rate_limit_buckets.reset_at <= now() THEN now() + ($2 * interval '1 second') ELSE rate_limit_buckets.reset_at END
       RETURNING request_count, reset_at`,
      [bucketKey, windowSeconds],
    );
    const row = result.rows[0]!;
    const resetAt = row.reset_at instanceof Date ? row.reset_at.toISOString() : row.reset_at;
    return {allowed: row.request_count <= limit, remaining: Math.max(0, limit - row.request_count), resetAt};
  }

  async reserveAiUsage(input: Parameters<SecurityRepository["reserveAiUsage"]>[0]) {
    return withTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.userId]);
      if (input.requestKey) {
        const duplicate = await client.query("SELECT 1 FROM ai_usage_events WHERE user_id = $1 AND operation = $2 AND request_key = $3 LIMIT 1", [input.userId, input.operation, input.requestKey]);
        if (duplicate.rowCount) return {id: "", reason: "duplicate" as const};
      }
      const counts = await client.query<{daily: string; monthly: string; active: string}>(
        `SELECT
           count(*) FILTER (WHERE operation = $2 AND requested_at >= date_trunc('day', now())) AS daily,
           count(*) FILTER (WHERE operation = $2 AND requested_at >= date_trunc('month', now())) AS monthly,
           count(*) FILTER (WHERE status = 'started' AND requested_at >= now() - ($3 * interval '1 minute')) AS active
         FROM ai_usage_events WHERE user_id = $1`,
        [input.userId, input.operation, input.reservationTimeoutMinutes],
      );
      const row = counts.rows[0]!;
      if (Number(row.active) >= input.concurrentLimit) return {id: "", reason: "concurrent" as const};
      if (Number(row.daily) >= input.dailyLimit) return {id: "", reason: "daily" as const};
      if (Number(row.monthly) >= input.monthlyLimit) return {id: "", reason: "monthly" as const};
      const inserted = await client.query<{id: string}>(
        `INSERT INTO ai_usage_events (user_id, operation, provider, model, request_key, status)
         VALUES ($1, $2, $3, $4, $5, 'started') RETURNING id`,
        [input.userId, input.operation, input.provider, input.model, input.requestKey],
      );
      return {id: inserted.rows[0]!.id};
    });
  }

  async completeAiUsage(id: string, input: Parameters<SecurityRepository["completeAiUsage"]>[1]): Promise<void> {
    await this.pool.query(
      `UPDATE ai_usage_events SET status = $2, duration_ms = $3, estimated_input_units = $4,
         estimated_output_units = $5, completed_at = now() WHERE id = $1 AND status = 'started'`,
      [id, input.success ? "succeeded" : "failed", input.durationMs, input.estimatedInputUnits ?? null, input.estimatedOutputUnits ?? null],
    );
  }

  async pruneSecurityData(aiUsageBeforeIso: string): Promise<{rateLimitBuckets: number; aiUsageEvents: number}> {
    const buckets = await this.pool.query("DELETE FROM rate_limit_buckets WHERE reset_at < now() - interval '1 day'");
    const usage = await this.pool.query("DELETE FROM ai_usage_events WHERE requested_at < $1", [aiUsageBeforeIso]);
    return {rateLimitBuckets: buckets.rowCount ?? 0, aiUsageEvents: usage.rowCount ?? 0};
  }
}
