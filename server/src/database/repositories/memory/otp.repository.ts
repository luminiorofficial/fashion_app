import {MemoryStore} from "../../memory-store";
import type {OtpRepository} from "../../../types/repositories";
import type {OtpChallenge, CreateChallengeInput} from "../../../types/auth.types";

export class MemoryOtpRepository implements OtpRepository {
  constructor(private readonly store: MemoryStore) {}

  async createChallenge(challenge: CreateChallengeInput): Promise<OtpChallenge> {
    const value: OtpChallenge = {attempts: 0, consumedAt: null, createdAt: new Date().toISOString(), ...challenge};
    this.store.challenges.set(value.id, value);
    return value;
  }

  async getChallenge(challengeId: string): Promise<OtpChallenge | null> {
    return this.store.challenges.get(challengeId) ?? null;
  }

  async countRecentChallenges(phoneNumber: string, since: string): Promise<number> {
    return [...this.store.challenges.values()].filter(
      (challenge) => challenge.phoneNumber === phoneNumber && new Date(challenge.createdAt) >= new Date(since),
    ).length;
  }

  private async updateChallenge(challengeId: string, changes: Partial<OtpChallenge>): Promise<OtpChallenge> {
    const value = {...this.store.challenges.get(challengeId), ...changes} as OtpChallenge;
    this.store.challenges.set(challengeId, value);
    return value;
  }

  async recordChallengeAttempt(challengeId: string, expectedAttempts: number, {consumedAt = null}: {consumedAt?: string | null} = {}): Promise<OtpChallenge | null> {
    const current = this.store.challenges.get(challengeId);
    if (!current || current.consumedAt || current.attempts !== expectedAttempts) return null;
    return this.updateChallenge(challengeId, {attempts: expectedAttempts + 1, ...(consumedAt ? {consumedAt} : {})});
  }

  async markChallengeDelivered(challengeId: string, {providerMessageId, submittedAt}: {providerMessageId: string | null; submittedAt: string}): Promise<OtpChallenge | null> {
    return this.updateChallenge(challengeId, {providerMessageId, submittedAt});
  }

  async deleteExpiredOtpChallenges(beforeIso: string): Promise<number> {
    let count = 0;
    for (const [id, challenge] of this.store.challenges) {
      if (challenge.createdAt < beforeIso) {
        this.store.challenges.delete(id);
        count += 1;
      }
    }
    return count;
  }
}
