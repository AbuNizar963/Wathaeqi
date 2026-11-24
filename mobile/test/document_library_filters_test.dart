import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/document_library_filters.dart';
import 'package:police_telegrams/document_studio_models.dart';

OfficialDocument makeDocument(
  String id,
  String title,
  String status,
  DateTime updatedAt,
) => OfficialDocument(
  id: id,
  ownerId: 'owner',
  title: title,
  category: 'general',
  subject: 'موضوع',
  content: const {},
  fieldValues: const {},
  serialNumber: 1,
  serialCode: 'DOC-$id',
  documentDate: updatedAt,
  status: status,
  createdAt: updatedAt,
  updatedAt: updatedAt,
);

void main() {
  final documents = [
    makeDocument('1', 'تقرير ألف', 'draft', DateTime.utc(2026, 1)),
    makeDocument('2', 'تقرير باء', 'issued', DateTime.utc(2026, 2)),
    makeDocument('3', 'محضر', 'archived', DateTime.utc(2026, 3)),
  ];

  test('filters by status and serial number', () {
    expect(
      filterAndSortDocuments(
        documents,
        status: 'issued',
      ).map((item) => item.id),
      ['2'],
    );
    expect(
      filterAndSortDocuments(documents, search: 'DOC-3').map((item) => item.id),
      ['3'],
    );
  });

  test(
    'matches Arabic search despite alef variants, diacritics, and taa marbuta',
    () {
    final arabicDocument = OfficialDocument(
      id: 'arabic',
      ownerId: 'owner',
      title: 'إِدَارَةُ المُوَارَدِ البَشَرِيَّة',
      category: 'general',
      subject: 'موضوع',
      content: const {},
      fieldValues: const {},
      serialNumber: 4,
      serialCode: 'DOC-arabic',
      documentDate: DateTime.utc(2026, 4),
      status: 'issued',
      createdAt: DateTime.utc(2026, 4),
      updatedAt: DateTime.utc(2026, 4),
    );

    expect(
      filterAndSortDocuments(
        [arabicDocument],
        search: 'اداره الموارد البشريه',
      ).map((item) => item.id),
      ['arabic'],
    );
  });

  test('sorts newest, oldest, and title without mutating source', () {
    expect(filterAndSortDocuments(documents).map((item) => item.id), [
      '3',
      '2',
      '1',
    ]);
    expect(
      filterAndSortDocuments(
        documents,
        sort: 'updated-asc',
      ).map((item) => item.id),
      ['1', '2', '3'],
    );
    expect(
      filterAndSortDocuments(
        documents,
        sort: 'title-asc',
      ).map((item) => item.id),
      ['1', '2', '3'],
    );
    expect(documents.map((item) => item.id), ['1', '2', '3']);
  });
}
