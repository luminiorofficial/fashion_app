import 'package:fashion_app/models/nera_models.dart';
import 'package:fashion_app/services/location_service.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeLocationGateway implements LocationGateway {
  _FakeLocationGateway({
    this.serviceEnabled = true,
    this.checkedPermission = AppLocationPermission.whileInUse,
    this.requestedPermission = AppLocationPermission.whileInUse,
    this.positionError,
  });

  bool serviceEnabled;
  AppLocationPermission checkedPermission;
  AppLocationPermission requestedPermission;
  Object? positionError;
  int permissionRequests = 0;
  int positionRequests = 0;

  @override
  Future<AppLocationPermission> checkPermission() async => checkedPermission;

  @override
  Future<LocationCoordinates> getCurrentPosition(Duration timeout) async {
    positionRequests += 1;
    if (positionError != null) throw positionError!;
    return const LocationCoordinates(latitude: 12.9716, longitude: 77.5946);
  }

  @override
  Future<bool> isServiceEnabled() async => serviceEnabled;

  @override
  Future<AppLocationPermission> requestPermission() async {
    permissionRequests += 1;
    return requestedPermission;
  }
}

void main() {
  test('returns and caches a foreground location', () async {
    final gateway = _FakeLocationGateway();
    final service = LocationService(gateway: gateway);

    final first = await service.getCurrentLocation();
    final second = await service.getCurrentLocation();

    expect(first.status, LocationAccessStatus.available);
    expect(first.coordinates?.latitude, 12.9716);
    expect(second.coordinates, same(first.coordinates));
    expect(gateway.permissionRequests, 0);
    expect(gateway.positionRequests, 1);
  });

  test('requests permission once and handles denial', () async {
    final gateway = _FakeLocationGateway(
      checkedPermission: AppLocationPermission.denied,
      requestedPermission: AppLocationPermission.denied,
    );
    final service = LocationService(gateway: gateway);

    expect(
      (await service.getCurrentLocation()).status,
      LocationAccessStatus.denied,
    );
    expect(
      (await service.getCurrentLocation()).status,
      LocationAccessStatus.denied,
    );
    expect(gateway.permissionRequests, 1);
    expect(gateway.positionRequests, 0);
  });

  test('handles permanently denied permission', () async {
    final gateway = _FakeLocationGateway(
      checkedPermission: AppLocationPermission.deniedForever,
    );

    final result = await LocationService(gateway: gateway).getCurrentLocation();

    expect(result.status, LocationAccessStatus.deniedForever);
    expect(gateway.permissionRequests, 0);
    expect(gateway.positionRequests, 0);
  });

  test('handles disabled location services', () async {
    final gateway = _FakeLocationGateway(serviceEnabled: false);

    final result = await LocationService(gateway: gateway).getCurrentLocation();

    expect(result.status, LocationAccessStatus.servicesDisabled);
    expect(gateway.permissionRequests, 0);
    expect(gateway.positionRequests, 0);
  });

  test('turns GPS failures into an unavailable result', () async {
    final gateway = _FakeLocationGateway(positionError: Exception('no fix'));

    final result = await LocationService(gateway: gateway).getCurrentLocation();

    expect(result.status, LocationAccessStatus.unavailable);
  });
}
