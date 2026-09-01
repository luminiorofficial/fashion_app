import {Router, type RequestHandler} from "express";
import type {TryOnController} from "../controllers/tryon.controller";
import type {RouteSecurity} from ".";

export function createTryOnRoutes(controller: TryOnController, authenticate: RequestHandler, security: RouteSecurity): Router {
  const router = Router();
  router.post("/tryon/generate", authenticate, ...security.virtualTryon, controller.generate);
  router.post("/tryon/:id/save", authenticate, controller.save);
  router.get("/tryon/saved", authenticate, controller.listSaved);
  router.post("/tryon/:id/unsave", authenticate, controller.unsave);
  return router;
}
