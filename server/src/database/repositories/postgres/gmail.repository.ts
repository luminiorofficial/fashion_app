import type {Pool} from "pg";
import {iso} from "../../postgres";
import type {GmailRepository} from "../../../types/repositories";
import type {GmailConnection, CreateGmailConnectionInput, UpdateGmailConnectionInput} from "../../../types/commerce.types";

interface GmailConnectionRow {
  id: string;
  user_id: string;
  google_email: string;
  google_account_id: string | null;
  access_token_ciphertext: string | null;
  access_token_expires_at: string | Date | null;
  refresh_token_ciphertext: string | null;
  scope: string | null;
  status: string;
  last_sync_status: string;
  last_synced_at: string | Date | null;
  last_sync_error: string | null;
  initial_sync_completed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  disconnected_at: string | Date | null;
}

function connectionFromRow(row: GmailConnectionRow | undefined): GmailConnection | null {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    googleEmail: row.google_email,
    googleAccountId: row.google_account_id,
    accessTokenCiphertext: row.access_token_ciphertext,
    accessTokenExpiresAt: iso(row.access_token_expires_at),
    refreshTokenCiphertext: row.refresh_token_ciphertext,
    scope: row.scope,
    status: row.status as GmailConnection["status"],
    lastSyncStatus: row.last_sync_status as GmailConnection["lastSyncStatus"],
    lastSyncedAt: iso(row.last_synced_at),
    lastSyncError: row.last_sync_error,
    initialSyncCompletedAt: iso(row.initial_sync_completed_at),
    createdAt: iso(row.created_at) as string,
    updatedAt: iso(row.updated_at) as string,
    disconnectedAt: iso(row.disconnected_at),
  };
}

// Maps UpdateGmailConnectionInput's camelCase keys to their columns. Only
// keys actually present on the input object are included in the generated
// SET clause (an omitted key keeps its stored value; an explicit `null`
// clears it) — see MemoryGmailRepository.updateConnection for the same
// omit-vs-null contract on the in-memory adapter.
const UPDATE_COLUMNS: Record<keyof UpdateGmailConnectionInput, string> = {
  accessTokenCiphertext: "access_token_ciphertext",
  accessTokenExpiresAt: "access_token_expires_at",
  refreshTokenCiphertext: "refresh_token_ciphertext",
  status: "status",
  lastSyncStatus: "last_sync_status",
  lastSyncedAt: "last_synced_at",
  lastSyncError: "last_sync_error",
  initialSyncCompletedAt: "initial_sync_completed_at",
};

export class PostgresGmailRepository implements GmailRepository {
  constructor(private readonly pool: Pool) {}

  async getConnectionByUserId(userId: string): Promise<GmailConnection | null> {
    const result = await this.pool.query<GmailConnectionRow>("SELECT * FROM gmail_connections WHERE user_id = $1", [userId]);
    return connectionFromRow(result.rows[0]);
  }

  async getConnectionById(connectionId: string): Promise<GmailConnection | null> {
    const result = await this.pool.query<GmailConnectionRow>("SELECT * FROM gmail_connections WHERE id = $1", [connectionId]);
    return connectionFromRow(result.rows[0]);
  }

  async upsertConnection(userId: string, input: CreateGmailConnectionInput): Promise<GmailConnection> {
    const result = await this.pool.query<GmailConnectionRow>(
      `INSERT INTO gmail_connections
         (user_id, google_email, google_account_id, access_token_ciphertext, access_token_expires_at, refresh_token_ciphertext, scope, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'connected')
       ON CONFLICT (user_id) DO UPDATE SET
         google_email = EXCLUDED.google_email,
         google_account_id = EXCLUDED.google_account_id,
         access_token_ciphertext = EXCLUDED.access_token_ciphertext,
         access_token_expires_at = EXCLUDED.access_token_expires_at,
         refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
         scope = EXCLUDED.scope,
         status = 'connected',
         disconnected_at = NULL
       RETURNING *`,
      [userId, input.googleEmail, input.googleAccountId, input.accessTokenCiphertext, input.accessTokenExpiresAt, input.refreshTokenCiphertext, input.scope],
    );
    return connectionFromRow(result.rows[0]) as GmailConnection;
  }

  async updateConnection(connectionId: string, input: UpdateGmailConnectionInput): Promise<GmailConnection | null> {
    const entries = (Object.keys(input) as (keyof UpdateGmailConnectionInput)[]).filter((key) => key in UPDATE_COLUMNS);
    if (!entries.length) return this.getConnectionById(connectionId);
    const setClauses = entries.map((key, index) => `${UPDATE_COLUMNS[key]} = $${index + 2}`);
    const values = entries.map((key) => input[key]);
    const result = await this.pool.query<GmailConnectionRow>(
      `UPDATE gmail_connections SET ${setClauses.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`,
      [connectionId, ...values],
    );
    return connectionFromRow(result.rows[0]);
  }

  // Clears token ciphertexts and marks the connection disconnected WITHOUT
  // deleting the row: purchase_imports history (FK ON DELETE CASCADE) must
  // survive a disconnect — only full account deletion removes it.
  async disconnectConnection(connectionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE gmail_connections
          SET access_token_ciphertext = NULL, access_token_expires_at = NULL, refresh_token_ciphertext = NULL,
              status = 'disconnected', disconnected_at = now()
        WHERE id = $1`,
      [connectionId],
    );
  }
}
