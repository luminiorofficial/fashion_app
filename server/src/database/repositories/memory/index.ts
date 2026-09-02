import {MemoryStore} from "../../memory-store";
import type {Repositories} from "../../../types/repositories";
import {MemoryUsersRepository} from "./users.repository";
import {MemorySessionsRepository} from "./sessions.repository";
import {MemoryOtpRepository} from "./otp.repository";
import {MemoryAssetsRepository} from "./assets.repository";
import {MemoryProfilesRepository} from "./profiles.repository";
import {MemoryWardrobeRepository} from "./wardrobe.repository";
import {MemoryOutfitsRepository} from "./outfits.repository";
import {MemoryTryOnRepository} from "./tryon.repository";
import {MemorySecurityRepository} from "./security.repository";
import {MemoryGmailRepository} from "./gmail.repository";
import {MemoryPurchaseImportsRepository} from "./purchase-imports.repository";

export function createMemoryRepositories(): Repositories {
  const store = new MemoryStore();
  return {
    users: new MemoryUsersRepository(store),
    sessions: new MemorySessionsRepository(store),
    otp: new MemoryOtpRepository(store),
    assets: new MemoryAssetsRepository(store),
    profiles: new MemoryProfilesRepository(store),
    wardrobe: new MemoryWardrobeRepository(store),
    outfits: new MemoryOutfitsRepository(store),
    tryon: new MemoryTryOnRepository(store),
    security: new MemorySecurityRepository(store),
    gmail: new MemoryGmailRepository(store),
    purchaseImports: new MemoryPurchaseImportsRepository(store),
    async health() {
      return {status: "ok", adapter: "memory"};
    },
    async close() {},
  };
}
