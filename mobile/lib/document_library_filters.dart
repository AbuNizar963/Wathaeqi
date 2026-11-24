import 'document_studio_models.dart';

List<OfficialDocument> filterAndSortDocuments(
  List<OfficialDocument> documents, {
  String search = '',
  String category = '',
  String status = 'all',
  String sort = 'updated-desc',
}) {
  final query = search.trim().toLowerCase();
  final result = documents.where((document) {
    if (category.isNotEmpty && document.category != category) return false;
    if (status != 'all' && document.status != status) return false;
    if (query.isEmpty) return true;
    return <String>[
      document.title,
      document.subject,
      document.file?.fileName ?? '',
      document.serialCode,
    ].any((value) => value.toLowerCase().contains(query));
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
