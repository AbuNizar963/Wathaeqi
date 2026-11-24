import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/mobile_pages.dart';
import 'package:police_telegrams/public_pages.dart';
import 'package:police_telegrams/telegram_actions.dart';

class _ScreenTestApi extends PoliceApi {
  _ScreenTestApi() : super(baseUrl: 'https://example.test');

  final calls = <String>[];
  Map<String, dynamic>? lastInput;
  final transitionInputs = <Map<String, dynamic>>[];

  @override
  Future<dynamic> call(
    String procedure, {
    Map<String, dynamic>? input,
    bool mutation = false,
    bool allowOfflineCache = true,
  }) async {
    calls.add(procedure);
    if (procedure == 'telegrams.transition' && input != null) {
      transitionInputs.add(Map<String, dynamic>.from(input));
    }
    if (procedure == 'profile.changePassword') {
      lastInput = input;
    }
    switch (procedure) {
      case 'telegrams.transition':
        return {'success': true};
      case 'telegrams.incomingRoutes':
      case 'telegrams.attachments':
        return <dynamic>[];
      case 'profile.get':
        return {'name': 'مشغل الاختبار', 'mustChangePassword': true};
      case 'profile.changePassword':
        return {'success': true};
      case 'organizations.all':
        return [
          {
            'id': 'org-1',
            'name': 'محافظة اختبار',
            'code': 'TST',
            'type': 'governorate',
            'isActive': true,
          },
        ];
      case 'organizations.context':
        return {'organizationId': 'org-1', 'isOwner': false};
      default:
        throw StateError('Unexpected test procedure: $procedure');
    }
  }
}

Widget _host(Widget child) =>
    MaterialApp(theme: ThemeData(useMaterial3: true), home: child);

