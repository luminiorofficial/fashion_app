import {MemoryStore, generateId} from "../../memory-store";
import type {UsersRepository} from "../../../types/repositories";
import type {User, UserRegistrationInput} from "../../../types/user.types";

export class MemoryUsersRepository implements UsersRepository {
  constructor(private readonly store: MemoryStore) {}

  async findUserByPhone(phoneNumber: string): Promise<User | null> {
    const userId = this.store.usersByPhone.get(phoneNumber);
    return userId ? this.store.users.get(userId) ?? null : null;
  }

  async findOrCreateUser(registration: UserRegistrationInput): Promise<User> {
    const existing = await this.findUserByPhone(registration.phoneNumber);
    if (existing) return existing;
    const now = new Date().toISOString();
    const user: User = {
      id: generateId(),
      name: registration.name,
      dateOfBirth: registration.dateOfBirth,
      phoneNumber: registration.phoneNumber,
      phoneVerifiedAt: now,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    this.store.users.set(user.id, user);
    this.store.usersByPhone.set(registration.phoneNumber, user.id);
    return user;
  }

  async findUserById(userId: string): Promise<User | null> {
    return this.store.users.get(userId) ?? null;
  }
}
