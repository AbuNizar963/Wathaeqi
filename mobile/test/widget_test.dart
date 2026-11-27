import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/app_theme.dart';
import 'package:police_telegrams/features/auth_session/app_lock.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/features/telegrams/documents/official_telegram_document.dart';
import 'package:police_telegrams/main.dart';
import 'package:police_telegrams/mobile_pages.dart' show DepartmentSettingsPage;
import 'package:police_telegrams/features/platform_settings/platform_document_settings_page.dart';
import 'package:police_telegrams/features/notifications/push_notifications.dart';
import 'package:police_telegrams/telegram_outbox.dart';

const _telegramSubject = 'وضع الحراسة اللازمة على السجين علي قوجه';

final _secureStorageForTest = <String, String>{};

void _seedExistingPin() {
  _secureStorageForTest['mobile_app_lock_pin'] = '1234';
  _secureStorageForTest['mobile_app_lock_enabled'] = 'true';
}

final _testPng = Uint8List.fromList(
  base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=',
  ),
);

Map<String, dynamic> _sampleTelegram() => {
  'id': 7,
  'organizationSerialCode': 'UNIT-00072',
  'serialCode': 'POL-2026-09-30-00690',
  'subject': _telegramSubject,
  'senderOrganizationName': 'قسم شرطة الشهباء',
  'recipient': 'قيادة الأمن الداخلي في محافظة حلب',
  'body': 'نص اختبار للبرقية.',
  'status': 'draft',
  'priority': 'normal',
  'classification': 'normal',
  'category': 'administrative',
  'createdAt': '2026-10-15T14:22:00.000Z',
  'verificationToken': 'test-verification-token',
  'organizationId': 'org-1',
  'currentOrganizationId': 'org-1',
  'creatorName': 'مشغل النظام',
};

