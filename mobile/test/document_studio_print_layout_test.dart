import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/document_studio_print_layout.dart';

void main() {
  group('DocumentStudioPrintLayout', () {
    test('maps every supported page count to the expected A4 grid', () {
      expect(DocumentStudioPrintLayout.gridFor(1), (columns: 1, rows: 1));
      expect(DocumentStudioPrintLayout.gridFor(2), (columns: 1, rows: 2));
      expect(DocumentStudioPrintLayout.gridFor(4), (columns: 2, rows: 2));
      expect(DocumentStudioPrintLayout.gridFor(6), (columns: 2, rows: 3));
      expect(DocumentStudioPrintLayout.gridFor(8), (columns: 2, rows: 4));
    });

    test(
      'rejects unsupported page counts instead of silently changing them',
      () {
        expect(() => DocumentStudioPrintLayout.gridFor(3), throwsArgumentError);
      },
    );
  });
}
