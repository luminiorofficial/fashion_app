import type {Pool} from "pg";
import {iso} from "../../postgres";
import type {SessionsRepository} from "../../../types/repositories";
import type {Session} from "../../../types/auth.types";

interface SessionRow {
  id: string;
  user_id: string;
  token_digest: string;
  expires_at: string | Date;
  revoked_at: string | Date | null;
  created_at: string | Date;
}

function sessionFromRow(row: SessionRow | undefined): Session | null {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_digest,
    expiresAt: iso(row.expires_at) as string,
    revokedAt: iso(row.revoked_at),
    createdAt: iso(row.created_at) as string,
  };
}

export class PostgresSessionsRepository implements SessionsRepository {
  constructor(private readonly pool: Pool) {}

  async createSession({userId, tokenHash, expiresAt}: {userId: string; tokenHash: string; expiresAt: string}): Promise<Session> {
    const result = await this.pool.query<SessionRow>(
      `INSERT INTO auth_sessions (user_id, token_digest, expires_at) VALUES ($1, $2, $3) RETURNING *`,
      [userId, tokenHash, expiresAt],
    );
    return sessionFromRow(result.rows[0]) as Session;
  }

  async findSession(tokenHash: string): Promise<Session | null> {
    const result = await this.pool.query<SessionRow>(
      `UPDATE auth_sessions SET last_used_at = now()
        WHERE token_digest = $1 AND revoked_at IS NULL AND expires_at > now()
       RETURNING *`,
      [tokenHash],
    );
    return sessionFromRow(result.rows[0]);
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.pool.query("UPDATE auth_sessions SET revoked_at = now() WHERE token_digest = $1 AND revoked_at IS NULL", [tokenHash]);
  }

  async deleteOldSessions(beforeIso: string): Promise<number> {
    const result = await this.pool.query(
      "DELETE FROM auth_sessions WHERE (revoked_at IS NOT NULL OR expires_at < now()) AND created_at < $1",
      [beforeIso],
    );
    return result.rowCount ?? 0;
  }
}
