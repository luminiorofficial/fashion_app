import {MemoryStore} from "../../memory-store";
import type {ProfilesRepository} from "../../../types/repositories";
import type {StyleProfile, SaveProfileInput} from "../../../types/profile.types";

export class MemoryProfilesRepository implements ProfilesRepository {
  constructor(private readonly store: MemoryStore) {}

  async saveProfile(userId: string, profile: SaveProfileInput): Promise<StyleProfile> {
    const value: StyleProfile = {...profile, userId, updatedAt: new Date().toISOString()};
    this.store.profiles.set(userId, value);
    return value;
  }

  async getProfile(userId: string): Promise<StyleProfile> {
    return this.store.profiles.get(userId) ?? {};
  }
}
