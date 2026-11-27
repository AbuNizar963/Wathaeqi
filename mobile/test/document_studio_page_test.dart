import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:printing/printing.dart' show PdfPreview;
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/document_studio_outbox.dart';
import 'package:police_telegrams/document_studio_page.dart';
import 'package:police_telegrams/document_paper.dart';
import 'package:police_telegrams/document_library_page.dart';
import 'package:police_telegrams/document_transfer.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class _DocumentStudioTestApi extends PoliceApi {
  _DocumentStudioTestApi({
    this.includeOrganization = true,
    this.includeDocument = false,
    this.includeWordFile = false,
    this.documentContent,
    this.templateContent,
    this.templateFields = const <dynamic>[],
  });

  final bool includeOrganization;
  final bool includeDocument;
  final bool includeWordFile;
  final Map<String, dynamic>? documentContent;
  final Map<String, dynamic>? templateContent;
  final List<dynamic> templateFields;
  final calls = <String, Map<String, dynamic>?>{};
  final printPdfDocumentIds = <String>[];

  @override
  Future<Uint8List> fetchDocumentPrintPdf(
    String documentId, {
    DocumentTransfer? transfer,
  }) async {
    printPdfDocumentIds.add(documentId);
    return _minimalPdfBytes();
  }

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
                  if (includeWordFile)
                    'file': {
                      'fileName': 'report.docx',
                      'mimeType': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                      'sizeBytes': 1024,
                      'pageCount': 1,
                    },
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

