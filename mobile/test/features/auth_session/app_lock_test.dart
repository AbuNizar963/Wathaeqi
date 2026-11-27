import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/features/auth_session/app_lock.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets(
    'mandatory PIN setup dialog stays scrollable on a compact screen',
    (tester) async {
      tester.view.physicalSize = const Size(320, 480);
      tester.view.devicePixelRatio = 1;
      tester.view.viewInsets = const FakeViewPadding(bottom: 240);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetViewInsets);

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () {
                    showMandatoryPinSetupDialog(context);
                  },
                  child: const Text('Open PIN dialog'),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Open PIN dialog'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));

      expect(find.text('إنشاء رمز PIN إلزامي'), findsOneWidget);
      expect(find.byType(SingleChildScrollView), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  test('locks PIN verification after five consecutive failures', () async {
    await AppLockService.savePin('2468');

    for (var attempt = 0; attempt < 4; attempt++) {
      expect(await AppLockService.verifyPin('0000'), isFalse);
      expect(await AppLockService.pinLockRemaining(), Duration.zero);
    }

    expect(await AppLockService.verifyPin('0000'), isFalse);
    expect(await AppLockService.pinLockRemaining(), isNot(Duration.zero));

    // A correct PIN cannot bypass an active lockout.
    expect(await AppLockService.verifyPin('2468'), isFalse);
  });

  test('a successful PIN resets the accumulated failure count', () async {
    await AppLockService.savePin('2468');

    for (var attempt = 0; attempt < 4; attempt++) {
      expect(await AppLockService.verifyPin('0000'), isFalse);
    }

    expect(await AppLockService.verifyPin('2468'), isTrue);

    for (var attempt = 0; attempt < 4; attempt++) {
      expect(await AppLockService.verifyPin('0000'), isFalse);
      expect(await AppLockService.pinLockRemaining(), Duration.zero);
    }

    expect(await AppLockService.verifyPin('0000'), isFalse);
    expect(await AppLockService.pinLockRemaining(), isNot(Duration.zero));
  });

  test('rejects PIN values that are not exactly four digits', () async {
    await expectLater(
      AppLockService.savePin('123'),
      throwsA(isA<FormatException>()),
    );
    await expectLater(
      AppLockService.savePin('12a4'),
      throwsA(isA<FormatException>()),
    );
  });
}
