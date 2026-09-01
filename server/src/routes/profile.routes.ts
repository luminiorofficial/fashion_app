import {Router, type RequestHandler} from "express";
import type {Multer} from "multer";
import type {ProfileController} from "../controllers/profile.controller";
import type {RouteSecurity} from ".";

export function createProfileRoutes(controller: ProfileController, authenticate: RequestHandler, upload: Multer, security: RouteSecurity): Router {
  const router = Router();
  router.get("/profile", authenticate, controller.getProfile);
  router.post("/profile/analyze", authenticate, upload.single("image"), ...security.profileAnalysis, controller.analyzeProfile);
  return router;
}
