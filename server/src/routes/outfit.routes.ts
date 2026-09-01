import {Router, type RequestHandler} from "express";
import type {OutfitController} from "../controllers/outfit.controller";
import type {RouteSecurity} from ".";

export function createOutfitRoutes(controller: OutfitController, authenticate: RequestHandler, security: RouteSecurity): Router {
  const router = Router();
  router.post("/outfits/generate", authenticate, ...security.outfitGeneration, controller.generate);
  router.get("/outfits", authenticate, controller.list);
  router.post("/outfits/:outfitId/feedback", authenticate, controller.recordFeedback);
  router.post("/outfits/:outfitId/wear", authenticate, controller.markWorn);
  return router;
}
