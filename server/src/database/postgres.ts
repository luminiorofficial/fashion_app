import {Pool, type PoolClient} from "pg";
import type {AppConfig} from "../config/env";
import type {DatabaseHealth} from "../types/repositories";

export type Queryable = Pool | PoolClient;

export function createPool(config: Pick<AppConfig, "databaseUrl" | "databasePoolMax" | "databaseSsl" | "databaseSslRejectUnauthorized">): Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax || 10,
    ssl: config.databaseSsl ? {rejectUnauthorized: config.databaseSslRejectUnauthorized} : false,
  });
}

export async function connectPool(pool: Pool): Promise<{database: string; username: string}> {
  const result = await pool.query<{database: string; username: string}>("SELECT current_database() AS database, current_user AS username");
  return result.rows[0] as {database: string; username: string};
}

export async function poolHealth(pool: Pool): Promise<DatabaseHealth> {
  const startedAt = Date.now();
  const result = await pool.query<{database: string}>("SELECT current_database() AS database");
  return {status: "ok", adapter: "postgresql", database: result.rows[0]?.database, latencyMs: Date.now() - startedAt};
}

export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Mirrors every domain row mapper's date handling: node-postgres already
// returns timestamp columns as Date objects, so this normalizes them to the
// same ISO string shape the API has always returned, while passing through
// anything that isn't a Date (already a string, or null/undefined) unchanged.
export function iso(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}
