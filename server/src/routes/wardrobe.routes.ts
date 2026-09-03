import {Router, type RequestHandler} from "express";
import type {Multer} from "multer";
import type {WardrobeController} from "../controllers/wardrobe.controller";
import type {RouteSecurity} from ".";

export function createWardrobeRoutes(controller: WardrobeController, authenticate: RequestHandler, upload: Multer, security: RouteSecurity): Router {
  const router = Router();
  router.get("/wardrobe/items", authenticate, controller.listItems);
  router.post("/wardrobe/analyze", authenticate, upload.single("image"), ...security.wardrobeAnalysis, controller.analyzeDraft);
  router.delete("/wardrobe/drafts/:assetId", authenticate, controller.discardDraft);
  router.post("/wardrobe/items", authenticate, controller.createItem);
  router.post("/wardrobe/items/batch", authenticate, controller.createItemsBatch);
  router.post("/wardrobe/links", authenticate, controller.createLink);
  router.post("/wardrobe/items/:itemId/viewed", authenticate, controller.markItemViewed);
  router.delete("/wardrobe/items/:itemId", authenticate, controller.deleteItem);
  return router;
}