void main() {
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
          (call) async {
            switch (call.method) {
              case 'read':
                return null;
              case 'readAll':
                return <String, String>{};
              case 'containsKey':
                return false;
              default:
                return null;
            }
          },
        );
  });
  testWidgets('about and terms screens expose their main content', (
    tester,
  ) async {
    await tester.pumpWidget(_host(const AboutPage()));
    expect(find.text('حول النظام'), findsWidgets);
    expect(find.text('ميزات النظام'), findsOneWidget);
    expect(find.text('سلامة السجل'), findsOneWidget);

    await tester.pumpWidget(_host(const TermsPage()));
    expect(find.text('الشروط والأحكام'), findsWidgets);
    expect(find.text('1. نطاق التطبيق والتعريفات'), findsOneWidget);
    expect(find.text('11. المخالفات والمسؤولية'), findsOneWidget);
  });

  testWidgets('profile requires matching password confirmation', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    await tester.pumpWidget(
      _host(
        ProfileSettingsPage(
          api: api,
          onLogout: () async {},
          onProfileUpdated: (_) {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('كلمة مرور مؤقتة'), findsOneWidget);
    Future<void> enterField(String label, String value) async {
      final field = find.byWidgetPredicate(
        (widget) =>
            widget is TextField && widget.decoration?.labelText == label,
      );
      await tester.scrollUntilVisible(
        field,
        160,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(field, value);
    }

    await enterField('كلمة المرور الحالية', 'current-password');
    await enterField('كلمة المرور الجديدة', 'new-password-long');
    await enterField('تأكيد كلمة المرور', 'different-password');
    await tester.scrollUntilVisible(
      find.text('تغيير كلمة المرور'),
      160,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('تغيير كلمة المرور'));
    await tester.pumpAndSettle();

    // Validation errors render at the top of the profile form. Scroll to the
    // error before asserting because ListView may dispose off-screen children.
    await tester.scrollUntilVisible(
      find.text('تأكيد كلمة المرور غير مطابق'),
      -240,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('تأكيد كلمة المرور غير مطابق'), findsOneWidget);
    expect(api.calls, isNot(contains('profile.changePassword')));

    await enterField('تأكيد كلمة المرور', 'new-password-long');
    await tester.scrollUntilVisible(
      find.text('تغيير كلمة المرور'),
      160,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('تغيير كلمة المرور'));
    await tester.pumpAndSettle();
    expect(api.calls, contains('profile.changePassword'));
    expect(find.textContaining('كلمة مرور مؤقتة'), findsNothing);

    await tester.scrollUntilVisible(
      find.text('تسجيل الخروج'),
      160,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('إنهاء الجلسة'), findsOneWidget);
  });

  testWidgets('telegram transitions match its state and user role', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    await tester.pumpWidget(
      _host(
        Scaffold(
          body: TelegramActionsPanel(
            api: api,
            telegramId: 42,
            telegramStatus: 'in_review',
            canOperate: true,
            isAdmin: false,
            onChanged: () {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('اعتماد'), findsOneWidget);
    expect(find.text('إرجاع بسبب'), findsOneWidget);
    expect(find.text('رفض'), findsOneWidget);
    expect(find.text('أرشفة'), findsNothing);
    expect(find.text('إرسال طلب إحالة'), findsNothing);
  });

  testWidgets('decision transition requires a non-empty reason', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    var changedCount = 0;
    await tester.pumpWidget(
      _host(
        Scaffold(
          body: TelegramActionsPanel(
            api: api,
            telegramId: 42,
            telegramStatus: 'in_review',
            canOperate: true,
            isAdmin: false,
            onChanged: () => changedCount++,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('رفض'));
    await tester.pumpAndSettle();
    expect(find.text('السبب (مطلوب)'), findsOneWidget);

    await tester.tap(find.text('متابعة'));
    await tester.pumpAndSettle();

    expect(find.text('تأكيد القرار'), findsNothing);
    expect(api.transitionInputs, isEmpty);
    expect(changedCount, 0);
  });

  testWidgets('cancelling the return confirmation sends no transition', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    var changedCount = 0;
    await tester.pumpWidget(
      _host(
        Scaffold(
          body: TelegramActionsPanel(
            api: api,
            telegramId: 42,
            telegramStatus: 'in_review',
            canOperate: true,
            isAdmin: false,
            onChanged: () => changedCount++,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('إرجاع بسبب'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'بيانات غير مكتملة');
    await tester.tap(find.text('متابعة'));
    await tester.pumpAndSettle();
    expect(find.text('تأكيد القرار'), findsOneWidget);
    expect(api.transitionInputs, isEmpty);

    await tester.tap(find.text('إلغاء'));
    await tester.pumpAndSettle();

    expect(api.transitionInputs, isEmpty);
    expect(changedCount, 0);
  });

  testWidgets('confirming a return sends one returned transition', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    var changedCount = 0;
    await tester.pumpWidget(
      _host(
        Scaffold(
          body: TelegramActionsPanel(
            api: api,
            telegramId: 42,
            telegramStatus: 'in_review',
            canOperate: true,
            isAdmin: false,
            onChanged: () => changedCount++,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('إرجاع بسبب'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'بيانات غير مكتملة');
    await tester.tap(find.text('متابعة'));
    await tester.pumpAndSettle();
    expect(find.text('تأكيد القرار'), findsOneWidget);

    await tester.tap(find.text('تأكيد'));
    await tester.pumpAndSettle();

    expect(api.transitionInputs, hasLength(1));
    expect(api.transitionInputs.single, {
      'id': 42,
      'toStatus': 'returned',
      'reason': 'بيانات غير مكتملة',
    });
    expect(changedCount, 1);
  });

  testWidgets('confirming rejection sends one transition and refreshes', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    var changedCount = 0;
    await tester.pumpWidget(
      _host(
        Scaffold(
          body: TelegramActionsPanel(
            api: api,
            telegramId: 42,
            telegramStatus: 'in_review',
            canOperate: true,
            isAdmin: false,
            onChanged: () => changedCount++,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('رفض'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'مخالفة التعليمات');
    await tester.tap(find.text('متابعة'));
    await tester.pumpAndSettle();
    expect(find.text('تأكيد القرار'), findsOneWidget);

    await tester.tap(find.text('تأكيد'));
    await tester.pumpAndSettle();

    expect(api.transitionInputs, hasLength(1));
    expect(api.transitionInputs.single, {
      'id': 42,
      'toStatus': 'rejected',
      'reason': 'مخالفة التعليمات',
    });
    expect(changedCount, 1);
  });

  testWidgets('approved telegram has no inter-organization routing action', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    await tester.pumpWidget(
      _host(
        Scaffold(
          body: TelegramActionsPanel(
            api: api,
            telegramId: 42,
            telegramStatus: 'approved',
            canOperate: true,
            isAdmin: false,
            onChanged: () {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('إرسال طلب إحالة'), findsNothing);
    expect(find.text('إكمال المعالجة'), findsOneWidget);
  });

  testWidgets('verification screen rejects an empty token locally', (
    tester,
  ) async {
    final api = _ScreenTestApi();
    await tester.pumpWidget(_host(VerifyTelegramPage(api: api)));

    await tester.tap(find.text('تحقق من البرقية'));
    await tester.pump();

    expect(find.text('أدخل رمز التحقق الموجود في الوثيقة.'), findsOneWidget);
  });
}
