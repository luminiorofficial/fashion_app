import {Router, type RequestHandler} from "express";
import type {OutfitController} from "../controllers/outfit.controller";

export function createOutfitRoutes(controller: OutfitController, authenticate: RequestHandler): Router {
  const router = Router();
  router.post("/outfits/generate", authenticate, controller.generate);
  router.get("/outfits", authenticate, controller.list);
  router.post("/outfits/:outfitId/feedback", authenticate, controller.recordFeedback);
  router.post("/outfits/:outfitId/wear", authenticate, controller.markWorn);
  return router;
}
