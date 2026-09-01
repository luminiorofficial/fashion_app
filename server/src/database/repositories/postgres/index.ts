import type {Pool} from "pg";
import type {AppConfig} from "../../../config/env";
import {createPool, connectPool, poolHealth} from "../../postgres";
import type {Repositories} from "../../../types/repositories";
import {PostgresUsersRepository} from "./users.repository";
import {PostgresSessionsRepository} from "./sessions.repository";
import {PostgresOtpRepository} from "./otp.repository";
import {PostgresAssetsRepository} from "./assets.repository";
import {PostgresProfilesRepository} from "./profiles.repository";
import {PostgresWardrobeRepository} from "./wardrobe.repository";
import {PostgresOutfitsRepository} from "./outfits.repository";
import {PostgresTryOnRepository} from "./tryon.repository";
import {PostgresSecurityRepository} from "./security.repository";

export interface PostgresRepositories extends Repositories {
  readonly pool: Pool;
  connect(): Promise<{database: string; username: string}>;
}

export function createPostgresRepositories(config: Pick<AppConfig, "databaseUrl" | "databasePoolMax" | "databaseSsl" | "databaseSslRejectUnauthorized">): PostgresRepositories {
  const pool = createPool(config);
  return {
    pool,
    users: new PostgresUsersRepository(pool),
    sessions: new PostgresSessionsRepository(pool),
    otp: new PostgresOtpRepository(pool),
    assets: new PostgresAssetsRepository(pool),
    profiles: new PostgresProfilesRepository(pool),
    wardrobe: new PostgresWardrobeRepository(pool),
    outfits: new PostgresOutfitsRepository(pool),
    tryon: new PostgresTryOnRepository(pool),
    security: new PostgresSecurityRepository(pool),
    connect: () => connectPool(pool),
    health: () => poolHealth(pool),
    close: async () => {
      await pool.end();
    },
  };
}

// Exposed for tests that want to construct one domain repository directly
// against a fake pool-like object, without a real DATABASE_URL.
export {PostgresUsersRepository, PostgresSessionsRepository, PostgresOtpRepository, PostgresAssetsRepository, PostgresProfilesRepository, PostgresWardrobeRepository, PostgresOutfitsRepository, PostgresTryOnRepository, PostgresSecurityRepository};
