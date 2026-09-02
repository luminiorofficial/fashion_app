import {MemoryStore, generateId} from "../../memory-store";
import type {GmailRepository} from "../../../types/repositories";
import type {GmailConnection, CreateGmailConnectionInput, UpdateGmailConnectionInput} from "../../../types/commerce.types";

export class MemoryGmailRepository implements GmailRepository {
  constructor(private readonly store: MemoryStore) {}

  async getConnectionByUserId(userId: string): Promise<GmailConnection | null> {
    return [...this.store.gmailConnections.values()].find((connection) => connection.userId === userId) ?? null;
  }

  async getConnectionById(connectionId: string): Promise<GmailConnection | null> {
    return this.store.gmailConnections.get(connectionId) ?? null;
  }

  // One connection per user: reconnecting after a disconnect updates the
  // existing row (preserving its sync history/id) rather than creating a
  // second one, matching the Postgres adapter's ON CONFLICT (user_id) upsert.
  async upsertConnection(userId: string, input: CreateGmailConnectionInput): Promise<GmailConnection> {
    const now = new Date().toISOString();
    const existing = await this.getConnectionByUserId(userId);
    if (existing) {
      Object.assign(existing, {
        googleEmail: input.googleEmail,
        googleAccountId: input.googleAccountId,
        accessTokenCiphertext: input.accessTokenCiphertext,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        refreshTokenCiphertext: input.refreshTokenCiphertext,
        scope: input.scope,
        status: "connected",
        disconnectedAt: null,
        updatedAt: now,
      });
      return existing;
    }
    const connection: GmailConnection = {
      id: generateId(),
      userId,
      googleEmail: input.googleEmail,
      googleAccountId: input.googleAccountId,
      accessTokenCiphertext: input.accessTokenCiphertext,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      refreshTokenCiphertext: input.refreshTokenCiphertext,
      scope: input.scope,
      status: "connected",
      lastSyncStatus: "idle",
      lastSyncedAt: null,
      lastSyncError: null,
      initialSyncCompletedAt: null,
      createdAt: now,
      updatedAt: now,
      disconnectedAt: null,
    };
    this.store.gmailConnections.set(connection.id, connection);
    return connection;
  }

  async updateConnection(connectionId: string, input: UpdateGmailConnectionInput): Promise<GmailConnection | null> {
    const connection = this.store.gmailConnections.get(connectionId);
    if (!connection) return null;
    Object.assign(connection, input, {updatedAt: new Date().toISOString()});
    return connection;
  }

  // Clears the token ciphertexts and marks the connection disconnected
  // WITHOUT deleting the row: purchase_imports history must survive a
  // disconnect (only full account deletion should remove it).
  async disconnectConnection(connectionId: string): Promise<void> {
    const connection = this.store.gmailConnections.get(connectionId);
    if (!connection) return;
    Object.assign(connection, {
      accessTokenCiphertext: null,
      accessTokenExpiresAt: null,
      refreshTokenCiphertext: null,
      status: "disconnected",
      disconnectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}
