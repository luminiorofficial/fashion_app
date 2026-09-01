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
    const user = this.store.users.get(userId);
    return user && user.status !== "deleted" ? user : null;
  }

  async deleteAccount(userId: string): Promise<{storageKeys: string[]}> {
    const user = this.store.users.get(userId);
    if (!user) return {storageKeys: []};
    const oldPhoneNumber = user.phoneNumber;
    const storageKeys = [...this.store.assets.values()].filter((asset) => asset.userId === userId).map((asset) => asset.storageKey);
    this.store.usersByPhone.delete(oldPhoneNumber);
    Object.assign(user, {name: "Deleted user", dateOfBirth: "1900-01-01", phoneNumber: `+9${user.id.replace(/\D/g, "").padEnd(14, "0").slice(0, 14)}`, phoneVerifiedAt: null, status: "deleted", updatedAt: new Date().toISOString()});
    for (const [key, row] of this.store.sessions) if (row.userId === userId) this.store.sessions.delete(key);
    for (const [key, row] of this.store.challenges) if (row.userId === userId || row.phoneNumber === oldPhoneNumber) this.store.challenges.delete(key);
    this.store.profiles.delete(userId);
    for (const [key, row] of this.store.wardrobe) if (row.userId === userId) this.store.wardrobe.delete(key);
    for (const [key, row] of this.store.outfits) if (row.userId === userId) this.store.outfits.delete(key);
    for (const [key, row] of this.store.outfitFeedback) if (row.userId === userId) this.store.outfitFeedback.delete(key);
    for (const [key, row] of this.store.tryOnRequests) if (row.userId === userId) this.store.tryOnRequests.delete(key);
    for (const [key, row] of this.store.analysisJobs) if (row.userId === userId) this.store.analysisJobs.delete(key);
    for (const [key, row] of this.store.aiUsage) if (row.userId === userId) this.store.aiUsage.delete(key);
    for (const asset of this.store.assets.values()) if (asset.userId === userId) Object.assign(asset, {status: "deleted", deletedAt: new Date().toISOString()});
    return {storageKeys};
  }
}
