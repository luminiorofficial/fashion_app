// Compact, display-ready weather snapshot. Deliberately excludes the
// coordinates it was fetched for — callers key any caching off the
// (rounded) request coordinates themselves, never off this value.
export interface WeatherSummary {
  temperatureC: number;
  feelsLikeC: number;
  humidityPercent: number;
  rainProbabilityPercent: number;
  condition: string;
  windKph: number;
}
