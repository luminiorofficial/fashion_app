import type {Pool} from "pg";
import {iso} from "../../postgres";
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
}
