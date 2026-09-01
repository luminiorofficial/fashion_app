import 'package:geolocator/geolocator.dart' as geolocator;

import '../models/nera_models.dart';

enum LocationAccessStatus {
  available,
  denied,
  deniedForever,
  servicesDisabled,
  unavailable,
}

enum AppLocationPermission { denied, deniedForever, whileInUse, always }

class LocationResult {
  const LocationResult._(this.status, this.coordinates);

  const LocationResult.available(LocationCoordinates coordinates)
    : this._(LocationAccessStatus.available, coordinates);

  const LocationResult.failure(this.status)
    : assert(status != LocationAccessStatus.available),
      coordinates = null;

  final LocationAccessStatus status;
  final LocationCoordinates? coordinates;
}

abstract interface class LocationGateway {
  Future<bool> isServiceEnabled();
  Future<AppLocationPermission> checkPermission();
  Future<AppLocationPermission> requestPermission();
  Future<LocationCoordinates> getCurrentPosition(Duration timeout);
}

class LocationService {
  LocationService({
    LocationGateway? gateway,
    this.cacheDuration = const Duration(minutes: 15),
    this.positionTimeout = const Duration(seconds: 10),
  }) : _gateway = gateway ?? const GeolocatorLocationGateway();

  final LocationGateway _gateway;
  final Duration cacheDuration;
  final Duration positionTimeout;
  LocationResult? _cachedResult;
  DateTime? _cachedAt;
  Future<LocationResult>? _inFlight;

  Future<LocationResult> getCurrentLocation() {
    final cachedAt = _cachedAt;
    if (_cachedResult != null &&
        cachedAt != null &&
        DateTime.now().difference(cachedAt) < cacheDuration) {
      return Future.value(_cachedResult);
    }

    final pending = _inFlight;
    if (pending != null) return pending;
    final request = _resolveLocation();
    _inFlight = request;
    return request.whenComplete(() {
      if (identical(_inFlight, request)) _inFlight = null;
    });
  }

  Future<LocationResult> _resolveLocation() async {
    LocationResult result;
    try {
      if (!await _gateway.isServiceEnabled()) {
        result = const LocationResult.failure(
          LocationAccessStatus.servicesDisabled,
        );
      } else {
        var permission = await _gateway.checkPermission();
        if (permission == AppLocationPermission.denied) {
          permission = await _gateway.requestPermission();
        }

        if (permission == AppLocationPermission.denied) {
          result = const LocationResult.failure(LocationAccessStatus.denied);
        } else if (permission == AppLocationPermission.deniedForever) {
          result = const LocationResult.failure(
            LocationAccessStatus.deniedForever,
          );
        } else {
          result = LocationResult.available(
            await _gateway.getCurrentPosition(positionTimeout),
          );
        }
      }
    } on geolocator.LocationServiceDisabledException {
      result = const LocationResult.failure(
        LocationAccessStatus.servicesDisabled,
      );
    } on Object {
      result = const LocationResult.failure(LocationAccessStatus.unavailable);
    }

    _cachedResult = result;
    _cachedAt = DateTime.now();
    return result;
  }
}

class GeolocatorLocationGateway implements LocationGateway {
  const GeolocatorLocationGateway();

  @override
  Future<AppLocationPermission> checkPermission() async =>
      _mapPermission(await geolocator.Geolocator.checkPermission());

  @override
  Future<LocationCoordinates> getCurrentPosition(Duration timeout) async {
    final position = await geolocator.Geolocator.getCurrentPosition(
      locationSettings: geolocator.LocationSettings(
        accuracy: geolocator.LocationAccuracy.low,
        timeLimit: timeout,
      ),
    );
    return LocationCoordinates(
      latitude: position.latitude,
      longitude: position.longitude,
    );
  }

  @override
  Future<bool> isServiceEnabled() =>
      geolocator.Geolocator.isLocationServiceEnabled();

  @override
  Future<AppLocationPermission> requestPermission() async =>
      _mapPermission(await geolocator.Geolocator.requestPermission());

  static AppLocationPermission _mapPermission(
    geolocator.LocationPermission permission,
  ) => switch (permission) {
    geolocator.LocationPermission.denied => AppLocationPermission.denied,
    geolocator.LocationPermission.deniedForever =>
      AppLocationPermission.deniedForever,
    geolocator.LocationPermission.whileInUse =>
      AppLocationPermission.whileInUse,
    geolocator.LocationPermission.always => AppLocationPermission.always,
    geolocator.LocationPermission.unableToDetermine =>
      AppLocationPermission.denied,
  };
}
