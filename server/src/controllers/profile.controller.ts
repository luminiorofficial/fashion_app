import type {Request, Response} from "express";
import type {ProfileService} from "../services/profile.service";

export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  getProfile = async (request: Request, response: Response): Promise<void> => {
    const profile = await this.profile.getProfile(request.auth!.user.id);
    response.json({profile});
  };

  analyzeProfile = async (request: Request, response: Response): Promise<void> => {
    const result = await this.profile.analyzeProfile(request.auth!.user.id, request.file);
    response.status(201).json(result);
  };
}
