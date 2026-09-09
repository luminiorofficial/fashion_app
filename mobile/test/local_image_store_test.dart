import 'dart:io';
import 'dart:typed_data';

import 'package:fashion_app/services/local_image_store.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory sandbox;
  late LocalImageStore store;

  setUp(() async {
    sandbox = await Directory.systemTemp.createTemp('nera_local_images_');
    store = LocalImageStore(documentsDirectory: () async => sandbox);
  });

  tearDown(() async {
    if (await sandbox.exists()) await sandbox.delete(recursive: true);
  });

  test('saves and deletes a wardrobe image inside the app directory', () async {
    final filePath = await store.saveWardrobeImage(
      userId: 'user_1',
      itemId: 'item-1',
      bytes: Uint8List.fromList([1, 2, 3]),
    );

    expect(await File(filePath).readAsBytes(), [1, 2, 3]);
    await store.delete(filePath);
    expect(await File(filePath).exists(), isFalse);
  });

  test('does not delete a file outside the NERA image directory', () async {
    final outside = File('${sandbox.path}${Platform.pathSeparator}outside.jpg');
    await outside.writeAsBytes([1]);

    await store.delete(outside.path);

    expect(await outside.exists(), isTrue);
  });
}
