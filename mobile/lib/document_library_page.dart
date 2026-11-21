import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart' show PdfPreview;

import 'api.dart';
import 'document_studio_models.dart';

/// Native mobile counterpart of the web document library.
///
/// The library intentionally focuses on uploaded files; composing documents
/// and managing templates remain in the document studio.
class DocumentLibraryPage extends StatefulWidget {
  const DocumentLibraryPage({
    super.key,
    required this.api,
    this.onCreateDocument,
  });

  final PoliceApi api;
  final VoidCallback? onCreateDocument;

  @override
  State<DocumentLibraryPage> createState() => _DocumentLibraryPageState();
}

class _DocumentLibraryPageState extends State<DocumentLibraryPage> {
  static const _categories = <String, String>{
    'general': 'عام',
    'administrative': 'إداري',
    'personnel': 'شؤون الموظفين',
    'correspondence': 'مراسلات',
  };

  final _searchController = TextEditingController();
  List<OfficialDocument> _documents = const [];
  String _category = '';
  String? _error;
  bool _loading = true;
  bool _uploading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final raw = await widget.api.call('documentStudio.listDocuments');
      final rows = raw is List
          ? raw
          : raw is Map && raw['items'] is List
          ? raw['items'] as List
          : const <dynamic>[];
      final documents = rows
          .whereType<Map>()
          .map(
            (item) =>
                OfficialDocument.fromJson(Map<String, dynamic>.from(item)),
          )
          .where((document) => document.file != null)
          .toList(growable: false);
      if (!mounted) return;
      setState(() {
        _documents = documents;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  List<OfficialDocument> get _filteredDocuments {
    final query = _searchController.text.trim().toLowerCase();
    return _documents
        .where((document) {
          if (_category.isNotEmpty && document.category != _category) {
            return false;
          }
          if (query.isEmpty) return true;
          final fileName = document.file?.fileName ?? '';
          return <String>[
            document.title,
            document.subject,
            fileName,
          ].any((value) => value.toLowerCase().contains(query));
        })
        .toList(growable: false);
  }

  Future<void> _uploadFile() async {
    if (_uploading) return;
    final selection = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['docx', 'pdf', 'png', 'jpg', 'jpeg', 'webp'],
      withData: true,
      allowMultiple: false,
    );
    if (selection == null || selection.files.isEmpty || !mounted) return;
    final picked = selection.files.single;
    final bytes = picked.bytes;
    if (bytes == null || bytes.isEmpty) {
      _showMessage('تعذر قراءة الملف المحدد من الجهاز');
      return;
    }
    if (bytes.length > PoliceApi.maxDocumentUploadBytes) {
      _showMessage('الحد الأقصى لحجم الملف 25 ميغابايت');
      return;
    }

    final details = await _showUploadDetails(picked.name);
    if (details == null || !mounted) return;

    setState(() => _uploading = true);
    try {
      await widget.api.uploadDocumentFile(
        fileName: picked.name,
        bytes: Uint8List.fromList(bytes),
        title: details.title,
        category: details.category,
        subject: details.subject,
        documentDate: details.date,
      );
      await _load();
      if (mounted) _showMessage('تم رفع الوثيقة وإضافتها إلى المكتبة');
    } catch (error) {
      if (mounted) _showMessage('تعذر رفع الوثيقة: $error');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<_UploadDetails?> _showUploadDetails(String fileName) async {
    final titleController = TextEditingController(
      text: fileName.replaceFirst(RegExp(r'\\.[^.]+$'), '').trim(),
    );
    final subjectController = TextEditingController();
    var category = 'general';
    var date = DateTime.now();
    final result = await showDialog<_UploadDetails>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => Directionality(
          textDirection: ui.TextDirection.rtl,
          child: AlertDialog(
            title: const Text('إضافة وثيقة إلى المكتبة'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    fileName,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(dialogContext).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: titleController,
                    autofocus: true,
                    decoration: const InputDecoration(
                      labelText: 'عنوان الوثيقة *',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: category,
                    decoration: const InputDecoration(
                      labelText: 'التصنيف',
                      border: OutlineInputBorder(),
                    ),
                    items: _categories.entries
                        .map(
                          (entry) => DropdownMenuItem(
                            value: entry.key,
                            child: Text(entry.value),
                          ),
                        )
                        .toList(),
                    onChanged: (value) {
                      if (value != null) {
                        setDialogState(() => category = value);
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: subjectController,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'الموضوع / ملاحظة',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: () async {
                      final pickedDate = await showDatePicker(
                        context: dialogContext,
                        initialDate: date,
                        firstDate: DateTime(1950),
                        lastDate: DateTime(2100),
                      );
                      if (pickedDate != null) {
                        setDialogState(() => date = pickedDate);
                      }
                    },
                    icon: const Icon(Icons.calendar_month_outlined),
                    label: Text(
                      'تاريخ الوثيقة: ${DateFormat('yyyy/MM/dd').format(date)}',
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('إلغاء'),
              ),
              FilledButton(
                onPressed: () {
                  final title = titleController.text.trim();
                  if (title.isEmpty) {
                    ScaffoldMessenger.of(dialogContext).showSnackBar(
                      const SnackBar(content: Text('عنوان الوثيقة مطلوب')),
                    );
                    return;
                  }
                  Navigator.pop(
                    dialogContext,
                    _UploadDetails(
                      title: title,
                      category: category,
                      subject: subjectController.text.trim(),
                      date: date,
                    ),
                  );
                },
                child: const Text('متابعة الرفع'),
              ),
            ],
          ),
        ),
      ),
    );
    titleController.dispose();
    subjectController.dispose();
    return result;
  }

  Future<void> _preview(OfficialDocument document) async {
    if (document.file == null) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog.fullscreen(
        child: Directionality(
          textDirection: ui.TextDirection.rtl,
          child: Scaffold(
            appBar: AppBar(
              title: Text(
                document.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            body: PdfPreview(
              pdfFileName: '${document.title}.pdf',
              canChangePageFormat: false,
              canChangeOrientation: false,
              allowPrinting: true,
              allowSharing: true,
              build: (_) => widget.api.fetchDocumentPrintPdf(document.id),
            ),
          ),
        ),
      ),
    );
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  String _formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes بايت';
    if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} ك.ب';
    }
    return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} م.ب';
  }

  String _statusLabel(String status) => switch (status) {
    'issued' => 'صادرة',
    'archived' => 'مؤرشفة',
    _ => 'مسودة',
  };

  Color _statusColor(BuildContext context, String status) => switch (status) {
    'issued' => const Color(0xFF14745D),
    'archived' => Theme.of(context).colorScheme.onSurfaceVariant,
    _ => Theme.of(context).colorScheme.primary,
  };

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredDocuments;
    final totalPages = _documents.fold<int>(
      0,
      (sum, item) => sum + (item.file?.pageCount ?? 0),
    );
    final totalBytes = _documents.fold<int>(
      0,
      (sum, item) => sum + (item.file?.sizeBytes ?? 0),
    );

    return Directionality(
      textDirection: ui.TextDirection.rtl,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'الأرشيف الرقمي',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'مكتبة الوثائق',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton.icon(
                      onPressed: _uploading ? null : _uploadFile,
                      icon: _uploading
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.upload_file_outlined),
                      label: Text(_uploading ? 'جارٍ الرفع' : 'استيراد ملف'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _statChip(context, 'الوثائق', '${_documents.length}'),
                _statChip(context, 'الصفحات', '$totalPages'),
                _statChip(context, 'الحجم', _formatBytes(totalBytes)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _searchController,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: 'ابحث بالعنوان أو الموضوع أو اسم الملف',
                suffixIcon: _searchController.text.isEmpty
                    ? null
                    : IconButton(
                        onPressed: () {
                          _searchController.clear();
                          setState(() {});
                        },
                        icon: const Icon(Icons.close),
                      ),
                border: const OutlineInputBorder(),
              ),
            ),
          ),
          SizedBox(
            height: 42,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _categoryChip('الكل', ''),
                for (final entry in _categories.entries)
                  _categoryChip(entry.value, entry.key),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null && _documents.isEmpty
                ? _errorState()
                : filtered.isEmpty
                ? _emptyState()
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                      itemCount: filtered.length,
                      itemBuilder: (context, index) {
                        final document = filtered[index];
                        final file = document.file!;
                        return Card(
                          margin: const EdgeInsets.only(bottom: 10),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: () => _preview(document),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  CircleAvatar(
                                    backgroundColor: Theme.of(context)
                                        .colorScheme
                                        .primaryContainer,
                                    child: Icon(
                                      file.mimeType == 'application/pdf'
                                          ? Icons.picture_as_pdf_outlined
                                          : file.mimeType.startsWith('image/')
                                          ? Icons.image_outlined
                                          : Icons.description_outlined,
                                      color: Theme.of(context)
                                          .colorScheme
                                          .primary,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          document.title,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          file.fileName,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodySmall,
                                        ),
                                        if (document.subject.isNotEmpty) ...[
                                          const SizedBox(height: 4),
                                          Text(
                                            document.subject,
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: Theme.of(context)
                                                .textTheme
                                                .bodySmall,
                                          ),
                                        ],
                                        const SizedBox(height: 8),
                                        Wrap(
                                          spacing: 8,
                                          runSpacing: 4,
                                          children: [
                                            Text(
                                              _categories[document.category] ??
                                                  'عام',
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .labelSmall,
                                            ),
                                            Text(
                                              '${file.pageCount} صفحة',
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .labelSmall,
                                            ),
                                            Text(
                                              _formatBytes(file.sizeBytes),
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .labelSmall,
                                            ),
                                            Text(
                                              DateFormat('yyyy/MM/dd').format(
                                                document.documentDate.toLocal(),
                                              ),
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .labelSmall,
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 6),
                                        Chip(
                                          visualDensity: VisualDensity.compact,
                                          label: Text(
                                            _statusLabel(document.status),
                                          ),
                                          labelStyle: TextStyle(
                                            color: _statusColor(
                                              context,
                                              document.status,
                                            ),
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  IconButton(
                                    tooltip: 'معاينة وطباعة الوثيقة',
                                    onPressed: () => _preview(document),
                                    icon: const Icon(Icons.visibility_outlined),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _statChip(BuildContext context, String label, String value) => Chip(
    avatar: const Icon(Icons.insert_drive_file_outlined, size: 16),
    label: Text('$label: $value'),
    visualDensity: VisualDensity.compact,
  );

  Widget _categoryChip(String label, String value) => Padding(
    padding: const EdgeInsetsDirectional.only(end: 6),
    child: ChoiceChip(
      label: Text(label),
      selected: _category == value,
      onSelected: (_) => setState(() => _category = value),
    ),
  );

  Widget _errorState() => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_outlined, size: 42),
          const SizedBox(height: 10),
          const Text('تعذر تحميل مكتبة الوثائق'),
          const SizedBox(height: 6),
          Text(
            _error ?? '',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _load,
            icon: const Icon(Icons.refresh),
            label: const Text('إعادة المحاولة'),
          ),
        ],
      ),
    ),
  );

  Widget _emptyState() => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    children: [
      const SizedBox(height: 70),
      Icon(
        Icons.folder_open_outlined,
        size: 48,
        color: Theme.of(context).disabledColor,
      ),
      const SizedBox(height: 12),
      Center(
        child: Text(
          _documents.isEmpty ? 'المكتبة فارغة' : 'لا توجد نتائج مطابقة',
          style: Theme.of(context).textTheme.titleMedium,
        ),
      ),
      const SizedBox(height: 6),
      Center(
        child: Text(
          _documents.isEmpty
              ? 'ارفع أول وثيقة Word أو PDF أو صورة.'
              : 'جرّب عبارة بحث أخرى أو أزل تصفية التصنيف.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ),
      if (_documents.isEmpty) ...[
        const SizedBox(height: 14),
        Center(
          child: FilledButton.icon(
            onPressed: _uploading ? null : _uploadFile,
            icon: const Icon(Icons.upload_file_outlined),
            label: const Text('رفع وثيقة'),
          ),
        ),
      ],
    ],
  );
}

class _UploadDetails {
  const _UploadDetails({
    required this.title,
    required this.category,
    required this.subject,
    required this.date,
  });

  final String title;
  final String category;
  final String subject;
  final DateTime date;
}
