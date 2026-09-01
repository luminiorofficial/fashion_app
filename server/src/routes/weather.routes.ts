import {Router, type RequestHandler} from "express";
import type {WeatherController} from "../controllers/weather.controller";

export function createWeatherRoutes(controller: WeatherController, authenticate: RequestHandler): Router {
  const router = Router();
  router.get("/weather", authenticate, controller.get);
  return router;
}
