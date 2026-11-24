import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/mobile_pages.dart';
import 'package:police_telegrams/public_pages.dart';

class _ScreenTestApi extends PoliceApi {
  _ScreenTestApi() : super(baseUrl: 'https://example.test');

  final calls = <String>[];
  Map<String, dynamic>? lastInput;

  @override
  Future<dynamic> call(
    String procedure, {
    Map<String, dynamic>? input,
    bool mutation = false,
    bool allowOfflineCache = true,
  }) async {
    calls.add(procedure);
    if (procedure == 'profile.changePassword') {
      lastInput = input;
    }
    switch (procedure) {
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
