import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/document_paper.dart';

void main() {
  testWidgets('repeats the watermark on every A4 preview page', (
    tester,
  ) async {
    await tester.view.setPhysicalSize(const Size(630, 900));
    await tester.view.setDevicePixelRatio(3);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 210,
              child: DocumentPaper(
                showWatermarkText: true,
                watermarkOpacity: 0.12,
                child: SizedBox(height: 700),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(
      find.byKey(const ValueKey('document-watermark-page-0')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('document-watermark-page-1')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('document-watermark-page-2')),
      findsOneWidget,
    );
  });
}
