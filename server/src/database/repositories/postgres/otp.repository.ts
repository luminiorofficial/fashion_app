import type {Pool} from "pg";
import {iso} from "../../postgres";
import type {OtpRepository} from "../../../types/repositories";
import type {OtpChallenge, CreateChallengeInput, PendingRegistration} from "../../../types/auth.types";

interface ChallengeRow {
  id: string;
  user_id: string | null;
  phone_number: string;
  purpose: string;
  otp_digest: string;
  pending_registration: PendingRegistration | null;
  provider: string;
  provider_message_id: string | null;
  submitted_at: string | Date | null;
  attempt_count: number;
  max_attempts: number;
  expires_at: string | Date;
  consumed_at: string | Date | null;
  created_at: string | Date;
}

function challengeFromRow(row: ChallengeRow | undefined): OtpChallenge | null {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    phoneNumber: row.phone_number,
    purpose: row.purpose as OtpChallenge["purpose"],
    otpHash: row.otp_digest,
    registration: row.pending_registration,
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    submittedAt: iso(row.submitted_at),
    attempts: row.attempt_count,
    maxAttempts: row.max_attempts,
    expiresAt: iso(row.expires_at) as string,
    consumedAt: iso(row.consumed_at),
    createdAt: iso(row.created_at) as string,
  };
}

export class PostgresOtpRepository implements OtpRepository {
  constructor(private readonly pool: Pool) {}

  async createChallenge(challenge: CreateChallengeInput): Promise<OtpChallenge> {
    const result = await this.pool.query<ChallengeRow>(
      `INSERT INTO otp_challenges
         (id, user_id, phone_number, purpose, otp_digest, pending_registration, provider, expires_at, max_attempts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        challenge.id, challenge.userId, challenge.phoneNumber, challenge.purpose, challenge.otpHash,
        challenge.registration ? JSON.stringify(challenge.registration) : null, challenge.provider, challenge.expiresAt, challenge.maxAttempts,
      ],
    );
    return challengeFromRow(result.rows[0]) as OtpChallenge;
  }

  async countRecentChallenges(phoneNumber: string, since: string): Promise<number> {
    const result = await this.pool.query<{count: number}>(
      "SELECT count(*)::int AS count FROM otp_challenges WHERE phone_number = $1 AND created_at >= $2",
      [phoneNumber, since],
    );
    return result.rows[0]?.count ?? 0;
  }

  async getChallenge(challengeId: string): Promise<OtpChallenge | null> {
    const result = await this.pool.query<ChallengeRow>("SELECT * FROM otp_challenges WHERE id = $1", [challengeId]);
    return challengeFromRow(result.rows[0]);
  }

  async recordChallengeAttempt(challengeId: string, expectedAttempts: number, {consumedAt = null}: {consumedAt?: string | null} = {}): Promise<OtpChallenge | null> {
    const result = await this.pool.query<ChallengeRow>(
      `UPDATE otp_challenges
          SET attempt_count = attempt_count + 1,
              consumed_at = COALESCE($3, consumed_at)
        WHERE id = $1
          AND attempt_count = $2
          AND attempt_count < max_attempts
          AND consumed_at IS NULL
          AND expires_at > now()
       RETURNING *`,
      [challengeId, expectedAttempts, consumedAt],
    );
    return challengeFromRow(result.rows[0]);
  }

  async markChallengeDelivered(challengeId: string, {providerMessageId, submittedAt}: {providerMessageId: string | null; submittedAt: string}): Promise<OtpChallenge | null> {
    const result = await this.pool.query<ChallengeRow>(
      `UPDATE otp_challenges SET provider_message_id = $2, submitted_at = $3 WHERE id = $1 RETURNING *`,
      [challengeId, providerMessageId, submittedAt],
    );
    return challengeFromRow(result.rows[0]);
  }

  async deleteExpiredOtpChallenges(beforeIso: string): Promise<number> {
    const result = await this.pool.query("DELETE FROM otp_challenges WHERE created_at < $1", [beforeIso]);
    return result.rowCount ?? 0;
  }
}
