import {Router, type RequestHandler} from "express";
import type {AuthController} from "../controllers/auth.controller";
import type {RouteSecurity} from ".";

export function createAuthRoutes(controller: AuthController, authenticate: RequestHandler, security: RouteSecurity): Router {
  const router = Router();
  router.post("/auth/otp/request", ...security.requestOtp, controller.requestOtp);
  router.post("/auth/otp/verify", ...security.verifyOtp, controller.verifyOtp);
  router.get("/me", authenticate, controller.getCurrentUser);
  router.post("/auth/logout", authenticate, controller.logout);
  router.delete("/account", authenticate, controller.deleteAccount);
  return router;
}
