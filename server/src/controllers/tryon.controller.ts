import type {Request, Response} from "express";
import type {TryOnService} from "../services/tryon.service";

export class TryOnController {
  constructor(private readonly tryon: TryOnService) {}

  generate = async (request: Request, response: Response): Promise<void> => {
    const tryOn = await this.tryon.generate(request.auth!.user.id, request.body?.wardrobeItemIds, request.body?.outfitId);
    response.status(201).json({tryOn});
  };

  save = async (request: Request, response: Response): Promise<void> => {
    const tryOn = await this.tryon.saveTryOn(request.auth!.user.id, request.params.id as string);
    response.json({tryOn});
  };

  listSaved = async (request: Request, response: Response): Promise<void> => {
    const tryOns = await this.tryon.listSaved(request.auth!.user.id);
    response.json({tryOns});
  };

  unsave = async (request: Request, response: Response): Promise<void> => {
    const tryOn = await this.tryon.unsaveTryOn(request.auth!.user.id, request.params.id as string);
    response.json({tryOn});
  };
}
