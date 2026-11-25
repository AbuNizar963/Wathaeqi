import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart' show PdfPreview;
import 'package:share_plus/share_plus.dart';

import 'api.dart';
import 'app_theme.dart';
import 'closable_dialog_title.dart';
import 'document_studio_models.dart';
import 'document_file_support.dart';
import 'document_print_layout.dart';
import 'document_library_filters.dart';
import 'document_transfer.dart';
import 'document_native_output.dart';

import 'package:lucide_icons_flutter/lucide_icons.dart';

/// Native mobile counterpart of the web document library.
///
/// The library intentionally focuses on uploaded files; composing documents
/// and managing templates remain in the document studio.
class DocumentLibraryPage extends StatefulWidget {
  const DocumentLibraryPage({
    super.key,
    required this.api,
    this.onEditDocument,
    this.embedded = false,
  });

  final PoliceApi api;
  final bool embedded;
  final ValueChanged<OfficialDocument>? onEditDocument;

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
  String _statusFilter = 'all';
  String _sortOrder = 'updated-desc';
  String? _error;
  bool _loading = true;
  bool _uploading = false;
  StreamSubscription<ApiMutationEvent>? _subscription;

  @override
  void initState() {
    super.initState();
    _load();
    _subscription = widget.api.mutationEvents.listen((event) {
      if (event.isDocumentStudioMutation && mounted) unawaited(_load());
    });
  }

