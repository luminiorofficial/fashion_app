import type {Request, Response} from "express";
import type {HealthService} from "../services/health.service";

export class HealthController {
  constructor(private readonly health: HealthService) {}

  getHealth = async (_request: Request, response: Response): Promise<void> => {
    const result = await this.health.getHealth();
    response.json(result);
  };
}
