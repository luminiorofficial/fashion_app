import type {Pool} from "pg";
import {iso, withTransaction} from "../../postgres";
import type {UsersRepository} from "../../../types/repositories";
import type {User, UserRegistrationInput} from "../../../types/user.types";

interface UserRow {
  id: string;
  full_name: string;
  date_of_birth: string | Date;
  phone_number: string;
  phone_verified_at: string | Date | null;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
}

function userFromRow(row: UserRow | undefined): User | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.full_name,
    dateOfBirth: iso(row.date_of_birth) as string,
    phoneNumber: row.phone_number,
    phoneVerifiedAt: iso(row.phone_verified_at),
    status: row.status,
    createdAt: iso(row.created_at) as string,
    updatedAt: iso(row.updated_at) as string,
  };
}

export class PostgresUsersRepository implements UsersRepository {
  constructor(private readonly pool: Pool) {}

  async findUserByPhone(phoneNumber: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>("SELECT * FROM users WHERE phone_number = $1 AND deleted_at IS NULL", [phoneNumber]);
    return userFromRow(result.rows[0]);
  }

  async findOrCreateUser({name, dateOfBirth, phoneNumber}: UserRegistrationInput): Promise<User> {
    const result = await this.pool.query<UserRow>(
      `INSERT INTO users (full_name, date_of_birth, phone_number, phone_verified_at, status, last_login_at)
       VALUES ($1, $2, $3, now(), 'active', now())
       ON CONFLICT (phone_number) WHERE deleted_at IS NULL
       DO UPDATE SET last_login_at = now()
       RETURNING *`,
      [name, dateOfBirth, phoneNumber],
    );
    return userFromRow(result.rows[0]) as User;
  }

  async findUserById(userId: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>("SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL", [userId]);
    return userFromRow(result.rows[0]);
  }

  async deleteAccount(userId: string): Promise<{storageKeys: string[]}> {
    return withTransaction(this.pool, async (client) => {
      const assets = await client.query<{storage_key: string}>("SELECT storage_key FROM media_assets WHERE owner_user_id = $1 AND deleted_at IS NULL FOR UPDATE", [userId]);
      await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM otp_challenges WHERE user_id = $1 OR phone_number = (SELECT phone_number FROM users WHERE id = $1)", [userId]);
      await client.query("DELETE FROM tryon_requests WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM outfit_feedback WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM outfits WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM wardrobe_items WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM user_style_profiles WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM user_measurements WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM analysis_jobs WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM audit_events WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM ai_usage_events WHERE user_id = $1", [userId]);
      await client.query("UPDATE media_assets SET status = 'deleted', deleted_at = now(), updated_at = now() WHERE owner_user_id = $1 AND deleted_at IS NULL", [userId]);
      await client.query(
        `UPDATE users SET full_name = 'Deleted user', date_of_birth = DATE '1900-01-01',
           phone_number = '+9' || substring(translate(md5(id::text), 'abcdef', '012345') from 1 for 14),
           phone_verified_at = NULL, status = 'deleted', deleted_at = now(), updated_at = now(),
           locale = NULL, timezone = NULL, terms_accepted_at = NULL, privacy_accepted_at = NULL
         WHERE id = $1 AND deleted_at IS NULL`,
        [userId],
      );
      return {storageKeys: assets.rows.map((row) => row.storage_key)};
    });
  }
}
