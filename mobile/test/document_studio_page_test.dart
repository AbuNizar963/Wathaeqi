import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/document_studio_outbox.dart';
import 'package:police_telegrams/document_studio_page.dart';

class _DocumentStudioTestApi extends PoliceApi {
  _DocumentStudioTestApi({
    this.includeOrganization = true,
    this.includeDocument = false,
  });

  final bool includeOrganization;
  final bool includeDocument;
  final calls = <String, Map<String, dynamic>?>{};

  @override
  Future<dynamic> call(
    String procedure, {
    Map<String, dynamic>? input,
    bool mutation = false,
    bool allowOfflineCache = true,
  }) async {
    calls[procedure] = input;
    return switch (procedure) {
      'documentStudio.listDocuments' => includeDocument
          ? <dynamic>[
              {
                'id': 'doc-preview-test',
                'ownerId': 'owner-test',
                'title': 'وثيقة تجريبية',
                'category': 'general',
                'subject': 'اختبار المعاينة',
                'content': {
                  'type': 'doc',
                  'content': [
                    {'type': 'paragraph'},
                  ],
                },
                'fieldValues': <String, dynamic>{},
                'serialNumber': 0,
                'serialCode': '',
                'documentDate': '2026-11-21T00:00:00.000Z',
                'status': 'draft',
                'createdAt': '2026-11-21T00:00:00.000Z',
                'updatedAt': '2026-11-21T00:00:00.000Z',
              },
            ]
          : <dynamic>[],
      'documentStudio.listTemplates' => <dynamic>[],
      'organizations.context' => {
        if (includeOrganization) 'organizationId': 'org-test',
        'role': 'organization_admin',
        'isOwner': false,
      },
      'documentStudio.getLetterheadSettings' => {
        'departmentName': 'الجهة التجريبية',
        'unitName': 'الشؤون الإدارية',
      },
      _ => throw StateError('Unexpected API call: $procedure'),
    };
  }
}

class _DocumentStudioTestOutbox extends DocumentStudioOutbox {
  _DocumentStudioTestOutbox({required super.api});

  @override
  Future<int> pendingCount() async => 0;

  @override
  Future<DocumentOutboxSyncResult> sync() async =>
      const DocumentOutboxSyncResult(synced: 0, remaining: 0);
}

void main() {
  testWidgets('opening a saved document shows its preview first', (
    tester,
  ) async {
    final api = _DocumentStudioTestApi(includeDocument: true);
    final outbox = _DocumentStudioTestOutbox(api: api);

    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: const [
          FlutterQuillLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('ar')],
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            body: DocumentStudioPage(api: api, outbox: outbox),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('وثيقة تجريبية'));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('document-a4-pdf-preview')), findsOneWidget);
    expect(find.text('تنزيل PDF'), findsOneWidget);
    expect(find.text('مشاركة PDF'), findsOneWidget);
    expect(find.text('طباعة'), findsOneWidget);
    expect(find.byTooltip('تعديل الوثيقة'), findsOneWidget);

    await tester.tap(find.byTooltip('تعديل الوثيقة'));
    await tester.pumpAndSettle();
    expect(find.text('تحرير الوثيقة'), findsOneWidget);
  });

  testWidgets('document studio opens with its three work areas', (
    tester,
  ) async {
    final api = _DocumentStudioTestApi(includeOrganization: false);
    final outbox = _DocumentStudioTestOutbox(api: api);

    await tester.pumpWidget(
      MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            body: DocumentStudioPage(api: api, outbox: outbox),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('إعداد الوثائق الرسمية'), findsOneWidget);
    expect(find.text('إنشاء وثيقة'), findsOneWidget);
    expect(find.text('لا توجد وثائق بعد'), findsOneWidget);

    await tester.tap(find.text('إنشاء وثيقة'));
    await tester.pumpAndSettle();

    expect(find.text('إنشاء والكتابة في وثيقة'), findsOneWidget);
    expect(find.text('استيراد PDF أو Word أو صورة'), findsOneWidget);
    expect(find.text('اختيار نموذج جاهز'), findsOneWidget);

    await tester.tap(find.text('إلغاء'));
    await tester.pumpAndSettle();
    expect(find.text('الوثائق'), findsOneWidget);
    expect(find.text('القوالب'), findsOneWidget);
    expect(find.text('الأرشيف'), findsOneWidget);
    expect(api.calls.containsKey('documentStudio.listDocuments'), isTrue);
    expect(api.calls.containsKey('documentStudio.listTemplates'), isTrue);
    expect(api.calls['documentStudio.getLetterheadSettings'], isEmpty);

    await tester.tap(find.text('القوالب'));
    await tester.pumpAndSettle();

    expect(find.text('مكتبة النماذج'), findsOneWidget);
    expect(find.text('نموذج جديد'), findsOneWidget);

    await tester.tap(find.text('الأرشيف'));
    await tester.pumpAndSettle();

    expect(find.text('لا توجد وثائق مؤرشفة'), findsOneWidget);
  });
}
