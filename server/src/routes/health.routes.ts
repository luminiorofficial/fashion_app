import {Router} from "express";
import type {HealthController} from "../controllers/health.controller";

export function createHealthRoutes(controller: HealthController): Router {
  const router = Router();
  router.get("/health", controller.getHealth);
  return router;
}
