import {ApiError} from "../../utils/api-error";
import type {AppConfig} from "../../config/env";
import type {WeatherProvider} from "../../types/provider.types";
import type {WeatherSummary} from "../../types/weather.types";

export type OpenMeteoConfig = Pick<AppConfig, "weatherApiBaseUrl" | "weatherRequestTimeoutMs">;

interface OpenMeteoResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  hourly?: {
    time?: string[];
    precipitation_probability?: number[];
  };
}

// WMO weather interpretation codes (used by Open-Meteo's weather_code
// field): https://open-meteo.com/en/docs#weathervariables
const WEATHER_CODE_CONDITIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light rain showers",
  81: "Rain showers",
  82: "Violent rain showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

function conditionForCode(code: number | undefined): string {
  if (typeof code !== "number") return "Unknown";
  return WEATHER_CODE_CONDITIONS[code] || "Unknown";
}

// precipitation_probability is only available on Open-Meteo's hourly
// block, not `current`, so the "now" figure is looked up by matching the
// current reading's hour against the hourly time series.
function rainProbabilityForNow(currentTime: string | undefined, hourly: OpenMeteoResponse["hourly"]): number {
  const times = hourly?.time || [];
  const probabilities = hourly?.precipitation_probability || [];
  if (!currentTime || !times.length) return 0;
  const currentHour = currentTime.slice(0, 13);
  const index = times.findIndex((time) => time.slice(0, 13) === currentHour);
  const value = probabilities[index === -1 ? 0 : index];
  return typeof value === "number" ? Math.round(value) : 0;
}

// Free, keyless weather provider (https://open-meteo.com). Coordinates
// passed in are expected to already be rounded by the caller (see
// WeatherService) — this provider just forwards them.
export class OpenMeteoWeatherProvider implements WeatherProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: OpenMeteoConfig) {
    this.baseUrl = config.weatherApiBaseUrl;
    this.timeoutMs = config.weatherRequestTimeoutMs;
  }

  async getCurrentWeather(lat: number, lng: number): Promise<WeatherSummary> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("latitude", lat.toFixed(2));
    url.searchParams.set("longitude", lng.toFixed(2));
    url.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m");
    url.searchParams.set("hourly", "precipitation_probability");
    url.searchParams.set("forecast_days", "1");
    url.searchParams.set("timezone", "auto");

    let response: Response;
    try {
      response = await fetch(url, {signal: AbortSignal.timeout(this.timeoutMs)});
    } catch {
      throw new ApiError(504, "WEATHER_TIMEOUT", "The weather service timed out.");
    }
    if (!response.ok) throw new ApiError(502, "WEATHER_UNAVAILABLE", "The weather service could not process the request.");

    let payload: OpenMeteoResponse;
    try {
      payload = await response.json() as OpenMeteoResponse;
    } catch {
      throw new ApiError(502, "WEATHER_UNAVAILABLE", "The weather service returned an invalid result.");
    }

    const current = payload.current;
    if (!current || typeof current.temperature_2m !== "number") {
      throw new ApiError(502, "WEATHER_UNAVAILABLE", "The weather service returned an invalid result.");
    }

    return {
      temperatureC: Math.round(current.temperature_2m),
      feelsLikeC: Math.round(current.apparent_temperature ?? current.temperature_2m),
      humidityPercent: Math.round(current.relative_humidity_2m ?? 0),
      rainProbabilityPercent: rainProbabilityForNow(current.time, payload.hourly),
      condition: conditionForCode(current.weather_code),
      windKph: Math.round(current.wind_speed_10m ?? 0),
    };
  }
}
