import {Router, type RequestHandler} from "express";
import type {AuthController} from "../controllers/auth.controller";

export function createAuthRoutes(controller: AuthController, authenticate: RequestHandler): Router {
  const router = Router();
  router.post("/auth/otp/request", controller.requestOtp);
  router.post("/auth/otp/verify", controller.verifyOtp);
  router.get("/me", authenticate, controller.getCurrentUser);
  router.post("/auth/logout", authenticate, controller.logout);
  return router;
}
