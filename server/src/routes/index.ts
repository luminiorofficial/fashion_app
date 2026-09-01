import {Router, type RequestHandler} from "express";
import type {Multer} from "multer";
import {createHealthRoutes} from "./health.routes";
import {createAuthRoutes} from "./auth.routes";
import {createProfileRoutes} from "./profile.routes";
import {createWardrobeRoutes} from "./wardrobe.routes";
import {createOutfitRoutes} from "./outfit.routes";
import {createTryOnRoutes} from "./tryon.routes";
import {createWeatherRoutes} from "./weather.routes";
import type {HealthController} from "../controllers/health.controller";
import type {AuthController} from "../controllers/auth.controller";
import type {ProfileController} from "../controllers/profile.controller";
import type {WardrobeController} from "../controllers/wardrobe.controller";
import type {OutfitController} from "../controllers/outfit.controller";
import type {TryOnController} from "../controllers/tryon.controller";
import type {WeatherController} from "../controllers/weather.controller";

export interface Controllers {
  health: HealthController;
  auth: AuthController;
  profile: ProfileController;
  wardrobe: WardrobeController;
  outfit: OutfitController;
  tryon: TryOnController;
  weather: WeatherController;
}

export interface RouteSecurity {
  requestOtp: RequestHandler[];
  verifyOtp: RequestHandler[];
  profileAnalysis: RequestHandler[];
  wardrobeAnalysis: RequestHandler[];
  outfitGeneration: RequestHandler[];
  virtualTryon: RequestHandler[];
}

// Composes every domain's routes into the single router app.ts mounts at
// /api/v1. Each domain router stays small (see routes/*.routes.ts) —
// method + path + middleware only, no logic.
export function createApiRouter(controllers: Controllers, authenticate: RequestHandler, upload: Multer, security: RouteSecurity): Router {
  const router = Router();
  router.use(createHealthRoutes(controllers.health));
  router.use(createAuthRoutes(controllers.auth, authenticate, security));
  router.use(createProfileRoutes(controllers.profile, authenticate, upload, security));
  router.use(createWardrobeRoutes(controllers.wardrobe, authenticate, upload, security));
  router.use(createOutfitRoutes(controllers.outfit, authenticate, security));
  router.use(createTryOnRoutes(controllers.tryon, authenticate, security));
  router.use(createWeatherRoutes(controllers.weather, authenticate));
  return router;
}
