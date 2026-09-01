import {MemoryStore, generateId} from "../../memory-store";
import type {SessionsRepository} from "../../../types/repositories";
import type {Session} from "../../../types/auth.types";

export class MemorySessionsRepository implements SessionsRepository {
  constructor(private readonly store: MemoryStore) {}

  async createSession({userId, tokenHash, expiresAt}: {userId: string; tokenHash: string; expiresAt: string}): Promise<Session> {
    const session: Session = {id: generateId(), userId, tokenHash, expiresAt, revokedAt: null, createdAt: new Date().toISOString()};
    this.store.sessions.set(tokenHash, session);
    return session;
  }

  async findSession(tokenHash: string): Promise<Session | null> {
    const session = this.store.sessions.get(tokenHash);
    if (!session || session.revokedAt || new Date(session.expiresAt) <= new Date()) return null;
    return session;
  }

  async revokeSession(tokenHash: string): Promise<void> {
    const session = this.store.sessions.get(tokenHash);
    if (session) session.revokedAt = new Date().toISOString();
  }

  async deleteOldSessions(beforeIso: string): Promise<number> {
    let count = 0;
    for (const [key, session] of this.store.sessions) {
      const expired = Boolean(session.revokedAt) || new Date(session.expiresAt) <= new Date();
      if (expired && session.createdAt < beforeIso) {
        this.store.sessions.delete(key);
        count += 1;
      }
    }
    return count;
  }
}
