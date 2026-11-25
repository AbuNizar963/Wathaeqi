import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pdf/pdf.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/document_native_output.dart';
import 'package:police_telegrams/document_transfer.dart';
import 'package:police_telegrams/document_output_security.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  String? token;
  final pdf = Uint8List.fromList(utf8.encode('%PDF-1.7\nfixture'));

  testWidgets(
    'measured progress animates toward actual bytes without overshooting',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: MeasuredDocumentProgress(value: .8)),
      );
      await tester.pump(const Duration(milliseconds: 120));
      var indicator = tester.widget<LinearProgressIndicator>(
        find.byType(LinearProgressIndicator),
      );
      expect(indicator.value, greaterThan(0));
      expect(indicator.value, lessThan(.8));
      expect(indicator.semanticsValue, '80%');
      await tester.pump(const Duration(milliseconds: 240));
      indicator = tester.widget<LinearProgressIndicator>(
        find.byType(LinearProgressIndicator),
      );
      expect(indicator.value, .8);
      await tester.pumpWidget(
        const MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(disableAnimations: true),
            child: MeasuredDocumentProgress(value: .5),
          ),
        ),
      );
      await tester.pump();
      indicator = tester.widget<LinearProgressIndicator>(
        find.byType(LinearProgressIndicator),
      );
      expect(indicator.value, .5);
      await tester.pumpWidget(
        const MaterialApp(home: MeasuredDocumentProgress(value: null)),
      );
      expect(
        tester
            .widget<LinearProgressIndicator>(
              find.byType(LinearProgressIndicator),
            )
            .value,
        isNull,
      );
    },
  );

  setUp(() {
    token = 'synthetic-session';
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
          (call) async => call.method == 'read' ? token : null,
        );
  });

  test(
    'native print uses layoutPdf, unchanged A4 bytes, cancellation and errors',
    () async {
      const channel = MethodChannel('net.nfet.printing');
      const codec = StandardMethodCodec();
      var printed = true;
      String? failure;
      var calls = 0;
      Uint8List? received;
      Future<dynamic> platformCall(
        String method,
        Map<String, dynamic> args,
      ) async {
        final response = Completer<ByteData?>();
        TestWidgetsFlutterBinding.instance.channelBuffers.push(
          channel.name,
          codec.encodeMethodCall(MethodCall(method, args)),
          response.complete,
        );
        return codec.decodeEnvelope((await response.future)!);
      }

      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
            if (call.method != 'printPdf') return null;
            calls++;
            final args = Map<String, dynamic>.from(call.arguments as Map);
            expect(args['width'], PdfPageFormat.a4.width);
            expect(args['height'], PdfPageFormat.a4.height);
            expect(args['dynamic'], isFalse);
            expect(args['name'], 'report.pdf');
            received = await platformCall('onLayout', {
              'job': args['job'],
              'width': PdfPageFormat.letter.width,
              'height': PdfPageFormat.letter.height,
              'marginLeft': 0.0,
              'marginRight': 0.0,
              'marginTop': 0.0,
              'marginBottom': 0.0,
            }) as Uint8List;
            unawaited(
              Future<void>.delayed(Duration.zero, () async {
                await platformCall('onCompleted', {
                  'job': args['job'],
                  'completed': failure == null ? printed : false,
                  'error': failure,
                });
              }),
            );
            return 1;
          });
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, null),
      );
      expect(await printDocumentBytes(pdf, name: '../report.pdf'), isTrue);
      expect(received, pdf);
      printed = false;
      expect(await printDocumentBytes(pdf, name: 'report.pdf'), isFalse);
      failure = 'platform failure';
      await expectLater(
        printDocumentBytes(pdf, name: 'report.pdf'),
        throwsA('platform failure'),
      );
      expect(
        () => printDocumentBytes(Uint8List(0), name: 'report.pdf'),
        throwsFormatException,
      );
      expect(calls, 3);
      expect(safeDocumentFileName('../../report.pdf'), 'report.pdf');
      expect(safeDocumentFileName('..'), 'document.pdf');
    },
  );

  test(
    'image print wrapper creates a real PDF without altering the original',
    () async {
      final image = Uint8List.fromList(
        base64Decode(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=',
        ),
      );
      final original = Uint8List.fromList(image);
      final pdf = await imageDocumentPdf(image);
      expect(hasPdfSignature(pdf), isTrue);
      expect(image, original);
    },
  );

  test(
    'percentages only measure known byte counts and reset for processing',
    () {
      final transfer = DocumentTransfer();
      addTearDown(transfer.dispose);
      expect(transfer.fraction, isNull);
      transfer.bytes(50, 100);
      expect(transfer.fraction, .5);
      transfer.stage('معالجة');
      expect(transfer.fraction, isNull);
      transfer.bytes(50, null);
      expect(transfer.fraction, isNull);
      transfer.cancel();
      expect(
        transfer.checkCancelled,
        throwsA(isA<DocumentTransferCancelled>()),
      );
    },
  );

  test('authenticated Appwrite route streams real bytes without redirects or cache', () async {
    final chunks = StreamController<List<int>>();
    final connected = Completer<void>();
    final client = MockClient.streaming((request, _) async {
      expect(request.url.origin, 'https://appwrite.example.test');
      expect(request.url.path, '/api/documents/document-a/file');
      expect(request.headers['authorization'], 'Bearer synthetic-session');
      expect(request.followRedirects, isFalse);
      connected.complete();
      return http.StreamedResponse(
        chunks.stream,
        200,
        contentLength: pdf.length,
        headers: {'content-type': 'application/pdf'},
      );
    });
    addTearDown(client.close);
    final transfer = DocumentTransfer();
    addTearDown(transfer.dispose);
    final seen = <double?>[];
    transfer.addListener(() => seen.add(transfer.fraction));
    final api = PoliceApi(
      baseUrl: 'https://appwrite.example.test',
      httpClient: client,
    );
    final output = api.fetchDocumentFileBytes(
      documentId: 'document-a',
      mimeType: 'application/pdf',
      transfer: transfer,
    );
    await connected.future;
    await Future<void>.delayed(Duration.zero);
    chunks.add(pdf.sublist(0, 5));
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(transfer.receivedBytes, 5);
    expect(transfer.fraction, 5 / pdf.length);
    chunks.add(pdf.sublist(5));
    await chunks.close();
    expect(await output, pdf);
    expect(seen, contains(1.0));
    expect(transfer.fraction, isNull); // validation is not a fake percentage
  });

  test(
    'denies missing auth, unsafe origins, local IDs and cross-tenant 403',
    () async {
      var requests = 0;
      final client = MockClient((request) async {
        requests++;
        return http.Response('sensitive upstream details', 403);
      });
      addTearDown(client.close);
      final api = PoliceApi(
        baseUrl: 'https://appwrite.example.test',
        httpClient: client,
      );
      token = null;
      await expectLater(
        api.fetchDocumentFileBytes(
          documentId: 'document-a',
          mimeType: 'application/pdf',
        ),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 401)),
      );
      expect(requests, 0);
      token = 'synthetic-session';
      for (final id in ['../other-tenant', 'local_unsynced', '', '.', '..']) {
        await expectLater(
          api.fetchDocumentFileBytes(
            documentId: id,
            mimeType: 'application/pdf',
          ),
          throwsFormatException,
        );
      }
      final unsafe = PoliceApi(
        baseUrl: 'http://untrusted.example.test',
        httpClient: client,
      );
      await expectLater(
        unsafe.fetchDocumentPrintPdf('document-a'),
        throwsFormatException,
      );
      expect(requests, 0);
      await expectLater(
        api.fetchDocumentFileBytes(
          documentId: 'other-tenant-document',
          mimeType: 'application/pdf',
        ),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'status', 403)
              .having(
                (e) => e.message,
                'safe error',
                isNot(contains('upstream')),
              ),
        ),
      );
      expect(requests, 1);
    },
  );

  test(
    'cancels idle streaming promptly without closing a shared HTTP client',
    () async {
      var streamCancelled = false;
      final chunks = StreamController<List<int>>(
        onCancel: () {
          streamCancelled = true;
        },
      );
      final started = Completer<void>();
      final client = MockClient.streaming((request, _) async {
        started.complete();
        return http.StreamedResponse(
          chunks.stream,
          200,
          headers: {'content-type': 'application/pdf'},
        );
      });
      addTearDown(client.close);
      final api = PoliceApi(
        baseUrl: 'https://appwrite.example.test',
        httpClient: client,
      );
      final transfer = DocumentTransfer();
      addTearDown(transfer.dispose);
      final request = api.fetchDocumentFileBytes(
        documentId: 'document-a',
        mimeType: 'application/pdf',
        transfer: transfer,
      );
      final denied = expectLater(
        request,
        throwsA(isA<DocumentTransferCancelled>()),
      );
      await started.future;
      await Future<void>.delayed(Duration.zero);
      transfer.cancel();
      await denied;
      expect(streamCancelled, isTrue);
      await chunks.close();
    },
  );

  test('rejects redirects, oversized declarations, truncation and invalid signatures', () async {
    final cases = <http.StreamedResponse Function()>[
      () => http.StreamedResponse(
        const Stream.empty(),
        302,
        headers: {'location': 'https://evil.example.test/private'},
      ),
      () => http.StreamedResponse(
        const Stream.empty(),
        200,
        contentLength: PoliceApi.maxDocumentUploadBytes + 1,
      ),
      () => http.StreamedResponse(
        Stream.value(pdf),
        200,
        contentLength: pdf.length + 1,
        headers: {'content-type': 'application/pdf'},
      ),
      () => http.StreamedResponse(
        Stream.value([1, 2, 3]),
        200,
        headers: {'content-type': 'application/pdf'},
      ),
      () => http.StreamedResponse(
        Stream.value(List<int>.filled(PoliceApi.maxDocumentUploadBytes + 1, 0)),
        200,
        headers: {'content-type': 'application/pdf'},
      ),
    ];
    for (final response in cases) {
      final client = MockClient.streaming((_, _) async => response());
      final api = PoliceApi(
        baseUrl: 'https://appwrite.example.test',
        httpClient: client,
      );
      await expectLater(
        api.fetchDocumentPrintPdf('document-a'),
        throwsA(isA<ApiException>()),
      );
      client.close();
    }
  });

  testWidgets(
    'failed output keeps retry and safe errors; cancellation has no success',
    (tester) async {
      var attempts = 0;
      bool? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () async {
                  result = await showDocumentOutputDialog(
                    context: context,
                    title: 'إخراج',
                    action: (transfer) async {
                      attempts++;
                      if (attempts == 1) {
                        throw const ApiException(403, 'secret-url');
                      }
                      return false;
                    },
                  );
                },
                child: const Text('فتح'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('فتح'));
      await tester.pumpAndSettle();
      expect(find.textContaining('لا تملك صلاحية'), findsOneWidget);
      expect(find.textContaining('secret-url'), findsNothing);
      await tester.tap(find.text('إعادة المحاولة'));
      await tester.pumpAndSettle();
      expect(attempts, 2);
      expect(result, isFalse);
      expect(find.text('اكتمل العمل'), findsNothing);
    },
  );
}
