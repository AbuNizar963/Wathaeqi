import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/document_studio_outbox.dart';
import 'package:police_telegrams/document_studio_page.dart';

class _DocumentStudioTestApi extends PoliceApi {
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
      'documentStudio.listDocuments' => <dynamic>[],
      'documentStudio.listTemplates' => <dynamic>[],
      'organizations.context' => {
        'organizationId': 'org-test',
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
  testWidgets('document studio opens with its three work areas', (
    tester,
  ) async {
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

    expect(find.text('إعداد الوثائق الرسمية'), findsOneWidget);
    expect(find.text('وثيقة جديدة'), findsOneWidget);
    expect(find.text('لا توجد وثائق بعد'), findsOneWidget);
    expect(find.text('الوثائق'), findsOneWidget);
    expect(find.text('القوالب'), findsOneWidget);
    expect(find.text('الأرشيف'), findsOneWidget);
    expect(api.calls.containsKey('documentStudio.listDocuments'), isTrue);
    expect(api.calls.containsKey('documentStudio.listTemplates'), isTrue);

    await tester.tap(find.text('القوالب'));
    await tester.pumpAndSettle();

    expect(find.text('مكتبة النماذج'), findsOneWidget);
    expect(find.text('نموذج جديد'), findsOneWidget);

    await tester.tap(find.text('الأرشيف'));
    await tester.pumpAndSettle();

    expect(find.text('لا توجد وثائق مؤرشفة'), findsOneWidget);
  });
}
