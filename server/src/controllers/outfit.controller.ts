import type {Request, Response} from "express";
import type {OutfitService} from "../services/outfit.service";
import {optionalCoordinates} from "../validators/weather.validators";

export class OutfitController {
  constructor(private readonly outfit: OutfitService) {}

  generate = async (request: Request, response: Response): Promise<void> => {
    const coords = optionalCoordinates(request.body?.lat, request.body?.lng);
    const outfit = await this.outfit.generateOutfit(request.auth!.user.id, request.body?.eventType, coords);
    response.status(201).json({outfit});
  };

  list = async (request: Request, response: Response): Promise<void> => {
    const outfits = await this.outfit.listOutfits(request.auth!.user.id);
    response.json({outfits});
  };

  recordFeedback = async (request: Request, response: Response): Promise<void> => {
    const feedback = await this.outfit.recordFeedback(request.auth!.user.id, request.params.outfitId as string, request.body?.reaction);
    response.status(200).json({feedback});
  };

  markWorn = async (request: Request, response: Response): Promise<void> => {
    const feedback = await this.outfit.markWorn(request.auth!.user.id, request.params.outfitId as string);
    response.status(200).json({feedback});
  };
}
