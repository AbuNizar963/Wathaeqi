import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/document_studio_outbox.dart';
import 'package:police_telegrams/document_studio_page.dart';
import 'package:police_telegrams/document_paper.dart';

class _DocumentStudioTestApi extends PoliceApi {
  _DocumentStudioTestApi({
    this.includeOrganization = true,
    this.includeDocument = false,
    this.documentContent,
    this.templateContent,
    this.templateFields = const <dynamic>[],
  });

  final bool includeOrganization;
  final bool includeDocument;
  final Map<String, dynamic>? documentContent;
  final Map<String, dynamic>? templateContent;
  final List<dynamic> templateFields;
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
      'documentStudio.listDocuments' =>
        includeDocument
            ? <dynamic>[
                {
                  'id': 'doc-preview-test',
                  'ownerId': 'owner-test',
                  'title': 'وثيقة تجريبية',
                  'category': 'general',
                  'subject': 'اختبار المعاينة',
                  'content':
                      documentContent ??
                      {
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
      'documentStudio.listTemplates' =>
        templateContent == null
            ? <dynamic>[]
            : <dynamic>[
                {
                  'id': 'template-test',
                  'ownerId': 'owner-test',
                  'title': 'نموذج تجريبي',
                  'category': 'general',
                  'content': templateContent,
                  'fields': templateFields,
                  'revision': 3,
                  'isActive': true,
                  'createdAt': '2026-11-21T00:00:00.000Z',
                  'updatedAt': '2026-11-21T00:00:00.000Z',
                },
              ],
      'organizations.context' => {
        if (includeOrganization) 'organizationId': 'org-test',
        'role': 'organization_admin',
        'isOwner': false,
      },
      'documentStudio.listDocumentVersions' => <dynamic>[],
      'documentStudio.getLetterheadSettings' => {
        'departmentName': 'الجهة التجريبية',
        'unitName': 'الشؤون الإدارية',
      },
      'platformDocumentSettings.get' => {
        'watermarkText': 'عبارة أمنية تجريبية',
        'showMinistryWatermarkText': true,
        'watermarkOpacityPercent': 14,
        'watermarkScalePercent': 145,
        'headerTitle': 'عنوان تجريبي للرأس',
        'headerSubtitle': 'وحدة تجريبية',
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

class _RecordingDocumentOutbox extends _DocumentStudioTestOutbox {
  _RecordingDocumentOutbox({required super.api});

  Map<String, dynamic>? savedInput;

  @override
  Future<Map<String, dynamic>> createDocument(
    Map<String, dynamic> input,
  ) async {
    savedInput = Map<String, dynamic>.from(input);
    return {
      ...input,
      'id': 'doc-created-test',
      'ownerId': 'owner-test',
      'serialNumber': 0,
      'serialCode': '',
      'status': 'draft',
      'createdAt': '2026-11-25T00:00:00.000Z',
      'updatedAt': '2026-11-25T00:00:00.000Z',
    };
  }

  @override
  Future<Map<String, dynamic>> updateDocument(
    Map<String, dynamic> input,
  ) async {
    savedInput = Map<String, dynamic>.from(input);
    return {
      ...input,
      'ownerId': 'owner-test',
      'serialNumber': 0,
      'serialCode': '',
      'status': 'draft',
      'createdAt': '2026-11-21T00:00:00.000Z',
      'updatedAt': '2026-11-21T00:00:00.000Z',
    };
  }

  @override
  Future<Map<String, dynamic>> updateTemplate(
    Map<String, dynamic> input,
  ) async {
    savedInput = Map<String, dynamic>.from(input);
    return {
      ...input,
      'ownerId': 'owner-test',
      'revision': 4,
      'isActive': true,
      'createdAt': '2026-11-21T00:00:00.000Z',
      'updatedAt': '2026-11-21T00:00:00.000Z',
    };
  }
}

void main() {
  testWidgets('saving a legacy-text draft without editing preserves its text', (
    tester,
  ) async {
    final api = _DocumentStudioTestApi(
      includeDocument: true,
      documentContent: {'type': 'legacy-text', 'text': 'نص محفوظ\nسطر ثانٍ'},
    );
    final outbox = _RecordingDocumentOutbox(api: api);
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
    await tester.ensureVisible(find.text('تعديل الوثيقة'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تعديل الوثيقة'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('حفظ الوثيقة'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حفظ الوثيقة'));
    await tester.pumpAndSettle();

    final content = outbox.savedInput?['content'] as Map?;
    expect(content?['type'], 'doc');
    expect(content.toString(), contains('نص محفوظ'));
    expect(content.toString(), contains('سطر ثانٍ'));
    expect(outbox.savedInput?['expectedUpdatedAt'], '2026-11-21T00:00:00.000Z');
  });

  testWidgets('saving a legacy-text template preserves its text and revision', (
    tester,
  ) async {
    final api = _DocumentStudioTestApi(
      templateContent: {'type': 'legacy-text', 'text': 'قالب محفوظ\nسطر ثانٍ'},
    );
    final outbox = _RecordingDocumentOutbox(api: api);
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
            body: DocumentStudioPage(
              api: api,
              outbox: outbox,
              initialTab: DocumentStudioTab.templates,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('نموذج تجريبي'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('حفظ النموذج'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حفظ النموذج'));
    await tester.pumpAndSettle();

    final content = outbox.savedInput?['content'] as Map?;
    expect(content?['type'], 'doc');
    expect(content.toString(), contains('قالب محفوظ'));
    expect(content.toString(), contains('سطر ثانٍ'));
    expect(outbox.savedInput?['expectedRevision'], 3);
  });

  testWidgets('opening a saved document shows its preview first', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
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
    // PDF preview rendering may keep an indeterminate progress animation
    // alive; advance a bounded amount of virtual time instead of settling it.
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));

    final paper = find.byKey(const ValueKey('document-a4-paper'));
    expect(paper, findsOneWidget);
    expect(
      find.ancestor(of: paper, matching: find.byType(FittedBox)),
      findsOneWidget,
    );
    expect(tester.getSize(paper).width, 794);
    expect(tester.getRect(paper).width, lessThanOrEqualTo(390));
    expect(
      tester.widget<DocumentPaper>(find.byType(DocumentPaper)).watermarkText,
      'عبارة أمنية تجريبية',
    );
    expect(
      tester
          .widget<DocumentPaper>(find.byType(DocumentPaper))
          .watermarkScalePercent,
      145,
    );
    expect(find.text('عنوان تجريبي للرأس'), findsOneWidget);
    expect(find.byKey(const ValueKey('document-a4-pdf-preview')), findsNothing);
    expect(find.text('تنزيل PDF'), findsOneWidget);
    expect(find.text('مشاركة PDF'), findsOneWidget);
    expect(find.text('طباعة'), findsOneWidget);
    expect(
      tester
          .widget<OutlinedButton>(
            find.widgetWithText(OutlinedButton, 'تنزيل PDF'),
          )
          .onPressed,
      isNotNull,
    );
    expect(
      tester
          .widget<OutlinedButton>(
            find.widgetWithText(OutlinedButton, 'مشاركة PDF'),
          )
          .onPressed,
      isNotNull,
    );
    expect(
      tester
          .widget<OutlinedButton>(find.widgetWithText(OutlinedButton, 'طباعة'))
          .onPressed,
      isNotNull,
    );
    expect(find.text('تعديل الوثيقة'), findsOneWidget);
    expect(find.text('سجل إصدارات الوثيقة'), findsOneWidget);
    expect(
      find.text('لا توجد نسخ سابقة بعد. سيظهر السجل بعد أول تعديل محفوظ.'),
      findsOneWidget,
    );
    expect(
      api.calls.containsKey('documentStudio.listDocumentVersions'),
      isTrue,
    );

    await tester.ensureVisible(find.text('طباعة'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('طباعة'));
    await tester.pumpAndSettle();
    expect(find.text('إعداد الطباعة'), findsOneWidget);
    expect(find.text('1 صفحة'), findsOneWidget);
    expect(find.text('2 صفحات'), findsOneWidget);
    expect(find.text('4 صفحات'), findsOneWidget);
    expect(find.text('6 صفحات'), findsOneWidget);
    expect(find.text('8 صفحات'), findsOneWidget);
    await tester.tap(find.text('إلغاء'));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('تعديل الوثيقة'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تعديل الوثيقة'));
    await tester.pumpAndSettle();
    expect(find.text('تحرير الوثيقة'), findsOneWidget);
  });


  testWidgets(
    'guided document creation fills required template fields without opening the editor',
    (tester) async {
      final api = _DocumentStudioTestApi(
        templateContent: {
          'type': 'doc',
          'content': [
            {
              'type': 'paragraph',
              'content': [
                {'type': 'text', 'text': 'اسم الموظف: {{employee_name}}'},
              ],
            },
          ],
        },
        templateFields: [
          {
            'key': 'employee_name',
            'label': 'اسم الموظف',
            'type': 'text',
            'required': true,
          },
        ],
      );
      final outbox = _RecordingDocumentOutbox(api: api);

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

      await tester.tap(find.text('إنشاء وثيقة'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('تعبئة نموذج جاهز'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('نموذج تجريبي'));
      await tester.pumpAndSettle();

      expect(find.text('حقول تعبئة النموذج'), findsOneWidget);
      expect(find.text('اسم الموظف *'), findsOneWidget);
      expect(
        find.text(
          'ستُنشأ الوثيقة تلقائياً من إجابات الحقول أعلاه. يمكنك فتح تحرير النص يدوياً عند الحاجة.',
        ),
        findsOneWidget,
      );
      expect(find.text('تحرير النص يدوياً (اختياري)'), findsOneWidget);

      await tester.ensureVisible(find.text('حفظ الوثيقة'));
      await tester.tap(find.text('حفظ الوثيقة'));
      await tester.pumpAndSettle();
      expect(outbox.savedInput, isNull);

      final fieldInput = find.byWidgetPredicate(
        (widget) =>
            widget is TextField &&
            widget.decoration?.labelText == 'اسم الموظف *',
      );
      final titleInput = find.byWidgetPredicate(
        (widget) =>
            widget is TextField &&
            widget.decoration?.labelText == 'عنوان الوثيقة',
      );
      await tester.ensureVisible(fieldInput);
      await tester.enterText(fieldInput, 'أحمد محمد');
      await tester.ensureVisible(titleInput);
      await tester.enterText(titleInput, 'كتاب تكليف');
      await tester.ensureVisible(find.text('حفظ الوثيقة'));
      await tester.tap(find.text('حفظ الوثيقة'));
      await tester.pumpAndSettle();

      expect(outbox.savedInput?['templateId'], 'template-test');
      expect(outbox.savedInput?['fieldValues'], {'employee_name': 'أحمد محمد'});
      expect(outbox.savedInput?['content'].toString(), contains('أحمد محمد'));
      expect(outbox.savedInput?['content'].toString(), isNot(contains('{{employee_name}}')));
    },
  );

  testWidgets(
    'document studio exposes documents, templates, and archive areas',
    (tester) async {
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

      expect(find.text('تعبئة نموذج جاهز'), findsOneWidget);
      expect(find.text('وثيقة فارغة'), findsOneWidget);
      expect(find.text('رفع ملف'), findsOneWidget);

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

      await tester.tap(find.text('الوثائق'));
      await tester.pumpAndSettle();
      expect(find.text('إنشاء وثيقة'), findsOneWidget);

      await tester.tap(find.text('الأرشيف'));
      await tester.pumpAndSettle();

      expect(find.text('لا توجد وثائق مؤرشفة'), findsOneWidget);
    },
  );
}
