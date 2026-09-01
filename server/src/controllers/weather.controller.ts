import type {Request, Response} from "express";
import type {WeatherService} from "../services/weather.service";
import {latitude, longitude} from "../validators/weather.validators";

export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  get = async (request: Request, response: Response): Promise<void> => {
    const lat = latitude(request.query.lat);
    const lng = longitude(request.query.lng);
    const weather = await this.weather.getWeather(lat, lng);
    response.json({weather});
  };
}
