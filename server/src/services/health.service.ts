import type {DatabaseHealth, Repositories} from "../types/repositories";

export interface HealthResult {
  status: "ok";
  database: DatabaseHealth;
  timestamp: string;
}

export class HealthService {
  constructor(private readonly repositories: Pick<Repositories, "health">) {}

  async getHealth(): Promise<HealthResult> {
    const database = await this.repositories.health();
    return {status: "ok", database, timestamp: new Date().toISOString()};
  }
}
