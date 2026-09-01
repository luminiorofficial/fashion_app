import type {Request, Response} from "express";
import type {WardrobeService} from "../services/wardrobe.service";

export class WardrobeController {
  constructor(private readonly wardrobe: WardrobeService) {}

  listItems = async (request: Request, response: Response): Promise<void> => {
    const items = await this.wardrobe.listWardrobe(request.auth!.user.id);
    response.json({items});
  };

  analyzeDraft = async (request: Request, response: Response): Promise<void> => {
    const draft = await this.wardrobe.analyzeDraft(request.auth!.user.id, request.file);
    response.status(201).json({draft});
  };

  discardDraft = async (request: Request, response: Response): Promise<void> => {
    await this.wardrobe.discardDraft(request.auth!.user.id, request.params.assetId as string);
    response.sendStatus(204);
  };

  createItem = async (request: Request, response: Response): Promise<void> => {
    const item = await this.wardrobe.createWardrobeItem(request.auth!.user.id, request.body || {});
    response.status(201).json({item});
  };

  createItemsBatch = async (request: Request, response: Response): Promise<void> => {
    const rawItems = Array.isArray(request.body?.items) ? request.body.items : [];
    const items = await this.wardrobe.createWardrobeItemsBatch(request.auth!.user.id, rawItems);
    response.status(201).json({items});
  };

  createLink = async (request: Request, response: Response): Promise<void> => {
    const item = await this.wardrobe.createWardrobeLink(request.auth!.user.id, request.body || {});
    response.status(201).json({item});
  };

  deleteItem = async (request: Request, response: Response): Promise<void> => {
    await this.wardrobe.deleteWardrobeItem(request.auth!.user.id, request.params.itemId as string);
    response.sendStatus(204);
  };
}
