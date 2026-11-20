import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/document_print_layout.dart';

void main() {
  group('DocumentPrintLayout.pageGroups', () {
    test('one-up creates one output sheet for every source page', () {
      final groups = DocumentPrintLayout.pageGroups(
        pageCount: 3,
        pagesPerSheet: 1,
      );

      expect(groups, [
        <int>[0],
        <int>[1],
        <int>[2],
      ]);
      expect(groups, hasLength(3));
      expect(groups.expand((group) => group), [0, 1, 2]);
    });

    test('two-up preserves order and leaves an odd final page on its own', () {
      final groups = DocumentPrintLayout.pageGroups(
        pageCount: 5,
        pagesPerSheet: 2,
      );

      expect(groups, [
        <int>[0, 1],
        <int>[2, 3],
        <int>[4],
      ]);
      expect(groups, hasLength(3));
      expect(groups.expand((group) => group), [0, 1, 2, 3, 4]);
    });

    test(
      'four-up preserves order and handles a partially filled final sheet',
      () {
        final groups = DocumentPrintLayout.pageGroups(
          pageCount: 9,
          pagesPerSheet: 4,
        );

        expect(groups, [
          <int>[0, 1, 2, 3],
          <int>[4, 5, 6, 7],
          <int>[8],
        ]);
        expect(groups, hasLength(3));
        expect(groups.expand((group) => group), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
      },
    );

    test('a single source page produces a valid partial sheet', () {
      expect(DocumentPrintLayout.pageGroups(pageCount: 1, pagesPerSheet: 4), [
        <int>[0],
      ]);
    });

    test(
      'rejects empty documents, excessive counts and unsupported layouts',
      () {
        expect(
          () => DocumentPrintLayout.pageGroups(pageCount: 0, pagesPerSheet: 1),
          throwsArgumentError,
        );
        expect(
          () => DocumentPrintLayout.pageGroups(
            pageCount: DocumentPrintLayout.maxSourcePages + 1,
            pagesPerSheet: 1,
          ),
          throwsArgumentError,
        );
        expect(
          () => DocumentPrintLayout.pageGroups(pageCount: 1, pagesPerSheet: 3),
          throwsArgumentError,
        );
      },
    );
  });

  test('rejects empty source bytes before invoking printing', () async {
    await expectLater(
      DocumentPrintLayout.createA4Pdf(
        sourcePdf: Uint8List(0),
        pagesPerSheet: 1,
      ),
      throwsArgumentError,
    );
  });
}