  @override
  void dispose() {
    _subscription?.cancel();
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
        _error = documentOutputError(error);
        if (error is ApiException &&
            (error.statusCode == 401 || error.statusCode == 403)) {
          _documents = const [];
        }
        _loading = false;
      });
    }
  }

  List<OfficialDocument> get _filteredDocuments => filterAndSortDocuments(
    _documents,
    search: _searchController.text,
    category: _category,
    status: _statusFilter,
    sort: _sortOrder,
  );

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
            title: closableDialogTitle(
              dialogContext,
              const Text('إضافة وثيقة إلى المكتبة'),
            ),
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
    final file = document.file;
    if (file == null) return;
    final isWord = file.mimeType == DocumentFileSupport.docxMime;
    final pagesPerSheet = ValueNotifier<int>(1);
    Uint8List? printableBytes;
    int? printableLayout;
    Future<Uint8List> loadBytes({DocumentTransfer? transfer}) =>
        widget.api.fetchDocumentFileBytes(
          documentId: document.id,
          mimeType: file.mimeType,
          transfer: transfer,
        );
    Future<Uint8List> loadPrintableBytes({DocumentTransfer? transfer}) async {
      final selectedLayout = pagesPerSheet.value;
      if (file.mimeType.startsWith('image/')) {
        // Read the authorized original from Appwrite, then wrap it locally.
        // Never feed image bytes into PdfPreview/layoutPdf or require a new API.
        final imageBytes = await loadBytes(transfer: transfer);
        transfer?.stage('جارٍ تجهيز PDF للصورة على الجهاز');
        final pdf = await imageDocumentPdf(imageBytes);
        transfer?.checkCancelled();
        if (selectedLayout == 1) return pdf;
        transfer?.stage('جارٍ ترتيب صفحات A4');
        return DocumentPrintLayout.createA4Pdf(
          sourcePdf: pdf,
          pagesPerSheet: selectedLayout,
          dpi: 180,
        );
      }
      if (isWord) {
        final sourcePdf = await widget.api.fetchDocumentPrintPdf(
          document.id,
          transfer: transfer,
        );
        if (selectedLayout == 1) return sourcePdf;
        transfer?.stage('جارٍ ترتيب صفحات A4');
        return DocumentPrintLayout.createA4Pdf(
          sourcePdf: sourcePdf,
          pagesPerSheet: selectedLayout,
          dpi: 180,
        );
      }
      if (selectedLayout == 1) return loadBytes(transfer: transfer);
      if (transfer == null &&
          printableBytes != null &&
          printableLayout == selectedLayout) {
        return printableBytes!;
      }
      final original = await loadBytes(transfer: transfer);
      transfer?.stage('جارٍ ترتيب صفحات A4');
      printableBytes = await DocumentPrintLayout.createA4Pdf(
        sourcePdf: original,
        pagesPerSheet: selectedLayout,
        dpi: 180,
      );
      printableLayout = selectedLayout;
      return printableBytes!;
    }

    bool outputBusy = false;
    Future<void> runOutput(
      String title,
      Future<bool> Function(DocumentTransfer) action,
    ) async {
      if (outputBusy) return;
      outputBusy = true;
      try {
        final result = await showDocumentOutputDialog(
          context: context,
          title: title,
          action: action,
        );
        if (mounted && result == false) {
          _showMessage('تم إلغاء العملية أو إغلاقها');
        }
      } finally {
        outputBusy = false;
      }
    }

    Future<void> downloadFile() =>
        runOutput('تنزيل الملف الأصلي', (transfer) async {
          final bytes = await loadBytes(transfer: transfer);
          transfer.stage('اختر مكان الحفظ من مربع النظام', canCancel: false);
          final path = await FilePicker.saveFile(
            dialogTitle: 'حفظ الملف الأصلي',
            fileName: safeDocumentFileName(file.fileName),
            bytes: bytes,
          );
          if (path != null) _showMessage('تم حفظ الملف الأصلي');
          return path != null;
        });

    Future<void> printFile() => runOutput('طباعة الوثيقة', (transfer) async {
      final bytes = await loadPrintableBytes(transfer: transfer);
      transfer.stage(
        'استخدم مربع الطباعة لإكمال الإجراء أو إلغائه',
        canCancel: false,
      );
      return printDocumentBytes(bytes, name: '${document.title}.pdf');
    });

    Future<void> shareFile() => runOutput('مشاركة الملف الأصلي', (
      transfer,
    ) async {
      final bytes = await loadBytes(transfer: transfer);
      transfer.stage('اختر تطبيق المشاركة من مربع النظام', canCancel: false);
      final result = await SharePlus.instance.share(
        ShareParams(
          files: [
            XFile.fromData(
              bytes,
              name: safeDocumentFileName(file.fileName),
              mimeType: file.mimeType,
            ),
          ],
          title: document.title,
        ),
      );
      return result.status != ShareResultStatus.dismissed;
    });

    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (previewContext) => Directionality(
          textDirection: ui.TextDirection.rtl,
          child: Scaffold(
            backgroundColor: Theme.of(previewContext).scaffoldBackgroundColor,
            resizeToAvoidBottomInset: false,
            appBar: AppBar(
              titleSpacing: 12,
              title: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    document.serialCode.isEmpty
                        ? 'وثيقة رسمية'
                        : 'وثيقة رقم: ${document.serialCode}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 15),
                  ),
                  Text(
                    document.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              actions: [
                IconButton(
                  tooltip: 'إغلاق تفاصيل الوثيقة',
                  onPressed: () => Navigator.of(previewContext).maybePop(),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
            body: Column(
              children: [
                Expanded(
                  child: ValueListenableBuilder<int>(
                    valueListenable: pagesPerSheet,
                    builder: (context, selectedLayout, _) => PdfPreview(
                      key: ValueKey('pdf-preview-$selectedLayout'),
                      pdfFileName: isWord
                          ? '${document.title}.pdf'
                          : file.fileName,
                      canChangePageFormat: false,
                      canChangeOrientation: false,
                      allowPrinting: false,
                      allowSharing: false,
                      build: (_) => loadPrintableBytes(),
                    ),
                  ),
                ),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 330),
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
                    child: Column(
                      children: [
                        ValueListenableBuilder<int>(
                          valueListenable: pagesPerSheet,
                          builder: (context, selectedLayout, _) => Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                'عدد الصفحات في الورقة',
                                style: Theme.of(context).textTheme.labelLarge,
                              ),
                              const SizedBox(height: 6),
                              Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: [1, 2, 4, 6, 8].map((value) {
                                  final label =
                                      '$value ${value == 1 ? 'صفحة' : 'صفحات'}';
                                  return ChoiceChip(
                                    label: Text(label),
                                    selected: selectedLayout == value,
                                    onSelected: (_) {
                                      printableBytes = null;
                                      printableLayout = null;
                                      pagesPerSheet.value = value;
                                    },
                                  );
                                }).toList(),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                isWord
                                    ? 'تُنشأ معاينة PDF للطباعة على الخادم، ويبقى ملف Word الأصلي دون تغيير.'
                                    : 'يُستخدم الملف الأصلي، ويُنشأ توزيع A4 للطباعة فقط.',
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 8),
                        Align(
                          alignment: Alignment.centerRight,
                          child: Text(
                            '${_categories[document.category] ?? 'عام'} · الحالة: ${_statusLabel(document.status)}',
                            style: Theme.of(previewContext).textTheme.bodySmall,
                          ),
                        ),
                        const SizedBox(height: 6),
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Theme.of(previewContext)
                                .colorScheme
                                .surfaceContainerLow,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: Theme.of(previewContext)
                                  .colorScheme
                                  .outlineVariant,
                            ),
                          ),
                          child: LayoutBuilder(
                            builder: (context, constraints) {
                              const spacing = 8.0;
                              final itemWidth =
                                  (constraints.maxWidth - spacing * 2) / 3;
                              final actions = <Widget>[
                                _documentAction(
                                  label: isWord
                                      ? 'تنزيل Word'
                                      : file.mimeType.startsWith('image/')
                                      ? 'تنزيل الصورة'
                                      : 'تنزيل PDF',
                                  icon: Icons.download_outlined,
                                  onPressed: downloadFile,
                                ),
                                _documentAction(
                                  label: 'طباعة',
                                  icon: Icons.print_outlined,
                                  primary: true,
                                  onPressed: printFile,
                                ),
                                _documentAction(
                                  label: isWord
                                      ? 'مشاركة Word'
                                      : file.mimeType.startsWith('image/')
                                      ? 'مشاركة الصورة'
                                      : 'مشاركة PDF',
                                  icon: Icons.share_outlined,
                                  onPressed: shareFile,
                                ),
                                if (widget.onEditDocument != null)
                                  _documentAction(
                                    label: 'تعديل',
                                    icon: Icons.edit_outlined,
                                    onPressed: () {
                                      Navigator.of(previewContext).pop();
                                      widget.onEditDocument!(document);
                                    },
                                  ),
                              ];
                              return Directionality(
                                textDirection: ui.TextDirection.rtl,
                                child: Wrap(
                                  spacing: spacing,
                                  runSpacing: spacing,
                                  children: [
                                    for (final action in actions)
                                      SizedBox(width: itemWidth, child: action),
                                  ],
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    pagesPerSheet.dispose();
  }

  Widget _documentAction({
    required String label,
    required IconData icon,
    required VoidCallback? onPressed,
    bool primary = false,
  }) {
    final button = primary ? FilledButton.icon : OutlinedButton.icon;
    return button(
      onPressed: onPressed,
      icon: Icon(icon, size: 18),
      label: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(Size(0, 46)),
        padding: const WidgetStatePropertyAll(
          EdgeInsets.symmetric(horizontal: 6, vertical: 8),
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
    'issued' => context.appSuccess,
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
                      widget.embedded ? 'الملفات' : 'مكتبة الوثائق',
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
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _statusFilter,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'حالة الوثيقة',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: const [
                      DropdownMenuItem(value: 'all', child: Text('كل الحالات')),
                      DropdownMenuItem(value: 'draft', child: Text('مسودات')),
                      DropdownMenuItem(value: 'issued', child: Text('صادرة')),
                      DropdownMenuItem(
                        value: 'archived',
                        child: Text('مؤرشفة'),
                      ),
                    ],
                    onChanged: (value) {
                      if (value != null) setState(() => _statusFilter = value);
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _sortOrder,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'الترتيب',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'updated-desc',
                        child: Text('الأحدث تحديثاً'),
                      ),
                      DropdownMenuItem(
                        value: 'updated-asc',
                        child: Text('الأقدم تحديثاً'),
                      ),
                      DropdownMenuItem(
                        value: 'title-asc',
                        child: Text('العنوان أبجدياً'),
                      ),
                    ],
                    onChanged: (value) {
                      if (value != null) setState(() => _sortOrder = value);
                    },
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 0, 16, 4),
            child: Align(
              alignment: Alignment.centerRight,
              child: Text(
                'يعرض ${filtered.length} من أصل ${_documents.length} وثيقة',
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ),
          ),
          const SizedBox(height: 4),
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
                            borderRadius: BorderRadius.circular(16),
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

  Widget _statChip(BuildContext context, String label, String value) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.insert_drive_file_outlined,
            size: 17,
            color: theme.colorScheme.primary,
          ),
          const SizedBox(width: 7),
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(width: 5),
          Text(
            value,
            style: theme.textTheme.labelLarge?.copyWith(
              color: theme.colorScheme.onSurface,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }

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
        LucideIcons.folderOpen,
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
      ] else ...[
        const SizedBox(height: 14),
        Center(
          child: OutlinedButton.icon(
            onPressed: () {
              _searchController.clear();
              setState(() {
                _category = '';
                _statusFilter = 'all';
                _sortOrder = 'updated-desc';
              });
            },
            icon: const Icon(Icons.restart_alt),
            label: const Text('مسح عوامل التصفية'),
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