Uint8List _minimalPdfBytes() {
  final parts = <String>['%PDF-1.4\n'];
  final offsets = <int>[0];
  void addObject(String value) {
    offsets.add(utf8.encode(parts.join()).length);
    parts.add(value);
  }

  addObject('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  addObject('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  addObject(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>\nendobj\n',
  );
  addObject('4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n');
  final xrefOffset = utf8.encode(parts.join()).length;
  parts.add('xref\n0 5\n0000000000 65535 f \n');
  for (final offset in offsets.skip(1)) {
    parts.add('${offset.toString().padLeft(10, '0')} 00000 n \n');
  }
  parts.add(
    'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n$xrefOffset\n%%EOF\n',
  );
  return Uint8List.fromList(utf8.encode(parts.join()));
}

void main() {
  testWidgets(
    'one workspace has four Lucide tabs and retains file search across editors',
    (tester) async {
      tester.view.physicalSize = const Size(390, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = _DocumentStudioTestApi();
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
      final tabs = tester
          .widgetList<ChoiceChip>(find.byType(ChoiceChip))
          .toList();
      expect(tabs, hasLength(DocumentStudioTab.values.length));
      expect(tabs.map((tab) => (tab.label as Text).data), [
        'الوثائق',
        'القوالب',
        'الأرشيف',
        'الملفات',
      ]);
      expect(tabs.map((tab) => (tab.avatar as Icon).icon), [
        LucideIcons.fileText,
        LucideIcons.layoutTemplate,
        LucideIcons.archive,
        LucideIcons.folderOpen,
      ]);
      final workspaceState = tester.state(find.byType(DocumentStudioPage));
      await tester.ensureVisible(find.text('الملفات').first);
      await tester.tap(find.text('الملفات').first);
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'بحث محفوظ');
      await tester.pump();
      final libraryState = tester.state(find.byType(DocumentLibraryPage));
      await tester.ensureVisible(find.text('القوالب').first);
      await tester.tap(find.text('القوالب').first);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('الملفات').first);
      await tester.tap(find.text('الملفات').first);
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'بحث محفوظ',
      );
      expect(
        tester.state(find.byType(DocumentLibraryPage)),
        same(libraryState),
      );
      expect(
        tester.state(find.byType(DocumentStudioPage)),
        same(workspaceState),
      );
      expect(find.text('حالة الوثيقة'), findsOneWidget);
      expect(find.text('الترتيب'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('unsaved editor text survives all four workspace tabs', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = _DocumentStudioTestApi(includeDocument: true);
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
              outbox: _DocumentStudioTestOutbox(api: api),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('وثيقة تجريبية'));
    await tester.tap(find.text('وثيقة تجريبية'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('تعديل الوثيقة'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تعديل الوثيقة'));
    await tester.pumpAndSettle();
    final title = find.byWidgetPredicate(
      (w) => w is TextField && w.decoration?.labelText == 'عنوان الوثيقة',
    );
    await tester.ensureVisible(title);
    await tester.pumpAndSettle();
    await tester.enterText(title, 'عنوان لم يُحفظ بعد');
    for (final tab in ['الأرشيف', 'القوالب', 'الملفات', 'الوثائق']) {
      await tester.ensureVisible(find.text(tab).first);
      await tester.tap(find.text(tab).first);
      await tester.pumpAndSettle();
    }
    expect(
      tester.widget<TextField>(title).controller!.text,
      'عنوان لم يُحفظ بعد',
    );
    expect(tester.takeException(), isNull);
  });

  for (final width in [320.0, 768.0, 1440.0]) {
    testWidgets('workspace tabs and files have no overflow at $width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = _DocumentStudioTestApi();
      await tester.pumpWidget(
        MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              body: DocumentStudioPage(
                api: api,
                outbox: _DocumentStudioTestOutbox(api: api),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      for (final tab in ['القوالب', 'الأرشيف', 'الملفات', 'الوثائق']) {
        final tabFinder = find.text(tab).first;
        final tabBounds = tester.getRect(tabFinder);
        expect(
          tabBounds.left,
          greaterThanOrEqualTo(0),
          reason: 'The $tab tab must not be clipped on a $width px screen.',
        );
        expect(
          tabBounds.right,
          lessThanOrEqualTo(width),
          reason: 'The $tab tab must be visible without horizontal scrolling.',
        );
        await tester.tap(tabFinder);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      }
    });
  }

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
    'imported Word documents stay in the original files tab and keep their actions',
    (tester) async {
      final api = _DocumentStudioTestApi(
        includeDocument: true,
        includeWordFile: true,
      );
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

      // Imported originals belong to the dedicated files tab, not both lists.
      expect(find.text('وثيقة تجريبية'), findsNothing);
      await tester.ensureVisible(find.text('الملفات').first);
      await tester.tap(find.text('الملفات').first);
      await tester.pumpAndSettle();
      expect(find.text('وثيقة تجريبية'), findsOneWidget);
      await tester.tap(find.text('وثيقة تجريبية').first);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.tap(find.text('تعديل').last);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump(const Duration(seconds: 2));

      expect(find.byType(PdfPreview), findsOneWidget);
      expect(find.text('تنزيل Word'), findsOneWidget);
      expect(find.text('مشاركة Word'), findsOneWidget);
      expect(find.text('تنزيل PDF'), findsNothing);
      expect(find.text('مشاركة PDF'), findsNothing);
      expect(find.text('طباعة'), findsOneWidget);
      expect(
        tester
            .widget<OutlinedButton>(
              find.widgetWithText(OutlinedButton, 'طباعة'),
            )
            .onPressed,
        isNotNull,
      );
      expect(api.printPdfDocumentIds, contains('doc-preview-test'));
    },
  );

  testWidgets(
    'Word library preview prints a server PDF while keeping original file actions',
    (tester) async {
      final api = _DocumentStudioTestApi(
        includeDocument: true,
        includeWordFile: true,
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(body: DocumentLibraryPage(api: api)),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('وثيقة تجريبية'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 2));

      expect(find.byType(PdfPreview), findsOneWidget);
      expect(find.text('تنزيل Word'), findsOneWidget);
      expect(find.text('مشاركة Word'), findsOneWidget);
      expect(find.text('طباعة'), findsOneWidget);
      final printButton = find.ancestor(
        of: find.text('طباعة'),
        matching: find.byWidgetPredicate(
          (widget) => widget is ButtonStyleButton,
        ),
      );
      expect(printButton, findsOneWidget);
      expect(
        tester.widget<ButtonStyleButton>(printButton).onPressed,
        isNotNull,
      );
      expect(find.text('2 صفحات'), findsOneWidget);
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, '2 صفحات'))
            .onSelected,
        isNotNull,
      );
      expect(api.printPdfDocumentIds, contains('doc-preview-test'));
    },
  );

  testWidgets(
    'guided document creation preserves template fields and recipient formatting',
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
            {
              'type': 'paragraph',
              'content': [
                {'type': 'text', 'text': 'الجهة: {{department}}'},
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
          {
            'key': 'department',
            'label': 'الجهة',
            'type': 'select',
            'required': false,
            'options': [
              {'value': 'option_1', 'label': 'مديرية الشؤون العامة'},
            ],
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
      await tester.pumpAndSettle();
      await tester.tap(find.text('حفظ الوثيقة'));
      await tester.pumpAndSettle();
      expect(outbox.savedInput, isNull);
      expect(find.text('أكمل الحقول المطلوبة: اسم الموظف'), findsOneWidget);

      final fieldInput = find.byWidgetPredicate(
        (widget) =>
            widget is TextField &&
            widget.decoration?.labelText == 'اسم الموظف *',
      );
      await tester.ensureVisible(fieldInput);
      await tester.pumpAndSettle();
      await tester.enterText(fieldInput, 'أحمد محمد');
      tester.testTextInput.hide();
      await tester.pumpAndSettle();
      final recipientInput = find.byWidgetPredicate(
        (widget) =>
            widget is TextField &&
            widget.decoration?.labelText == 'الجهة المستلمة',
      );
      await tester.ensureVisible(recipientInput);
      await tester.enterText(recipientInput, 'الإدارة العامة للشؤون القانونية');
      final departmentInput = find.byWidgetPredicate(
        (widget) =>
            widget is DropdownButtonFormField<String> &&
            widget.decoration.labelText == 'الجهة',
      );
      await tester.ensureVisible(departmentInput);
      await tester.tap(departmentInput);
      await tester.pumpAndSettle();
      await tester.tap(find.text('مديرية الشؤون العامة').last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('تحرير النص يدوياً (اختياري)'));
      await tester.tap(find.text('تحرير النص يدوياً (اختياري)'));
      await tester.pumpAndSettle();
      final recipientLineFinder = find.byWidgetPredicate(
        (widget) =>
            widget is RichText &&
            widget.text.toPlainText().contains(
              'الإدارة العامة للشؤون القانونية',
            ),
      );
      expect(recipientLineFinder, findsOneWidget);
      final recipientLine = tester.widget<RichText>(recipientLineFinder);
      expect(recipientLine.textAlign, TextAlign.center);
      final recipientSpans = (recipientLine.text as TextSpan).children!;
      expect(recipientSpans.first.style?.fontSize, 18);
      expect(recipientSpans.first.style?.fontWeight, FontWeight.bold);
      expect(recipientSpans.last.style?.fontSize, 16);
      await tester.ensureVisible(find.text('حفظ الوثيقة'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('حفظ الوثيقة'));
      await tester.pumpAndSettle();

      expect(outbox.savedInput?['templateId'], 'template-test');
      expect(outbox.savedInput?['fieldValues'], {
        'employee_name': 'أحمد محمد',
        'department': 'مديرية الشؤون العامة',
        'document_recipient_label': 'إلى',
        'document_recipient': 'الإدارة العامة للشؤون القانونية',
      });
      expect(outbox.savedInput?['content'].toString(), contains('أحمد محمد'));
      expect(
        outbox.savedInput?['content'].toString(),
        isNot(contains('{{employee_name}}')),
      );
      expect(
        outbox.savedInput?['content'].toString(),
        contains('مديرية الشؤون العامة'),
      );
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

  testWidgets(
    'template key normalization preserves field focus and saves the normalized key',
    (tester) async {
      tester.view.physicalSize = const Size(480, 1800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
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
            'required': false,
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
      await tester.tap(find.text('القوالب'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('نموذج تجريبي'));
      await tester.pumpAndSettle();

      final keyField = find.byKey(const ValueKey('field-key-0'));
      await tester.ensureVisible(keyField);
      await tester.tap(keyField);
      await tester.enterText(keyField, 'department office');
      await tester.pump();

      final editable = tester.widget<EditableText>(
        find.descendant(of: keyField, matching: find.byType(EditableText)),
      );
      expect(editable.focusNode.hasFocus, isTrue);

      tester.testTextInput.hide();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('حفظ النموذج'));
      await tester.tap(find.text('حفظ النموذج'));
      await tester.pumpAndSettle();

      final savedFields = outbox.savedInput?['fields'] as List<dynamic>;
      expect(savedFields.single['key'], 'department_office');
    },
  );
}
