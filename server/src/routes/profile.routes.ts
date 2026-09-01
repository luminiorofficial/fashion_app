import {Router, type RequestHandler} from "express";
import type {Multer} from "multer";
import type {ProfileController} from "../controllers/profile.controller";

export function createProfileRoutes(controller: ProfileController, authenticate: RequestHandler, upload: Multer): Router {
  const router = Router();
  router.get("/profile", authenticate, controller.getProfile);
  router.post("/profile/analyze", authenticate, upload.single("image"), controller.analyzeProfile);
  return router;
}
