class WeatherSummary {
  const WeatherSummary({
    required this.temperatureC,
    required this.feelsLikeC,
    required this.humidityPercent,
    required this.rainProbabilityPercent,
    required this.condition,
    required this.windKph,
  });

  factory WeatherSummary.fromJson(Map<String, dynamic> json) => WeatherSummary(
    temperatureC: (json['temperatureC'] as num).toDouble(),
    feelsLikeC: (json['feelsLikeC'] as num).toDouble(),
    humidityPercent: (json['humidityPercent'] as num).round(),
    rainProbabilityPercent: (json['rainProbabilityPercent'] as num).round(),
    condition: json['condition'] as String,
    windKph: (json['windKph'] as num).toDouble(),
  );

  final double temperatureC;
  final double feelsLikeC;
  final int humidityPercent;
  final int rainProbabilityPercent;
  final String condition;
  final double windKph;
}
