import type {AppConfig} from "../../config/env";
import type {Repositories} from "../../types/repositories";
import {createMemoryRepositories} from "./memory";
import {createPostgresRepositories, type PostgresRepositories} from "./postgres";
import {assertRepositoriesContract} from "./contract";

export {createMemoryRepositories} from "./memory";
export {createPostgresRepositories, type PostgresRepositories} from "./postgres";
export {assertRepositoriesContract, repositoryContracts} from "./contract";

export function isPostgresRepositories(repositories: Repositories): repositories is PostgresRepositories {
  return "pool" in repositories && "connect" in repositories;
}

// Picks the Postgres or in-memory implementation based on whether
// DATABASE_URL is configured — mirroring the original
// `config.databaseUrl ? new PostgresRepository(config) : new InMemoryRepository()`
// branch — and verifies the result satisfies every domain's contract
// before it's handed to the rest of the app.
export function createRepositories(config: AppConfig): Repositories {
  const repositories = config.databaseUrl ? createPostgresRepositories(config) : createMemoryRepositories();
  assertRepositoriesContract(repositories);
  return repositories;
}
