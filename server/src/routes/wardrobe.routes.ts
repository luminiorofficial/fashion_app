import {Router, type RequestHandler} from "express";
import type {Multer} from "multer";
import type {WardrobeController} from "../controllers/wardrobe.controller";

export function createWardrobeRoutes(controller: WardrobeController, authenticate: RequestHandler, upload: Multer): Router {
  const router = Router();
  router.get("/wardrobe/items", authenticate, controller.listItems);
  router.post("/wardrobe/analyze", authenticate, upload.single("image"), controller.analyzeDraft);
  router.delete("/wardrobe/drafts/:assetId", authenticate, controller.discardDraft);
  router.post("/wardrobe/items", authenticate, controller.createItem);
  router.post("/wardrobe/items/batch", authenticate, controller.createItemsBatch);
  router.post("/wardrobe/links", authenticate, controller.createLink);
  router.delete("/wardrobe/items/:itemId", authenticate, controller.deleteItem);
  return router;
}
