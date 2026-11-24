import 'document_studio_models.dart';

/// Normalizes Arabic text so searches remain useful across common spelling
/// variants, optional diacritics, and the Arabic tatweel character.
String normalizeDocumentSearch(String value) {
  return value
      .toLowerCase()
      .replaceAll(RegExp(r'[\u064B-\u065F\u0670\u0640]'), '')
      .replaceAll(RegExp(r'[\u0622\u0623\u0625\u0671]'), 'ا')
      .replaceAll('ى', 'ي')
      .replaceAll('ة', 'ه')
      .trim();
}

List<OfficialDocument> filterAndSortDocuments(
  List<OfficialDocument> documents, {
  String search = '',
  String category = '',
  String status = 'all',
  String sort = 'updated-desc',
}) {
  final query = normalizeDocumentSearch(search);
  final result = documents.where((document) {
    if (category.isNotEmpty && document.category != category) return false;
    if (status != 'all' && document.status != status) return false;
    if (query.isEmpty) return true;
    return <String>[
      document.title,
      document.subject,
      document.file?.fileName ?? '',
      document.serialCode,
    ].any((value) => normalizeDocumentSearch(value).contains(query));
  }).toList();

  result.sort((left, right) {
    if (sort == 'title-asc') {
      final titleOrder = left.title.toLowerCase().compareTo(
        right.title.toLowerCase(),
      );
      return titleOrder != 0 ? titleOrder : left.id.compareTo(right.id);
    }
    final dateOrder = left.updatedAt.compareTo(right.updatedAt);
    final orderedDate = sort == 'updated-asc' ? dateOrder : -dateOrder;
    return orderedDate != 0 ? orderedDate : left.id.compareTo(right.id);
  });
  return result;
}
