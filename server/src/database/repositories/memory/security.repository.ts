import {MemoryStore, generateId} from "../../memory-store";
import type {SecurityRepository} from "../../../types/repositories";

export class MemorySecurityRepository implements SecurityRepository {
  constructor(private readonly store: MemoryStore) {}

  async consumeRateLimit({bucketKey, limit, windowSeconds}: {bucketKey: string; limit: number; windowSeconds: number}) {
    const now = Date.now();
    let bucket = this.store.rateLimits.get(bucketKey);
    if (!bucket || new Date(bucket.resetAt).getTime() <= now) {
      bucket = {count: 0, resetAt: new Date(now + windowSeconds * 1000).toISOString()};
    }
    bucket.count += 1;
    this.store.rateLimits.set(bucketKey, bucket);
    return {allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt};
  }

  async reserveAiUsage(input: Parameters<SecurityRepository["reserveAiUsage"]>[0]) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - input.reservationTimeoutMinutes * 60_000);
    const userRows = [...this.store.aiUsage.values()].filter((row) => row.userId === input.userId);
    const rows = userRows.filter((row) => row.operation === input.operation);
    if (input.requestKey && rows.some((row) => row.requestKey === input.requestKey)) return {id: "", reason: "duplicate" as const};
    if (userRows.filter((row) => row.status === "started" && new Date(row.requestedAt) > staleBefore).length >= input.concurrentLimit) return {id: "", reason: "concurrent" as const};
    const day = now.toISOString().slice(0, 10);
    const month = now.toISOString().slice(0, 7);
    if (rows.filter((row) => row.requestedAt.startsWith(day)).length >= input.dailyLimit) return {id: "", reason: "daily" as const};
    if (rows.filter((row) => row.requestedAt.startsWith(month)).length >= input.monthlyLimit) return {id: "", reason: "monthly" as const};
    const id = generateId();
    this.store.aiUsage.set(id, {id, userId: input.userId, operation: input.operation, requestKey: input.requestKey, status: "started", requestedAt: now.toISOString(), completedAt: null});
    return {id};
  }

  async completeAiUsage(id: string, {success}: Parameters<SecurityRepository["completeAiUsage"]>[1]): Promise<void> {
    const row = this.store.aiUsage.get(id);
    if (row) Object.assign(row, {status: success ? "succeeded" : "failed", completedAt: new Date().toISOString()});
  }

  async pruneSecurityData(aiUsageBeforeIso: string): Promise<{rateLimitBuckets: number; aiUsageEvents: number}> {
    let rateLimitBuckets = 0;
    let aiUsageEvents = 0;
    for (const [key, row] of this.store.rateLimits) if (row.resetAt < new Date().toISOString()) { this.store.rateLimits.delete(key); rateLimitBuckets += 1; }
    for (const [key, row] of this.store.aiUsage) if (row.requestedAt < aiUsageBeforeIso) { this.store.aiUsage.delete(key); aiUsageEvents += 1; }
    return {rateLimitBuckets, aiUsageEvents};
  }
}
