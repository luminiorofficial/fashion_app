import {Router, type RequestHandler} from "express";
import type {CommerceController} from "../controllers/commerce.controller";
import type {RouteSecurity} from ".";

export function createCommerceRoutes(controller: CommerceController, authenticate: RequestHandler, security: RouteSecurity): Router {
  const router = Router();
  router.post("/commerce/gmail/connect", authenticate, controller.connectGmail);
  // No `authenticate`: Google redirects the user's browser here directly,
  // with no bearer token available — the user is identified via the
  // signed `state` param instead (see GmailOAuthService).
  router.get("/commerce/gmail/oauth/callback", ...security.gmailOAuthCallback, controller.oauthCallback);
  router.get("/commerce/gmail/status", authenticate, controller.gmailStatus);
  router.post("/commerce/gmail/sync", authenticate, ...security.gmailSync, controller.syncGmail);
  router.delete("/commerce/gmail/connection", authenticate, controller.disconnectGmail);
  router.get("/commerce/purchases", authenticate, controller.listPurchases);
  router.post("/commerce/purchases/:purchaseId/add-to-wardrobe", authenticate, controller.addPurchaseToWardrobe);
  router.post("/commerce/purchases/:purchaseId/ignore", authenticate, controller.ignorePurchase);
  return router;
}