void _setMobileViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(390, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> _pumpDashboardFrames(
  WidgetTester tester, {
  int frameCount = 6,
}) async {
  for (var frame = 0; frame < frameCount; frame++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Finder _appLockPinField() => find.byWidgetPredicate((widget) {
  if (widget is! TextField) return false;
  final label = widget.decoration?.labelText;
  return label == 'رمز PIN (4 أرقام)' || label == 'رمز PIN السابق';
});

Future<void> _scrollIntoView(WidgetTester tester, Finder target) async {
  final scrollable = find.byType(Scrollable).first;
  await tester.scrollUntilVisible(target, 180, scrollable: scrollable);
  await tester.ensureVisible(target);
  await _pumpDashboardFrames(tester, frameCount: 3);
}

class _TestPoliceApi extends PoliceApi {
  _TestPoliceApi({
    this.signedIn = false,
    this.organizationLogoUrl,
    this.resolvedOrganizationLogoUrl,
    this.apiLogoFallbackAvailable = false,
  });

  final bool signedIn;
  final String? organizationLogoUrl;
  final String? resolvedOrganizationLogoUrl;
  final bool apiLogoFallbackAvailable;
  final calls = <String, Map<String, dynamic>?>{};
  bool logoutCalled = false;

  @override
  Future<void> logout() async {
    logoutCalled = true;
  }

  @override
  Future<Map<String, dynamic>?> restoreSession() async => signedIn
      ? {
          'id': 1,
          'name': 'مشغل النظام',
          'role': 'admin',
          'organizationId': 'org-1',
        }
      : null;

  @override
  Future<void> cacheDashboard({
    required Map<String, dynamic> stats,
    required List<dynamic> telegrams,
  }) async {}

  @override
  Future<Map<String, dynamic>?> readCachedDashboard() async => null;

  @override
  Future<dynamic> call(
    String procedure, {
    Map<String, dynamic>? input,
    bool mutation = false,
    bool allowOfflineCache = true,
  }) async {
    calls[procedure] = input;
    return switch (procedure) {
      'dashboard.stats' => {
        'total': 6,
        'incoming': 2,
        'outgoing': 4,
        'urgent': 1,
        'pending': 2,
        'resolved': 3,
        'today': 4,
        'todayUrgent': 1,
        'todayIncoming': 2,
        'inProgress': 2,
        'urgentAwaitingReceipt': 0,
      },
      'organizations.context' => {
        'organizationId': 'org-1',
        'organizationName': 'إدارة الاختبار',
        'role': 'organization_admin',
      },
      'organizations.logo' => {
        'organizationId': input?['organizationId'],
        'logoUrl': resolvedOrganizationLogoUrl ?? organizationLogoUrl,
      },
      'organizations.logoForExport' => {
        'organizationId': input?['organizationId'],
        'logoUrl':
            resolvedOrganizationLogoUrl ??
            organizationLogoUrl ??
            '/api/storage/department/logos/org-1/logo.png',
      },
      'telegrams.list' => {
        'items': [_sampleTelegram()],
      },
      'telegrams.get' => _sampleTelegram(),
      'organizations.settings.get' => {
        'organizationId': 'org-1',
        'organizationName': 'قسم شرطة الشهباء',
        'departmentName': 'قسم شرطة الشهباء',
        'unitName': 'قيادة الأمن الداخلي في محافظة حلب',
        'unitChiefRank': 'العقيد',
        'unitChiefName': 'رئيس الوحدة',
        'serialPrefix': 'POL',
        'incomingSerialPrefix': 'POL',
        'serialStart': 1,
        'incomingSerialStart': 1,
        'timezone': 'Asia/Riyadh',
        'dateFormat': 'yyyy/MM/dd HH:mm:ss',
        'timeFormat': '24',
        'numberSystem': 'latin',
        'logoUrl': organizationLogoUrl,
      },
      'organizations.settings.update' => {...?input, 'organizationId': 'org-1'},
      'organizations.routingDirectory' => <dynamic>[],
      'platformDocumentSettings.get' => {
        'showMinistryWatermarkText': true,
        'watermarkOpacityPercent': 16,
        'headerDividerColor': '#b49a55',
        'showVerificationQr': true,
      },
      'platformDocumentSettings.update' => {
        'showMinistryWatermarkText': true,
        'watermarkOpacityPercent': 16,
        'headerDividerColor': '#b49a55',
        'showVerificationQr': true,
      },
      'notifications.inbox' => <dynamic>[],
      _ => <String, dynamic>{},
    };
  }

  @override
  Future<Uint8List?> fetchImageAsset(String source) async =>
      source == organizationLogoUrl ? _testPng : null;

  @override
  Future<Uint8List?> fetchOrganizationLogo({
    required String organizationId,
    required String source,
  }) async =>
      organizationId == 'org-1' &&
          (source == organizationLogoUrl ||
              (source.isEmpty && apiLogoFallbackAvailable))
      ? _testPng
      : null;
}

class _PlatformDocumentSettingsUnavailableApi extends _TestPoliceApi {
  _PlatformDocumentSettingsUnavailableApi() : super(signedIn: true);

  @override
  Future<dynamic> call(
    String procedure, {
    Map<String, dynamic>? input,
    bool mutation = false,
    bool allowOfflineCache = true,
  }) async {
    if (procedure == 'platformDocumentSettings.get') {
      throw const NetworkException();
    }
    return super.call(
      procedure,
      input: input,
      mutation: mutation,
      allowOfflineCache: allowOfflineCache,
    );
  }
}

class _MalformedPlatformDocumentSettingsApi extends _TestPoliceApi {
  _MalformedPlatformDocumentSettingsApi() : super(signedIn: true);

  @override
  Future<dynamic> call(
    String procedure, {
    Map<String, dynamic>? input,
    bool mutation = false,
    bool allowOfflineCache = true,
  }) async {
    if (procedure == 'platformDocumentSettings.get') {
      return <String, dynamic>{};
    }
    return super.call(
      procedure,
      input: input,
      mutation: mutation,
      allowOfflineCache: allowOfflineCache,
    );
  }
}

class _EmptyTelegramOutbox extends TelegramOutbox {
  _EmptyTelegramOutbox() : super();

  @override
  Future<int> pendingCount() async => 0;
}

class _TestOfficialTelegramDocumentRenderer
    implements OfficialTelegramDocumentRenderer {
  String? renderedHtml;

  @override
  Future<Uint8List> renderPdf(
    String html, {
    String? organizationId,
    String? logoSource,
  }) async {
    renderedHtml = html;
    expect(html, contains(_telegramSubject));
    expect(html, contains('routing-qr'));
    return Uint8List.fromList([37, 80, 68, 70]);
  }

  @override
  Future<Uint8List> renderPng(
    String html, {
    String? organizationId,
    String? logoSource,
  }) async => _testPng;

  @override
  Future<Uint8List> renderPreview(Uint8List pdfBytes) async => _testPng;

  @override
  Future<List<Uint8List>> renderPreviewPages(
    Uint8List pdfBytes, {
    bool skipFirstPage = false,
  }) async => skipFirstPage ? [] : [_testPng];

  @override
  Future<List<Uint8List>> renderHighResolutionImages(
    Uint8List pdfBytes,
  ) async => [_testPng];
}

class _StalledPdfDocumentRenderer
    extends _TestOfficialTelegramDocumentRenderer {
  @override
  Future<Uint8List> renderPdf(
    String html, {
    String? organizationId,
    String? logoSource,
  }) => Completer<Uint8List>().future;
}

void main() {
  setUp(() {
    _secureStorageForTest.clear();
    AppLockRuntime.setSessionActive(false);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
          (call) async {
            final arguments = call.arguments;
            final key = arguments is Map ? arguments['key'] as String? : null;
            switch (call.method) {
              case 'read':
                return key == null ? null : _secureStorageForTest[key];
              case 'write':
                if (key != null && arguments is Map) {
                  _secureStorageForTest[key] = arguments['value'] as String;
                }
                return null;
              case 'delete':
                if (key != null) _secureStorageForTest.remove(key);
                return null;
              case 'deleteAll':
                _secureStorageForTest.clear();
                return null;
              case 'readAll':
                return Map<String, String>.from(_secureStorageForTest);
              case 'containsKey':
                return key != null && _secureStorageForTest.containsKey(key);
              default:
                return null;
            }
          },
        );
  });
  test('push service construction does not require Firebase configuration', () {
    expect(PushNotificationService.new, returnsNormally);
  });

  testWidgets('department settings cannot change the platform QR choice', (
    tester,
  ) async {
    _setMobileViewport(tester);
    final api = _TestPoliceApi(signedIn: true);

    await tester.pumpWidget(
      MaterialApp(home: DepartmentSettingsPage(api: api)),
    );
    await _pumpDashboardFrames(tester, frameCount: 4);

    final qrSetting = find.text('إظهار رمز QR للتحقق في البرقية');
    expect(qrSetting, findsNothing);

    final saveButton = find.text('حفظ إعدادات الجهة');
    await _scrollIntoView(tester, saveButton);
    await tester.tap(saveButton);
    await _pumpDashboardFrames(tester, frameCount: 4);

    expect(api.calls['organizations.settings.update'], isNotNull);
    expect(
      api.calls['organizations.settings.update']!.containsKey(
        'showVerificationQr',
      ),
      isFalse,
    );
  });

  testWidgets('department logo preview uses a light background', (
    tester,
  ) async {
    _setMobileViewport(tester);
    final api = _TestPoliceApi(
      signedIn: true,
      organizationLogoUrl: '/api/storage/department/logos/org-1/logo.png',
    );

    await tester.pumpWidget(
      MaterialApp(home: DepartmentSettingsPage(api: api)),
    );
    await _pumpDashboardFrames(tester, frameCount: 5);

    expect(
      find.byWidgetPredicate(
        (widget) => widget is Image && widget.image is MemoryImage,
      ),
      findsOneWidget,
    );
    final logoTile = tester.widget<Container>(
      find.byWidgetPredicate(
        (widget) =>
            widget is Container &&
            widget.constraints?.maxWidth == 64 &&
            widget.constraints?.maxHeight == 64 &&
            widget.decoration is BoxDecoration &&
            (widget.decoration! as BoxDecoration).color == Colors.white,
      ),
    );
    expect((logoTile.decoration! as BoxDecoration).color, Colors.white);
    expect(api.calls['organizations.logo']?['organizationId'], 'org-1');
  });

  testWidgets(
    'department settings keeps the saved logo when organization logo response is empty',
    (tester) async {
      _setMobileViewport(tester);
      final api = _TestPoliceApi(
        signedIn: true,
        organizationLogoUrl: 'https://images.example.test/saved-logo.png',
        resolvedOrganizationLogoUrl: '',
      );

      await tester.pumpWidget(
        MaterialApp(home: DepartmentSettingsPage(api: api)),
      );
      await _pumpDashboardFrames(tester, frameCount: 5);

      expect(
        find.byWidgetPredicate(
          (widget) => widget is Image && widget.image is MemoryImage,
        ),
        findsOneWidget,
      );
      expect(api.calls['organizations.logo']?['organizationId'], 'org-1');
    },
  );

  testWidgets('official telegram document keeps logo separate from watermark', (
    tester,
  ) async {
    _setMobileViewport(tester);
    final api = _TestPoliceApi(
      signedIn: true,
      organizationLogoUrl: '/api/storage/department/logos/org-1/logo.png',
    );
    final renderer = _TestOfficialTelegramDocumentRenderer();

    await tester.pumpWidget(
      OfficialTelegramDocumentRendererScope(
        renderer: renderer,
        child: MaterialApp(
          home: OfficialTelegramDocumentPage(api: api, telegramId: 7),
        ),
      ),
    );
    await _pumpDashboardFrames(tester, frameCount: 12);
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 300)),
    );
    await tester.pump();

    final renderedHtml = renderer.renderedHtml!;
    expect(
      renderedHtml,
      contains('class="official-logo" src="telegram-logo://official"'),
    );
    expect(renderedHtml, isNot(contains('data:image/png;base64')));
    expect(renderedHtml, contains('class="page-watermark"'));
    expect(renderedHtml, contains('class="watermark-logo"'));
    expect(renderedHtml, contains('class="watermark-text-pattern"'));
    expect(
      renderedHtml.indexOf('class="watermark-text-pattern"'),
      lessThan(renderedHtml.indexOf('class="watermark-logo"')),
    );
    expect(renderedHtml, contains('<span>وزارة الداخلية</span>'));
    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is Image && widget.semanticLabel == 'معاينة الصفحة 1 من 1',
      ),
      findsOneWidget,
    );
  });

  testWidgets(
    'official telegram preview loads logo from authenticated API fallback',
    (tester) async {
      _setMobileViewport(tester);
      final api = _TestPoliceApi(
        signedIn: true,
        apiLogoFallbackAvailable: true,
      );
      final renderer = _TestOfficialTelegramDocumentRenderer();

      await tester.pumpWidget(
        OfficialTelegramDocumentRendererScope(
          renderer: renderer,
          child: MaterialApp(
            home: OfficialTelegramDocumentPage(api: api, telegramId: 7),
          ),
        ),
      );
      await _pumpDashboardFrames(tester, frameCount: 12);
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 300)),
      );
      await tester.pump();

      expect(
        api.calls['organizations.logoForExport']?['organizationId'],
        'org-1',
      );
      expect(
        renderer.renderedHtml,
        contains('class="official-logo" src="telegram-logo://official"'),
      );
      expect(renderer.renderedHtml, isNot(contains('data:image/png;base64')));
    },
  );

  testWidgets(
    'official document loading indicator and copy are centered together',
    (tester) async {
      _setMobileViewport(tester);
      final renderer = _TestOfficialTelegramDocumentRenderer();

      await tester.pumpWidget(
        OfficialTelegramDocumentRendererScope(
          renderer: renderer,
          child: MaterialApp(
            home: OfficialTelegramDocumentPage(
              api: _TestPoliceApi(signedIn: true),
              telegramId: 7,
            ),
          ),
        ),
      );

      expect(find.text('نجهّز معاينة البرقية'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
    },
  );

  testWidgets(
    'stalled PDF renderer shows a retry instead of spinning forever',
    (tester) async {
      _setMobileViewport(tester);
      final renderer = _StalledPdfDocumentRenderer();

      await tester.pumpWidget(
        OfficialTelegramDocumentRendererScope(
          renderer: renderer,
          child: MaterialApp(
            home: OfficialTelegramDocumentPage(
              api: _TestPoliceApi(signedIn: true),
              telegramId: 7,
            ),
          ),
        ),
      );
      await _pumpDashboardFrames(tester, frameCount: 12);
      // AssetBundle font reads use real asynchronous work; allow them to
      // complete before advancing the fake clock to the renderer timeout.
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 200)),
      );
      await tester.pump();
      await tester.pump(const Duration(seconds: 61));
      await tester.pump();

      expect(
        find.text('تعذر تحويل الوثيقة إلى PDF في الوقت المحدد. أعد المحاولة.'),
        findsOneWidget,
      );
      expect(find.text('إعادة المحاولة'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    },
  );

  testWidgets('does not render a document with unconfirmed platform settings', (
    tester,
  ) async {
    _setMobileViewport(tester);
    final renderer = _TestOfficialTelegramDocumentRenderer();

    await tester.pumpWidget(
      OfficialTelegramDocumentRendererScope(
        renderer: renderer,
        child: MaterialApp(
          home: OfficialTelegramDocumentPage(
            api: _PlatformDocumentSettingsUnavailableApi(),
            telegramId: 7,
          ),
        ),
      ),
    );
    await _pumpDashboardFrames(tester, frameCount: 8);

    expect(renderer.renderedHtml, isNull);
    expect(find.text('تعذر الاتصال بالخادم'), findsOneWidget);
    expect(find.text('طباعة'), findsNothing);
  });

  testWidgets('does not render a document with malformed platform settings', (
    tester,
  ) async {
    _setMobileViewport(tester);
    final renderer = _TestOfficialTelegramDocumentRenderer();

    await tester.pumpWidget(
      OfficialTelegramDocumentRendererScope(
        renderer: renderer,
        child: MaterialApp(
          home: OfficialTelegramDocumentPage(
            api: _MalformedPlatformDocumentSettingsApi(),
            telegramId: 7,
          ),
        ),
      ),
    );
    await _pumpDashboardFrames(tester, frameCount: 8);

    expect(renderer.renderedHtml, isNull);
    expect(find.text('تعذر قراءة إعدادات وثيقة النظام.'), findsOneWidget);
    expect(find.text('طباعة'), findsNothing);
  });

  testWidgets('does not allow saving document settings before loading them', (
    tester,
  ) async {
    _setMobileViewport(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: PlatformDocumentSettingsPage(
          api: _PlatformDocumentSettingsUnavailableApi(),
        ),
      ),
    );
    await _pumpDashboardFrames(tester, frameCount: 8);

    expect(find.text('تعذر الاتصال بالخادم'), findsOneWidget);
    expect(find.text('إعادة المحاولة'), findsOneWidget);
    expect(find.text('حفظ إعدادات النظام'), findsNothing);
  });

  testWidgets('saves the confirmed platform document settings contract', (
    tester,
  ) async {
    _setMobileViewport(tester);
    final api = _TestPoliceApi(signedIn: true);
    await tester.pumpWidget(
      MaterialApp(home: PlatformDocumentSettingsPage(api: api)),
    );
    await _pumpDashboardFrames(tester, frameCount: 8);

    await _scrollIntoView(tester, find.text('حفظ إعدادات النظام'));
    await tester.tap(find.text('حفظ إعدادات النظام'));
    await _pumpDashboardFrames(tester, frameCount: 4);

    expect(api.calls['platformDocumentSettings.update'], {
      'showMinistryWatermarkText': true,
      'watermarkOpacityPercent': 16,
      'watermarkScalePercent': 100,
      'headerDividerColor': '#b49a55',
      'headerDividerStyle': 'double',
      'headerDividerWidthPt': 2.25,
      'pageMarginTopMm': 10,
      'pageMarginRightMm': 10,
      'pageMarginBottomMm': 10,
      'pageMarginLeftMm': 10,
      'frameStyle': 'single',
      'frameColor': '#b49a55',
      'frameWidthPt': 1.0,
      'showVerificationQr': true,
      'pageHeaderRows': [],
      'pageFooterRows': [],
    });
    expect(find.text('تم حفظ إعدادات وثائق النظام'), findsOneWidget);
  });

  testWidgets('preserves the original account menu options and policy links', (
    tester,
  ) async {
    _setMobileViewport(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: DashboardPage(
          api: _TestPoliceApi(signedIn: true),
          account: const {
            'id': 1,
            'name': 'مالك المنصة',
            'role': 'admin',
            'isPlatformOwner': true,
          },
          outbox: _EmptyTelegramOutbox(),
        ),
      ),
    );
    await _pumpDashboardFrames(tester, frameCount: 8);

    await tester.tap(find.byTooltip('إعدادات الحساب'));
    await tester.pumpAndSettle();

    expect(find.text('الشروط والأحكام'), findsOneWidget);
    expect(find.text('حول وثائقي وميزاته'), findsOneWidget);
    expect(find.text('حول التطبيق والتحديثات'), findsOneWidget);
    expect(find.text('لوحة قيادة المالك'), findsOneWidget);
    expect(find.text('إدارة المستخدمين'), findsOneWidget);
    expect(find.text('إعدادات النظام والوثائق'), findsOneWidget);
  });

  testWidgets('hides owner document settings from non-owner administrators', (
    tester,
  ) async {
    _setMobileViewport(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: DashboardPage(
          api: _TestPoliceApi(signedIn: true),
          account: const {'id': 1, 'name': 'مدير جهة', 'role': 'admin'},
          outbox: _EmptyTelegramOutbox(),
        ),
      ),
    );
    await _pumpDashboardFrames(tester, frameCount: 8);
    await tester.tap(find.byTooltip('إعدادات الحساب'));
    await tester.pumpAndSettle();

    expect(find.text('إعدادات المالك'), findsNothing);
    expect(find.text('إعدادات النظام والوثائق'), findsNothing);
  });

  test('mandatory app lock requires an exact four-digit PIN', () async {
    await expectLater(AppLockService.savePin('12345'), throwsFormatException);

    await AppLockService.savePin('1234');

    expect(await AppLockService.hasPin(), isTrue);
    expect(await AppLockService.isEnabled(), isTrue);
    expect(await AppLockService.hasLegacyPin(), isFalse);
    expect(_secureStorageForTest['mobile_app_lock_enabled'], 'true');
    expect(await AppLockService.isBiometricEnabled(), isFalse);
    await expectLater(
      AppLockService.setEnabled(false),
      throwsA(isA<StateError>()),
    );
  });

  testWidgets(
    'PIN lock uses four adaptive slots on the dark full-screen view',
    (tester) async {
      _setMobileViewport(tester);
      _seedExistingPin();
      AppLockRuntime.setSessionActive(true);
      addTearDown(() => AppLockRuntime.setSessionActive(false));

      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.light(),
          darkTheme: ThemeData.dark(),
          themeMode: ThemeMode.dark,
          home: const AppLockOverlay(
            child: Scaffold(body: Text('protected content')),
          ),
        ),
      );
      await _pumpDashboardFrames(tester, frameCount: 8);

      expect(find.text('قم بإدخال رمز PIN'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(AppLockOverlay),
          matching: find.byType(AnimatedContainer),
        ),
        findsNWidgets(4),
      );
      final lockScreenMaterial = find.descendant(
        of: find
            .ancestor(
              of: find.text('قم بإدخال رمز PIN'),
              matching: find.byType(Positioned),
            )
            .first,
        matching: find.byType(Material),
      );
      expect(lockScreenMaterial, findsOneWidget);
      expect(
        tester.widget<Material>(lockScreenMaterial).color,
        ThemeData.dark().colorScheme.surface,
      );
    },
  );

  testWidgets(
    'successful biometric unlock survives native prompt lifecycle events',
    (tester) async {
      _setMobileViewport(tester);
      const biometricChannel = MethodChannel('plugins.flutter.io/local_auth');
      final authenticationResult = Completer<Object?>();
      _seedExistingPin();
      _secureStorageForTest['mobile_app_lock_biometric'] = 'true';
      AppLockRuntime.setSessionActive(true);
      addTearDown(() => AppLockRuntime.setSessionActive(false));
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            biometricChannel,
            (call) => call.method == 'authenticate'
                ? authenticationResult.future
                : Future<Object?>.value(null),
          );
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(biometricChannel, null),
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: AppLockOverlay(
            child: Scaffold(body: Text('protected content')),
          ),
        ),
      );
      await _pumpDashboardFrames(tester, frameCount: 8);
      expect(find.text('قم بإدخال رمز PIN'), findsOneWidget);

      await tester.tap(find.byTooltip('استخدام البصمة أو التعرّف على الوجه'));
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      authenticationResult.complete(true);
      await tester.pumpAndSettle();

      // A delayed resume event from the native prompt must not relock a
      // session after biometric authentication has already succeeded.
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();

      expect(find.text('protected content'), findsOneWidget);
      expect(find.text('قم بإدخال رمز PIN'), findsNothing);
    },
  );

  testWidgets('first-login PIN setup requires matching entries', (
    tester,
  ) async {
    var configured = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async {
                configured = await showMandatoryPinSetupDialog(context);
              },
              child: const Text('configure PIN'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('configure PIN'));
    await tester.pumpAndSettle();
    final pinFields = find.byType(TextField);
    expect(pinFields, findsNWidgets(2));

    await tester.enterText(pinFields.at(0), '1234');
    await tester.enterText(pinFields.at(1), '4321');
    await tester.tap(find.text('حفظ ومتابعة'));
    await tester.pump();
    expect(find.text('تأكيد الرمز غير مطابق.'), findsOneWidget);
    expect(configured, isFalse);

    await tester.enterText(pinFields.at(1), '1234');
    await tester.tap(find.text('حفظ ومتابعة'));
    await tester.pumpAndSettle();

    expect(configured, isTrue);
    expect(_secureStorageForTest['mobile_app_lock_pin'], '1234');
    expect(_secureStorageForTest['mobile_app_lock_enabled'], 'true');
  });

  testWidgets('restored session without a PIN is returned to login', (
    tester,
  ) async {
    final api = _TestPoliceApi(signedIn: true);
    await tester.pumpWidget(WathaeqiApp(api: api));
    await _pumpDashboardFrames(tester, frameCount: 12);

    expect(find.text('تسجيل الدخول'), findsOneWidget);
    expect(find.byTooltip('إنشاء برقية'), findsNothing);
    expect(api.logoutCalled, isTrue);
  });

  testWidgets('legacy PIN must be verified and replaced before unlocking', (
    tester,
  ) async {
    _secureStorageForTest['mobile_app_lock_pin'] = '123456';
    _secureStorageForTest['mobile_app_lock_enabled'] = 'false';
    AppLockRuntime.setSessionActive(true);
    addTearDown(() => AppLockRuntime.setSessionActive(false));

    await tester.pumpWidget(
      const MaterialApp(
        home: AppLockOverlay(
          child: Scaffold(body: Center(child: Text('protected content'))),
        ),
      ),
    );
    await _pumpDashboardFrames(tester, frameCount: 8);
    expect(find.text('أدخل رمز PIN السابق'), findsOneWidget);

    await tester.enterText(_appLockPinField(), '123456');
    await tester.pump();
    await tester.tap(find.text('التحقق من الرمز السابق'));
    await tester.pumpAndSettle();
    expect(find.text('إنشاء رمز PIN إلزامي'), findsOneWidget);

    final pinFields = find.descendant(
      of: find.byType(AlertDialog),
      matching: find.byType(TextField),
    );
    await tester.enterText(pinFields.at(0), '4321');
    await tester.enterText(pinFields.at(1), '4321');
    await tester.tap(find.text('حفظ ومتابعة'));
    await tester.pumpAndSettle();

    expect(find.text('protected content'), findsOneWidget);
    expect(_secureStorageForTest['mobile_app_lock_pin'], '4321');
    expect(await AppLockService.verifyPin('123456'), isFalse);
    expect(await AppLockService.verifyPin('4321'), isTrue);
  });

  testWidgets(
    'PIN remains mandatory while biometrics are an optional setting',
    (tester) async {
      _seedExistingPin();
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: AppLockSettingsSection())),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('قفل PIN إلزامي دائمًا.'), findsOneWidget);
      expect(find.text('تفعيل قفل التطبيق'), findsNothing);
      final biometricSwitch = tester.widget<SwitchListTile>(
        find.byType(SwitchListTile),
      );
      expect(biometricSwitch.value, isFalse);
      expect(biometricSwitch.onChanged, isNotNull);
    },
  );

  testWidgets('responsive dialog keeps long content and actions reachable', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 480);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: FilledButton(
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (dialogContext) => AlertDialog(
                    scrollable: true,
                    title: const Text('إعدادات طويلة'),
                    content: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: List.generate(
                        18,
                        (index) => ListTile(title: Text('إعداد رقم $index')),
                      ),
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(dialogContext),
                        child: const Text('حفظ وإغلاق'),
                      ),
                    ],
                  ),
                ),
                child: const Text('فتح الإعدادات'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('فتح الإعدادات'));
    await tester.pumpAndSettle();

    expect(find.text('إعدادات طويلة'), findsOneWidget);
    expect(find.text('حفظ وإغلاق'), findsOneWidget);
    expect(tester.takeException(), isNull);
    expect(AppTheme.light.dialogTheme.constraints?.maxWidth, 560);
    expect(
      AppTheme.dark.dialogTheme.insetPadding,
      const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
    );
  });

  testWidgets('shows police telegram login screen with Cairo typography', (
    tester,
  ) async {
    _setMobileViewport(tester);
    await tester.pumpWidget(WathaeqiApp(api: _TestPoliceApi()));
    await tester.pumpAndSettle();

    expect(find.text('وثائقك. منظّمة وواضحة.'), findsOneWidget);
    expect(find.text('تسجيل الدخول'), findsOneWidget);
    expect(find.text('اسم المستخدم'), findsOneWidget);
    expect(
      Theme.of(tester.element(find.text('تسجيل الدخول')))
          .textTheme
          .bodyMedium
          ?.fontFamily,
      'Cairo',
    );
  });
}
