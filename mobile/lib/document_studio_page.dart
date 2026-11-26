import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:intl/intl.dart';
import 'package:file_picker/file_picker.dart';
import 'package:printing/printing.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:share_plus/share_plus.dart';

import 'api.dart';
import 'document_studio_models.dart';
import 'document_studio_template_fields.dart';
import 'document_studio_template_variables.dart';
import 'closable_dialog_title.dart';
import 'document_studio_outbox.dart';
import 'document_studio_pdf.dart';
import 'document_studio_print_layout.dart';
import 'document_output_security.dart';
import 'document_paper.dart';
import 'document_file_support.dart';
import 'document_studio_quill_codec.dart';
import 'document_library_page.dart';
import 'document_transfer.dart';
import 'document_native_output.dart';
import 'app_theme.dart';

import 'package:lucide_icons_flutter/lucide_icons.dart';

enum DocumentStudioTab { documents, templates, archive, files }

class DocumentStudioPage extends StatefulWidget {
  const DocumentStudioPage({
    super.key,
    required this.api,
    this.outbox,
    this.initialTab = DocumentStudioTab.documents,
    this.openCreationOptionsOnOpen = false,
    this.initialDocumentId,
  });

  final PoliceApi api;
  final DocumentStudioOutbox? outbox;
  final DocumentStudioTab initialTab;
  final bool openCreationOptionsOnOpen;
  final String? initialDocumentId;

  @override
  State<DocumentStudioPage> createState() => DocumentStudioPageState();
}

class DocumentStudioPageState extends State<DocumentStudioPage> {
  void createDocument() => _showCreateDocumentOptions();
  void selectDocument(OfficialDocument document) => _selectDocument(document);
  late final DocumentStudioOutbox _outbox;
  late QuillController _documentEditor;
  late QuillController _templateEditor;

  DocumentStudioTab _tab = DocumentStudioTab.documents;
  List<OfficialDocument> _documents = [];
  List<DocumentTemplate> _templates = [];
  OfficialDocument? _selectedDocument;
  DocumentTemplate? _selectedTemplate;
  bool _loading = true;
  bool _saving = false;
  bool _previewMode = false;
  String? _loadError;
  bool _canIssueDocuments = false;
  bool _isPlatformOwner = false;
  List<Map<String, dynamic>> _documentVersions = const [];
  bool _loadingDocumentVersions = false;
  bool _restoringDocumentVersion = false;
  Map<String, dynamic> _letterhead = {};
  Map<String, dynamic> _platformDocumentSettings = {
    'showMinistryWatermarkText': true,
    'watermarkText': 'وزارة الداخلية',
    'watermarkOpacityPercent': 12,
    'watermarkScalePercent': 100,
    'headerDividerColor': '#b49a55',
    'headerDividerStyle': 'double',
    'headerDividerWidthPt': 2.25,
    'pageMarginTopMm': 10,
    'pageMarginRightMm': 10,
    'pageMarginBottomMm': 10,
    'pageMarginLeftMm': 10,
    'frameStyle': 'single',
    'frameColor': '#b49a55',
    'frameWidthPt': 1,
    'headerTitle': '',
    'headerSubtitle': '',
    'headerChiefRank': '',
    'headerChiefName': '',
    'headerShowLogo': true,
    'headerLogoSize': 120,
    'headerTopPaddingMm': 0,
    'headerHorizontalPaddingMm': 0,
    'headerBottomPaddingMm': 6,
    'headerAlignment': 'spread',
  };

  final _titleController = TextEditingController();
  final _subjectController = TextEditingController();
  final _recipientLabelController = TextEditingController(
    text: defaultDocumentRecipientLabel,
  );
  final _recipientValueController = TextEditingController();
  final _templateTitleController = TextEditingController();
  final _templateDescriptionController = TextEditingController();

  String _documentCategory = 'general';
  String _templateCategory = 'general';
  String? _selectedTemplateId;
  int? _selectedTemplateRevision;
  int _editingTemplateRevision = 1;
  String? _editingTemplateId;
  DateTime _documentDate = DateTime.now();
  Map<String, dynamic> _documentContent = {
    'type': 'doc',
    'content': [
      {'type': 'paragraph'},
    ],
  };
  Map<String, dynamic> _templateContent = {
    'type': 'doc',
    'content': [
      {'type': 'paragraph'},
    ],
  };
  Map<String, dynamic> _templateBaseContent = {
    'type': 'doc',
    'content': [
      {'type': 'paragraph'},
    ],
  };
  Map<String, String> _fieldValues = {};
  List<DocumentTemplateField> _templateFields = [];
  final List<UniqueKey> _templateFieldKeys = [];
  final Map<String, TextEditingController> _fieldControllers = {};
  bool _templateContentDirty = false;
  bool _creatingTemplate = false;
  bool _creatingDocument = false;
  bool _showManualDocumentEditor = false;
  StreamSubscription<ApiMutationEvent>? _mutationSubscription;

  static const _categories = <String, String>{
    'general': 'عام',
    'administrative': 'إداري',
    'personnel': 'شؤون الموظفين',
    'correspondence': 'مراسلات',
  };

  @override
  void initState() {
    super.initState();
    _tab = widget.initialTab;
    _outbox = widget.outbox ?? DocumentStudioOutbox(api: widget.api);
    _documentEditor = _makeEditor(_documentContent);
    _templateEditor = _makeEditor(_templateContent);
    _documentEditor.addListener(_onDocumentEditorChanged);
    _templateEditor.addListener(_onTemplateEditorChanged);
    _mutationSubscription = widget.api.mutationEvents.listen((event) {
      if (event.isDocumentStudioMutation && !_saving) {
        unawaited(_load());
      }
    });
    if (widget.initialDocumentId != null) {
      unawaited(
        _load().then((_) {
          if (!mounted) return;
          final matches = _documents
              .where((item) => item.id == widget.initialDocumentId)
              .toList();
          if (matches.isNotEmpty) _selectDocument(matches.first);
        }),
      );
    } else {
      _load();
    }
    if (widget.openCreationOptionsOnOpen) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) unawaited(_showCreateDocumentOptions());
      });
    }
  }

  @override
  void dispose() {
    _documentEditor.removeListener(_onDocumentEditorChanged);
    _templateEditor.removeListener(_onTemplateEditorChanged);
    final subscription = _mutationSubscription;
    if (subscription != null) unawaited(subscription.cancel());
    _documentEditor.dispose();
    _templateEditor.dispose();
    _titleController.dispose();
    _subjectController.dispose();
    _recipientLabelController.dispose();
    _recipientValueController.dispose();
    _templateTitleController.dispose();
    _templateDescriptionController.dispose();
    for (final controller in _fieldControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  QuillController _makeEditor(Map<String, dynamic> content) {
    return QuillController(
      document: DocumentStudioQuillCodec.toQuillDocument(content),
      selection: const TextSelection.collapsed(offset: 0),
    );
  }

  void _onDocumentEditorChanged() {
    _documentContent = DocumentStudioQuillCodec.toTipTapJson(
      _documentEditor.document,
    );
  }

  void _onTemplateEditorChanged() {
    _templateContent = DocumentStudioQuillCodec.toTipTapJson(
      _templateEditor.document,
    );
    _templateContentDirty = true;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });

    try {
      dynamic documentsRaw;
      dynamic templatesRaw;
      dynamic contextRaw;
      try {
        documentsRaw = await widget.api.call('documentStudio.listDocuments');
      } on NetworkException {
        documentsRaw = await widget.api.readCachedResponse(
          'documentStudio.listDocuments',
        );
      }
      try {
        templatesRaw = await widget.api.call('documentStudio.listTemplates');
      } on NetworkException {
        templatesRaw = await widget.api.readCachedResponse(
          'documentStudio.listTemplates',
        );
      }
      try {
        contextRaw = await widget.api.call('organizations.context');
      } on NetworkException {
        contextRaw = await widget.api.readCachedResponse(
          'organizations.context',
        );
      }

      final documents = documentsRaw is List
          ? documentsRaw
                .whereType<Map>()
                .map(
                  (item) => OfficialDocument.fromJson(
                    Map<String, dynamic>.from(item),
                  ),
                )
                .toList()
          : _documents;
      final templates = templatesRaw is List
          ? templatesRaw
                .whereType<Map>()
                .map(
                  (item) => DocumentTemplate.fromJson(
                    Map<String, dynamic>.from(item),
                  ),
                )
                .toList()
          : _templates;

      final context = contextRaw is Map
          ? Map<String, dynamic>.from(contextRaw)
          : <String, dynamic>{};
      final organizationId = context['organizationId']?.toString();
      Map<String, dynamic> letterhead = {};
      try {
        final rawLetterhead = await widget.api.call(
          'documentStudio.getLetterheadSettings',
          input: organizationId == null
              ? <String, dynamic>{}
              : {'organizationId': organizationId},
        );
        if (rawLetterhead is Map) {
          letterhead = Map<String, dynamic>.from(rawLetterhead);
        }
      } catch (_) {
        // The editor remains usable with the cached or minimal letterhead.
      }

      Map<String, dynamic> platformDocumentSettings = {
        'showMinistryWatermarkText': true,
        'watermarkText': 'وزارة الداخلية',
        'watermarkOpacityPercent': 12,
        'watermarkScalePercent': 100,
        'headerDividerColor': '#b49a55',
        'headerDividerStyle': 'double',
        'headerDividerWidthPt': 2.25,
        'pageMarginTopMm': 10,
        'pageMarginRightMm': 10,
        'pageMarginBottomMm': 10,
        'pageMarginLeftMm': 10,
        'frameStyle': 'single',
        'frameColor': '#b49a55',
        'frameWidthPt': 1,
        'headerTitle': '',
        'headerSubtitle': '',
        'headerChiefRank': '',
        'headerChiefName': '',
        'headerShowLogo': true,
        'headerLogoSize': 120,
        'headerTopPaddingMm': 0,
        'headerHorizontalPaddingMm': 0,
        'headerBottomPaddingMm': 6,
        'headerAlignment': 'spread',
      };
      try {
        final rawSettings = await widget.api.call(
          'platformDocumentSettings.get',
          allowOfflineCache: false,
        );
        if (rawSettings is Map) {
          platformDocumentSettings = {
            ...platformDocumentSettings,
            ...Map<String, dynamic>.from(rawSettings),
          };
        }
      } catch (_) {
        // Keep the same safe defaults when system settings are unavailable.
      }

      if (!mounted) return;
      final selectedId = _selectedDocument?.id;
      final matchingSelection = selectedId == null
          ? <OfficialDocument>[]
          : documents.where((item) => item.id == selectedId).toList();
      final refreshedSelection = matchingSelection.isEmpty
          ? null
          : matchingSelection.first;
      setState(() {
        _documents = documents;
        _templates = templates;
        if (selectedId != null) {
          _selectedDocument = refreshedSelection;
        }
        if (_selectedTemplate?.id.startsWith('local_') == true &&
            !templates.any((item) => item.id == _selectedTemplate!.id)) {
          _selectedTemplate = null;
          _editingTemplateId = null;
          _creatingTemplate = false;
        }
        _isPlatformOwner = context['isOwner'] == true;
        _canIssueDocuments =
            _isPlatformOwner ||
            const [
              'system_admin',
              'organization_admin',
            ].contains(context['role']?.toString());
        _letterhead = letterhead;
        _platformDocumentSettings = platformDocumentSettings;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = documentOutputError(error);
        if (error is ApiException &&
            (error.statusCode == 401 || error.statusCode == 403)) {
          _documents = [];
          _templates = [];
          _selectedDocument = null;
          _canIssueDocuments = false;
          _isPlatformOwner = false;
        }
      });
    }
  }

  Future<void> _refresh() async {
    await _load();
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _uploadDocumentFile() async {
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

    setState(() => _saving = true);
    try {
      final title = picked.name.replaceFirst(RegExp(r'\.[^.]+$'), '').trim();
      final uploaded = await widget.api.uploadDocumentFile(
        fileName: picked.name,
        bytes: Uint8List.fromList(bytes),
        title: title.isEmpty ? 'وثيقة مرفوعة' : title,
        category: 'general',
        subject: '',
        documentDate: DateTime.now(),
      );
      await _load();
      for (final document in _documents) {
        if (document.id == uploaded.id) {
          _selectDocument(document);
          break;
        }
      }
      _showMessage('تم استيراد الملف وفتح الوثيقة');
    } catch (error) {
      _showMessage('تعذر استيراد الوثيقة: $error');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _showCreateDocumentOptions() async {
    final choice = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: closableDialogTitle(dialogContext, const Text('إنشاء وثيقة')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.assignment_outlined),
              title: const Text('تعبئة نموذج جاهز'),
              subtitle: const Text(
                'اختر نموذج الوثيقة ثم املأ الحقول المطلوبة دون كتابة النص يدوياً',
              ),
              onTap: () => Navigator.pop(dialogContext, 'template'),
            ),
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('وثيقة فارغة'),
              subtitle: const Text('افتح محرر A4 للكتابة اليدوية عند الحاجة'),
              onTap: () => Navigator.pop(dialogContext, 'write'),
            ),
            ListTile(
              leading: const Icon(Icons.file_open_outlined),
              title: const Text('رفع ملف'),
              subtitle: const Text('ارفع ملف Word أو PDF أو صورة إلى مكتبتك'),
              onTap: () => Navigator.pop(dialogContext, 'import'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('إلغاء'),
          ),
        ],
      ),
    );
    if (!mounted || choice == null) return;
    if (choice == 'template') {
      await _chooseTemplateForNewDocument();
    } else if (choice == 'write') {
      _startNewDocument();
    } else if (choice == 'import') {
      await _uploadDocumentFile();
    }
  }

  Future<void> _chooseTemplateForNewDocument() async {
    final activeTemplates = _templates
        .where((template) => template.isActive)
        .toList(growable: false);

    if (activeTemplates.isEmpty) {
      _showMessage(
        'لا توجد نماذج تعبئة جاهزة. أنشئ نموذجاً أولاً من تبويب مكتبة النماذج.',
      );
      if (mounted) setState(() => _tab = DocumentStudioTab.templates);
      return;
    }

    final selected = await showDialog<DocumentTemplate>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: closableDialogTitle(
          dialogContext,
          const Text('اختر نموذج الوثيقة'),
        ),
        content: SizedBox(
          width: 440,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final template in activeTemplates)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.description_outlined),
                    title: Text(template.title),
                    subtitle: Text(
                      template.description?.trim().isNotEmpty == true
                          ? template.description!
                          : _categories[template.category] ?? template.category,
                    ),
                    trailing: const Icon(Icons.chevron_left),
                    onTap: () => Navigator.pop(dialogContext, template),
                  ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('إلغاء'),
          ),
        ],
      ),
    );

    if (!mounted || selected == null) return;
    _useTemplate(selected);
  }

  Future<int?> _choosePrintPagesPerSheet() {
    return showDialog<int>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: closableDialogTitle(dialogContext, const Text('إعداد الطباعة')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('اختر عدد صفحات الوثيقة في كل ورقة A4'),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                for (final count in const [1, 2, 4, 6, 8])
                  OutlinedButton(
                    onPressed: () => Navigator.pop(dialogContext, count),
                    child: Text(count == 1 ? '1 صفحة' : '$count صفحات'),
                  ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('إلغاء'),
          ),
        ],
      ),
    );
  }

  Future<int?> _chooseImageTiles() {
    return showDialog<int>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: closableDialogTitle(
          dialogContext,
          const Text('تقسيم الصورة للطباعة'),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('اختر عدد أوراق A4 التي ستُقسّم الصورة عليها'),
            const SizedBox(height: 12),
            for (final count in const [1, 4, 9, 16])
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(dialogContext, count),
                  child: Text(count == 1 ? 'ورقة واحدة' : '$count أوراق'),
                ),
              ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('إلغاء'),
          ),
        ],
      ),
    );
  }

  Future<void> _printDocumentFile(OfficialDocument document) async {
    final file = document.file;
    final isImage = file?.mimeType.startsWith('image/') == true;
    final imageTiles = isImage ? await _chooseImageTiles() : 1;
    if (imageTiles == null || !mounted) return;
    final pagesPerSheet = isImage ? 1 : await _choosePrintPagesPerSheet();
    if (pagesPerSheet == null || !mounted) return;

    await _runOutput('طباعة الوثيقة', (transfer) async {
      final sourcePdf = await _fetchDocumentPdf(
        document,
        imageTiles: imageTiles,
        transfer: transfer,
      );
      transfer.stage('جارٍ ترتيب صفحات A4 للطباعة');
      final printPdf = await DocumentStudioPrintLayout.compose(
        sourcePdf,
        pagesPerSheet: pagesPerSheet,
      );
      transfer.stage(
        'استخدم مربع الطباعة لإكمال الإجراء أو إلغائه',
        canCancel: false,
      );
      return printDocumentBytes(printPdf, name: '${document.title}.pdf');
    });
  }

  Future<void> _runOutput(
    String title,
    Future<bool> Function(DocumentTransfer) action,
  ) async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final done = await showDocumentOutputDialog(
        context: context,
        title: title,
        action: action,
      );
      if (mounted && done == false) _showMessage('تم إلغاء العملية أو إغلاقها');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Map<String, dynamic> _documentContentForDisplay(OfficialDocument document) {
    final content = DocumentStudioQuillCodec.normalizeLegacyText(
      document.content,
    );
    if (document.fieldValues.isNotEmpty) {
      if (document.serialCode.isEmpty) return content;
      return applyDocumentTemplateVariables(content, {
        'number': document.serialCode,
      });
    }
    return applyDocumentTemplateVariables(content, {
      'organization':
          (_letterhead['departmentName'] ??
                  _letterhead['organizationName'] ??
                  'وثائقي')
              .toString(),
      'date': DateFormat('yyyy/MM/dd').format(document.documentDate),
      'subject': document.subject,
      if (document.serialCode.isNotEmpty) 'number': document.serialCode,
    });
  }

  Future<Uint8List> _fetchDocumentPdf(
    OfficialDocument document, {
    int imageTiles = 1,
    DocumentTransfer? transfer,
  }) async {
    transfer?.checkCancelled();
    final file = document.file;
    if (file == null) {
      if (!isSafeDocumentOutputId(document.id)) {
        throw StateError('احفظ الوثيقة ومزامنتها مع الخادم قبل الإخراج');
      }
      transfer?.stage('جارٍ التحقق من الوثيقة وإعدادات الترويسة الحالية');
      final raw = await widget.api.call(
        'documentStudio.listDocuments',
        allowOfflineCache: false,
      );
      final rows = raw is List
          ? raw
          : raw is Map && raw['items'] is List
          ? raw['items'] as List
          : const [];
      final matches = rows
          .whereType<Map>()
          .where((row) => row['id'] == document.id)
          .toList();
      if (matches.isEmpty) throw const ApiException(403, 'الوثيقة غير متاحة');
      // Do not export a stale locally cached record after server authorization.
      document = OfficialDocument.fromJson(
        Map<String, dynamic>.from(matches.single),
      );
      final currentSettings = await widget.api.call(
        'platformDocumentSettings.get',
        allowOfflineCache: false,
      );
      final currentLetterhead = await widget.api.call(
        'documentStudio.getLetterheadSettings',
        input: const {},
        allowOfflineCache: false,
      );
      if (currentSettings is! Map || currentLetterhead is! Map) {
        throw const ApiException(502, 'تعذر تحميل إعدادات الوثيقة');
      }
      _platformDocumentSettings = {
        ..._platformDocumentSettings,
        ...Map<String, dynamic>.from(currentSettings),
      };
      _letterhead = Map<String, dynamic>.from(currentLetterhead);
      transfer?.stage('جارٍ إنشاء PDF على الجهاز');
      final rawOpacity = _platformDocumentSettings['watermarkOpacityPercent'];
      final opacity =
          (rawOpacity is num
              ? rawOpacity.toDouble()
              : double.tryParse('$rawOpacity') ?? 12) /
          100;
      final configuredLetterhead = {
        ..._letterhead,
        'departmentName': _headerSetting('headerTitle', 'المقدم غسان صالح كنو'),
        'unitName': _headerSetting('headerSubtitle', 'رئيس قسم الشهباء'),
        'unitChiefRank': _headerSetting(
          'headerChiefRank',
          _letterhead['unitChiefRank']?.toString() ?? '',
        ),
        'unitChiefName': _headerSetting(
          'headerChiefName',
          _letterhead['unitChiefName']?.toString() ?? '',
        ),
        'headerShowLogo': _platformDocumentSettings['headerShowLogo'] != false,
        'headerLogoSize': _platformDocumentSettings['headerLogoSize'] ?? 120,
        'headerTopPaddingMm':
            _platformDocumentSettings['headerTopPaddingMm'] ?? 0,
        'headerHorizontalPaddingMm':
            _platformDocumentSettings['headerHorizontalPaddingMm'] ?? 0,
        'headerBottomPaddingMm':
            _platformDocumentSettings['headerBottomPaddingMm'] ?? 6,
        'headerAlignment':
            _platformDocumentSettings['headerAlignment'] ?? 'spread',
        'headerDividerStyle':
            _platformDocumentSettings['headerDividerStyle'] ?? 'double',
        'headerDividerWidthPt':
            _platformDocumentSettings['headerDividerWidthPt'] ?? 2.25,
        'pageMarginTopMm': _platformDocumentSettings['pageMarginTopMm'] ?? 10,
        'pageMarginRightMm':
            _platformDocumentSettings['pageMarginRightMm'] ?? 10,
        'pageMarginBottomMm':
            _platformDocumentSettings['pageMarginBottomMm'] ?? 10,
        'pageMarginLeftMm': _platformDocumentSettings['pageMarginLeftMm'] ?? 10,
        'frameStyle': _platformDocumentSettings['frameStyle'] ?? 'single',
        'frameColor': _platformDocumentSettings['frameColor'] ?? '#b49a55',
        'frameWidthPt': _platformDocumentSettings['frameWidthPt'] ?? 1,
        'documentDateFormat':
            _platformDocumentSettings['documentDateFormat'] ?? 'yyyy/MM/dd',
        'documentFontFamily':
            _platformDocumentSettings['documentFontFamily'] ?? 'Amiri',
        'documentFontSizePt':
            _platformDocumentSettings['documentFontSizePt'] ?? 12,
        'documentFontWeight':
            _platformDocumentSettings['documentFontWeight'] ?? 400,
        'documentFontColor':
            _platformDocumentSettings['documentFontColor'] ?? '#0f172a',
        'recipientFontFamily':
            _platformDocumentSettings['recipientFontFamily'] ?? 'Amiri',
        'recipientFontSizePt':
            _platformDocumentSettings['recipientFontSizePt'] ?? 16,
        'recipientFontWeight':
            _platformDocumentSettings['recipientFontWeight'] ?? 600,
        'recipientFontColor':
            _platformDocumentSettings['recipientFontColor'] ?? '#0f172a',
      };
      return DocumentStudioPdf.build(
        content: _documentContentForDisplay(document),
        title: document.title,
        subject: document.subject,
        recipientLabel:
            document.fieldValues[documentRecipientLabelFieldKey] ??
            defaultDocumentRecipientLabel,
        recipient: document.fieldValues[documentRecipientValueFieldKey] ?? '',
        serialCode: document.serialCode,
        documentDate: document.documentDate,
        letterhead: configuredLetterhead,
        dividerColor: _documentHeaderDividerColor().toARGB32(),
        watermarkText:
            _platformDocumentSettings['watermarkText']?.toString() ??
            'وزارة الداخلية',
        showWatermarkText:
            _platformDocumentSettings['showMinistryWatermarkText'] != false,
        watermarkOpacity: opacity,
        watermarkScalePercent:
            (_platformDocumentSettings['watermarkScalePercent'] as num? ?? 100)
                .toDouble(),
      );
    }
    if (!isSafeDocumentOutputId(document.id)) {
      throw StateError('احفظ الوثيقة ومزامنتها مع الخادم قبل إخراج PDF');
    }
    if (file.mimeType == DocumentFileSupport.docxMime) {
      transfer?.stage('جارٍ تحويل ملف Word إلى PDF على الخادم');
      return widget.api.fetchDocumentPrintPdf(document.id, transfer: transfer);
    }
    if (file.mimeType.startsWith('image/')) {
      final imageBytes = await widget.api.fetchDocumentFileBytes(
        documentId: document.id,
        mimeType: file.mimeType,
        transfer: transfer,
      );
      if (!DocumentFileSupport.matchesMime(file.mimeType, imageBytes)) {
        throw StateError('تعذر التحقق من صيغة الصورة التي أعادها الخادم');
      }
      transfer?.stage('جارٍ تجهيز الصورة وصفحات الطباعة');
      final codec = await ui.instantiateImageCodec(imageBytes);
      final frame = await codec.getNextFrame();
      final sourceImage = frame.image;
      final columns = math.sqrt(imageTiles).round();
      final sourceTileWidth = sourceImage.width / columns;
      final sourceTileHeight = sourceImage.height / columns;
      final pdf = pw.Document();
      try {
        for (var row = 0; row < columns; row += 1) {
          for (var column = 0; column < columns; column += 1) {
            transfer?.checkCancelled();
            final recorder = ui.PictureRecorder();
            final canvas = ui.Canvas(recorder);
            final sourceRect = ui.Rect.fromLTWH(
              column * sourceTileWidth,
              row * sourceTileHeight,
              sourceTileWidth,
              sourceTileHeight,
            );
            final destinationRect = ui.Rect.fromLTWH(
              0,
              0,
              sourceTileWidth,
              sourceTileHeight,
            );
            canvas.drawImageRect(
              sourceImage,
              sourceRect,
              destinationRect,
              ui.Paint(),
            );
            final picture = recorder.endRecording();
            final tileImage = await picture.toImage(
              sourceTileWidth.ceil(),
              sourceTileHeight.ceil(),
            );
            final tileData = await tileImage.toByteData(
              format: ui.ImageByteFormat.png,
            );
            tileImage.dispose();
            picture.dispose();
            if (tileData == null) {
              throw StateError('تعذر تجهيز جزء من الصورة للطباعة');
            }
            final tileBytes = tileData.buffer.asUint8List(
              tileData.offsetInBytes,
              tileData.lengthInBytes,
            );
            final image = pw.MemoryImage(tileBytes);
            pdf.addPage(
              pw.Page(
                pageFormat: PdfPageFormat.a4,
                margin: pw.EdgeInsets.zero,
                build: (_) =>
                    pw.Center(child: pw.Image(image, fit: pw.BoxFit.contain)),
              ),
            );
          }
        }
      } finally {
        sourceImage.dispose();
        codec.dispose();
      }
      return Uint8List.fromList(await pdf.save());
    }
    if (file.mimeType != DocumentFileSupport.pdfMime) {
      throw StateError('صيغة الملف غير مدعومة لإخراج PDF');
    }
    final bytes = await widget.api.fetchDocumentFileBytes(
      documentId: document.id,
      mimeType: DocumentFileSupport.pdfMime,
      transfer: transfer,
    );
    if (!hasPdfSignature(bytes)) {
      throw StateError('تعذر التحقق من ملف PDF الذي أعاده الخادم');
    }
    return bytes;
  }

  Future<Uint8List> _fetchOriginalDocument(
    OfficialDocument document,
    DocumentTransfer transfer,
  ) {
    final file = document.file;
    if (file == null) throw StateError('لا يوجد ملف أصلي لهذه الوثيقة');
    return widget.api.fetchDocumentFileBytes(
      documentId: document.id,
      mimeType: file.mimeType,
      transfer: transfer,
    );
  }

  Future<void> _saveOriginalDocument(OfficialDocument document) =>
      _runOutput('تنزيل الملف الأصلي', (transfer) async {
        final file = document.file!;
        final bytes = await _fetchOriginalDocument(document, transfer);
        transfer.stage(
          'اختر مكان الحفظ أو ألغِ من مربع النظام',
          canCancel: false,
        );
        final path = await FilePicker.saveFile(
          dialogTitle: 'حفظ الملف الأصلي',
          fileName: safeDocumentFileName(file.fileName),
          bytes: bytes,
        );
        if (path != null) _showMessage('تم حفظ الملف الأصلي');
        return path != null;
      });

  Future<void> _shareOriginalDocument(OfficialDocument document) =>
      _runOutput('مشاركة الملف الأصلي', (transfer) async {
        final file = document.file!;
        final bytes = await _fetchOriginalDocument(document, transfer);
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

  Future<void> _saveDocumentPdf(OfficialDocument document) =>
      _runOutput('تنزيل PDF', (transfer) async {
        final bytes = await _fetchDocumentPdf(document, transfer: transfer);
        transfer.stage(
          'اختر مكان الحفظ أو ألغِ من مربع النظام',
          canCancel: false,
        );
        final path = await FilePicker.saveFile(
          dialogTitle: 'حفظ الوثيقة الرسمية',
          fileName: safeDocumentFileName('${document.title}.pdf'),
          type: FileType.custom,
          allowedExtensions: const ['pdf'],
          bytes: bytes,
        );
        if (path != null) _showMessage('تم حفظ ملف PDF');
        return path != null;
      });

  Future<void> _shareDocumentPdf(OfficialDocument document) =>
      _runOutput('مشاركة PDF', (transfer) async {
        final bytes = await _fetchDocumentPdf(document, transfer: transfer);
        transfer.stage('اختر تطبيق المشاركة من مربع النظام', canCancel: false);
        final result = await SharePlus.instance.share(
          ShareParams(
            files: [
              XFile.fromData(
                bytes,
                name: safeDocumentFileName('${document.title}.pdf'),
                mimeType: 'application/pdf',
              ),
            ],
            title: document.title,
          ),
        );
        return result.status != ShareResultStatus.dismissed;
      });

  Future<void> _syncLocalChanges() async {
    final result = await _outbox.sync();
    await _load();
    if (result.lastError != null) {
      _showMessage(
        'تمت مزامنة ${result.synced} عملية، وبقيت ${result.remaining}. ${result.lastError}',
      );
    } else if (result.synced > 0) {
      _showMessage('تمت مزامنة ${result.synced} عملية بنجاح');
    } else {
      _showMessage('لا توجد تغييرات محلية معلقة');
    }
  }

  void _replaceDocumentEditor(Map<String, dynamic> content) {
    _documentEditor.removeListener(_onDocumentEditorChanged);
    _documentEditor.dispose();
    _documentContent = DocumentStudioQuillCodec.normalizeLegacyText(content);
    _documentEditor = _makeEditor(_documentContent);
    _documentEditor.addListener(_onDocumentEditorChanged);
    setState(() {});
  }

  void _replaceTemplateEditor(Map<String, dynamic> content) {
    _templateEditor.removeListener(_onTemplateEditorChanged);
    _templateEditor.dispose();
    _templateContent = DocumentStudioQuillCodec.normalizeLegacyText(content);
    _templateContentDirty = false;
    _templateEditor = _makeEditor(_templateContent);
    _templateEditor.addListener(_onTemplateEditorChanged);
    setState(() {});
  }

  void _resetFieldControllers(
    List<DocumentTemplateField> fields,
    Map<String, String> values,
  ) {
    for (final controller in _fieldControllers.values) {
      controller.dispose();
    }
    _fieldControllers.clear();
    for (final field in fields) {
      final value = normalizeDocumentTemplateFieldValue(
        field,
        values[field.key],
      );
      _fieldControllers[field.key] = TextEditingController(text: value);
    }
    _fieldValues = {
      for (final field in fields)
        field.key: normalizeDocumentTemplateFieldValue(
          field,
          values[field.key],
        ),
    };
  }

  void _startNewDocument() {
    _previewMode = false;
    _showManualDocumentEditor = true;
    _selectedDocument = null;
    _creatingDocument = true;
    _selectedTemplateId = null;
    _selectedTemplateRevision = null;
    _documentCategory = 'general';
    _documentDate = DateTime.now();
    _titleController.clear();
    _subjectController.clear();
    _recipientLabelController.text = defaultDocumentRecipientLabel;
    _recipientValueController.clear();
    _templateBaseContent = {
      'type': 'doc',
      'content': [
        {'type': 'paragraph'},
      ],
    };
    _resetFieldControllers(const [], {});
    _replaceDocumentEditor(_templateBaseContent);
    setState(() => _tab = DocumentStudioTab.documents);
  }

  void _selectDocument(OfficialDocument document) {
    _previewMode = true;
    _selectedDocument = document;
    _creatingDocument = false;
    _selectedTemplateId = document.templateId;
    _selectedTemplateRevision = document.templateRevision;
    _documentCategory = document.category;
    _documentDate = document.documentDate;
    _titleController.text = document.title;
    _subjectController.text = document.subject;
    final recipientLabel = document.fieldValues[documentRecipientLabelFieldKey]
        ?.trim();
    _recipientLabelController.text =
        recipientLabel == null || recipientLabel.isEmpty
        ? defaultDocumentRecipientLabel
        : recipientLabel;
    _recipientValueController.text =
        document.fieldValues[documentRecipientValueFieldKey] ?? '';
    _templateBaseContent = DocumentStudioQuillCodec.normalizeLegacyText(
      document.content,
    );
    _resetFieldControllers(
      document.templateFieldsSnapshot,
      document.fieldValues,
    );
    final displayContent = _documentContentForDisplay(document);
    _replaceDocumentEditor(displayContent);
    unawaited(_loadDocumentVersions(document.id));
    setState(
      () => _tab = document.status == 'archived'
          ? DocumentStudioTab.archive
          : DocumentStudioTab.documents,
    );
  }

  Future<void> _loadDocumentVersions(String documentId) async {
    if (mounted) {
      setState(() => _loadingDocumentVersions = true);
    }
    try {
      final raw = await widget.api.call(
        'documentStudio.listDocumentVersions',
        input: {'id': documentId},
        allowOfflineCache: false,
      );
      final versions = raw is List
          ? raw
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList(growable: false)
          : const <Map<String, dynamic>>[];
      if (!mounted || _selectedDocument?.id != documentId) return;
      setState(() {
        _documentVersions = versions;
        _loadingDocumentVersions = false;
      });
    } catch (error) {
      if (!mounted || _selectedDocument?.id != documentId) return;
      setState(() {
        _documentVersions = const [];
        _loadingDocumentVersions = false;
      });
      _showMessage('تعذر تحميل سجل الإصدارات: $error');
    }
  }

  Future<void> _restoreDocumentVersion(Map<String, dynamic> version) async {
    final document = _selectedDocument;
    final versionNumber = (version['version'] as num?)?.toInt();
    if (document == null ||
        versionNumber == null ||
        _restoringDocumentVersion) {
      return;
    }
    if (document.status != 'draft') {
      _showMessage('استعادة النسخ متاحة للمسودات فقط');
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: closableDialogTitle(
          dialogContext,
          const Text('استعادة نسخة سابقة'),
        ),
        content: Text(
          'استعادة النسخة $versionNumber؟ سيُحفظ المحتوى الحالي أولاً في سجل الإصدارات.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('استعادة النسخة'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _restoringDocumentVersion = true);
    try {
      await widget.api.call(
        'documentStudio.restoreDocumentVersion',
        input: {
          'id': document.id,
          'version': versionNumber,
          'expectedUpdatedAt': document.expectedUpdatedAt,
        },
        mutation: true,
        allowOfflineCache: false,
      );
      await _load();
      if (!mounted) return;
      final refreshed = _documents.where((item) => item.id == document.id);
      if (refreshed.isNotEmpty) {
        _selectDocument(refreshed.first);
      }
      _showMessage('تمت استعادة النسخة وحفظ النسخة السابقة بأمان');
    } catch (error) {
      _showMessage('تعذرت استعادة النسخة: $error');
    } finally {
      if (mounted) setState(() => _restoringDocumentVersion = false);
    }
  }

  Widget _buildDocumentVersionHistory() {
    final document = _selectedDocument;
    if (document == null) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.history),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'سجل إصدارات الوثيقة',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
                Text('${_documentVersions.length} نسخة'),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'تُحفظ نسخة قبل كل تعديل فعلي، ويمكن استعادتها للمسودات.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            if (_loadingDocumentVersions)
              const LinearProgressIndicator()
            else if (_documentVersions.isEmpty)
              const Text(
                'لا توجد نسخ سابقة بعد. سيظهر السجل بعد أول تعديل محفوظ.',
                textAlign: TextAlign.center,
              )
            else
              for (final version in _documentVersions)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: CircleAvatar(
                    radius: 18,
                    child: Text('${version['version'] ?? '-'}'),
                  ),
                  title: Text(
                    version['title']?.toString() ?? 'نسخة سابقة',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(
                    DateTime.tryParse(version['savedAt']?.toString() ?? '') ==
                            null
                        ? 'تاريخ غير متاح'
                        : DateFormat('yyyy/MM/dd – HH:mm').format(
                            DateTime.parse(version['savedAt'].toString())
                                .toLocal(),
                          ),
                  ),
                  trailing: document.status == 'draft'
                      ? TextButton(
                          onPressed: _restoringDocumentVersion
                              ? null
                              : () => _restoreDocumentVersion(version),
                          child: const Text('استعادة'),
                        )
                      : null,
                ),
            if (_restoringDocumentVersion) const LinearProgressIndicator(),
          ],
        ),
      ),
    );
  }

  void _useTemplate(DocumentTemplate template) {
    _previewMode = false;
    _showManualDocumentEditor = false;
    _selectedDocument = null;
    _creatingDocument = true;
    _selectedTemplate = template;
    _selectedTemplateId = template.id;
    _selectedTemplateRevision = template.revision;
    _documentCategory = template.category;
    _documentDate = DateTime.now();
    _titleController.text = template.title;
    _subjectController.clear();
    _recipientLabelController.text = defaultDocumentRecipientLabel;
    _recipientValueController.clear();
    _templateBaseContent = DocumentStudioQuillCodec.normalizeLegacyText(
      template.content,
    );
    _resetFieldControllers(template.fields, {});
    _replaceDocumentEditor(template.content);
    setState(() => _tab = DocumentStudioTab.documents);
  }

  Future<void> _saveDocument() async {
    if (_titleController.text.trim().isEmpty) {
      _showMessage('أدخل عنوان الوثيقة أولاً');
      return;
    }
    final recipientLabel = _recipientLabelController.text.trim();
    final savedFieldValues = <String, String>{
      ..._fieldValues,
      documentRecipientLabelFieldKey: recipientLabel.isEmpty
          ? defaultDocumentRecipientLabel
          : recipientLabel,
      documentRecipientValueFieldKey: _recipientValueController.text,
    };
    final customFieldValues = Map<String, String>.from(_fieldValues)
      ..remove('organization')
      ..remove('date')
      ..remove('number')
      ..remove('subject');
    if (_selectedDocument == null && _selectedTemplateId != null) {
      final selectedTemplateFields = _templates
          .where((template) => template.id == _selectedTemplateId)
          .expand((template) => template.fields);
      final missingRequiredFields = selectedTemplateFields
          .where(
            (field) =>
                field.required &&
                (_fieldValues[field.key]?.trim().isNotEmpty != true),
          )
          .map((field) => field.label)
          .toList(growable: false);
      if (missingRequiredFields.isNotEmpty) {
        _showMessage(
          'أكمل الحقول المطلوبة: ${missingRequiredFields.join('، ')}',
        );
        return;
      }
    }

    setState(() => _saving = true);
    final sourceContent =
        _selectedDocument == null &&
            _selectedTemplateId != null &&
            !_showManualDocumentEditor
        ? _applyFieldValues(_templateBaseContent, customFieldValues)
        : _documentContent;
    final content = applyDocumentTemplateVariables(sourceContent, {
      ...customFieldValues,
      'organization':
          (_letterhead['departmentName'] ??
                  _letterhead['organizationName'] ??
                  'وثائقي')
              .toString(),
      'date': DateFormat('yyyy/MM/dd').format(_documentDate),
      'subject': _subjectController.text.trim(),
      if (_selectedDocument?.serialCode.isNotEmpty == true)
        'number': _selectedDocument!.serialCode,
    });
    final input = <String, dynamic>{
      'title': _titleController.text.trim(),
      'category': _documentCategory,
      'subject': _subjectController.text.trim(),
      'content': content,
      'fieldValues': savedFieldValues,
      'documentDate': _documentDate.toUtc().toIso8601String(),
      'templateId': _selectedTemplateId,
      'templateRevision': _selectedTemplateRevision,
    };

    try {
      final saved = _selectedDocument == null
          ? await _outbox.createDocument(input)
          : await _outbox.updateDocument({
              ...input,
              'id': _selectedDocument!.id,
              'expectedUpdatedAt': _selectedDocument!.expectedUpdatedAt,
            });
      if (!mounted) return;
      _selectedDocument = OfficialDocument.fromJson(saved);
      _creatingDocument = false;
      _replaceDocumentEditor(_selectedDocument!.content);
      await _load();
      _showMessage(
        _selectedDocument!.id.startsWith('local_')
            ? 'حُفظت الوثيقة محلياً وستتم مزامنتها عند عودة الاتصال'
            : 'تم حفظ الوثيقة',
      );
    } catch (error) {
      _showMessage('تعذر حفظ الوثيقة: $error');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _issueDocument() async {
    final document = _selectedDocument;
    if (document == null || document.id.startsWith('local_')) {
      _showMessage('تتمكن من إصدار الوثيقة بعد مزامنتها مع الخادم');
      return;
    }
    if (!_canIssueDocuments) {
      _showMessage('لا تملك صلاحية إصدار الوثائق الرسمية');
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: closableDialogTitle(dialogContext, const Text('إصدار الوثيقة')),
        content: const Text(
          'سيتم تخصيص رقم صادر نهائي للوثيقة. لا يمكن تغيير الرقم بعد الإصدار.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('إصدار'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _saving = true);
    try {
      final saved = await _outbox.issueDocument({
        'id': document.id,
        'expectedUpdatedAt': document.expectedUpdatedAt,
      });
      final issuedDocument = OfficialDocument.fromJson(saved);
      _selectedDocument = issuedDocument;
      _replaceDocumentEditor(
        applyDocumentTemplateVariables(issuedDocument.content, {
          'number': issuedDocument.serialCode,
        }),
      );
      await _load();
      _showMessage('تم إصدار الوثيقة بالرقم ${saved['serialCode']}');
    } catch (error) {
      _showMessage('تعذر إصدار الوثيقة: $error');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _archiveDocument() async {
    final document = _selectedDocument;
    if (document == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: closableDialogTitle(dialogContext, const Text('أرشفة الوثيقة')),
        content: const Text('سيتم نقل الوثيقة إلى الأرشيف دون حذفها.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('أرشفة'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _saving = true);
    try {
      final saved = await _outbox.archiveDocument({
        'id': document.id,
        'expectedUpdatedAt': document.expectedUpdatedAt,
      });
      _selectedDocument = OfficialDocument.fromJson(saved);
      await _load();
      _showMessage(
        saved['id'].toString().startsWith('local_')
            ? 'حُفظ طلب الأرشفة محلياً'
            : 'تمت أرشفة الوثيقة',
      );
    } catch (error) {
      _showMessage('تعذرت أرشفة الوثيقة: $error');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _startNewTemplate() {
    _editingTemplateId = null;
    _editingTemplateRevision = 1;
    _selectedTemplate = null;
    _creatingTemplate = true;
    _templateTitleController.clear();
    _templateDescriptionController.clear();
    _templateCategory = 'general';
    _templateFields = [];
    _templateFieldKeys.clear();
    _replaceTemplateEditor({
      'type': 'doc',
      'content': [
        {'type': 'paragraph'},
      ],
    });
    setState(() => _tab = DocumentStudioTab.templates);
  }

  void _selectTemplate(DocumentTemplate template) {
    _selectedTemplate = template;
    _creatingTemplate = false;
    _editingTemplateId = template.id;
    _editingTemplateRevision = template.revision;
    _templateTitleController.text = template.title;
    _templateDescriptionController.text = template.description ?? '';
    _templateCategory = template.category;
    _templateFields = List<DocumentTemplateField>.from(template.fields);
    _templateFieldKeys
      ..clear()
      ..addAll(
        List<UniqueKey>.generate(template.fields.length, (_) => UniqueKey()),
      );
    _replaceTemplateEditor(template.content);
    setState(() => _tab = DocumentStudioTab.templates);
  }

  void _updateTemplateField(
    int index, {
    String? key,
    String? label,
    DocumentTemplateFieldType? type,
    bool? isRequired,
    List<DocumentTemplateFieldOption>? options,
  }) {
    final current = _templateFields[index];
    final updated = DocumentTemplateField(
      key: key ?? current.key,
      label: label ?? current.label,
      type: type ?? current.type,
      required: isRequired ?? current.required,
      maxLength: current.maxLength,
      options: options ?? current.options,
      defaultValue: current.defaultValue,
    );
    setState(() {
      _templateFields = [
        for (var i = 0; i < _templateFields.length; i++)
          if (i == index) updated else _templateFields[i],
      ];
    });
  }

  void _addTemplateField() {
    setState(() {
      _templateFields = [
        ..._templateFields,
        DocumentTemplateField(
          key: 'field_${_templateFields.length + 1}',
          label: 'حقل جديد',
          type: DocumentTemplateFieldType.text,
          required: false,
        ),
      ];
      _templateFieldKeys.add(UniqueKey());
    });
  }

  Future<void> _saveTemplate() async {
    if (_templateTitleController.text.trim().isEmpty) {
      _showMessage('أدخل اسم النموذج أولاً');
      return;
    }
    setState(() => _saving = true);
    final input = <String, dynamic>{
      'title': _templateTitleController.text.trim(),
      'category': _templateCategory,
      'description': _templateDescriptionController.text.trim().isEmpty
          ? null
          : _templateDescriptionController.text.trim(),
      'content': _templateContentDirty
          ? _templateContent
          : DocumentStudioQuillCodec.normalizeLegacyText(
              _selectedTemplate?.content ?? _templateContent,
            ),
      'fields': _templateFields.map((field) => field.toJson()).toList(),
    };
    try {
      final saved = _editingTemplateId == null
          ? await _outbox.createTemplate(input)
          : await _outbox.updateTemplate({
              ...input,
              'id': _editingTemplateId,
              'expectedRevision': _editingTemplateRevision,
            });
      if (!mounted) return;
      final template = DocumentTemplate.fromJson(saved);
      _selectedTemplate = template;
      _editingTemplateId = template.id;
      _editingTemplateRevision = template.revision;
      _replaceTemplateEditor(template.content);
      await _load();
      _showMessage(
        template.id.startsWith('local_')
            ? 'حُفظ النموذج محلياً وستتم مزامنته لاحقاً'
            : 'تم حفظ النموذج',
      );
    } catch (error) {
      _showMessage('تعذر حفظ النموذج: $error');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _deactivateTemplate() async {
    final template = _selectedTemplate;
    if (template == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: closableDialogTitle(dialogContext, const Text('إيقاف النموذج')),
        content: const Text(
          'سيُخفى النموذج عن الاستخدام الجديد مع الاحتفاظ بالوثائق المرتبطة به.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('إيقاف'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _saving = true);
    try {
      await _outbox.deactivateTemplate({
        'id': template.id,
        'expectedRevision': _editingTemplateRevision,
      });
      await _load();
      setState(() {
        _selectedTemplate = null;
        _editingTemplateId = null;
        _creatingTemplate = false;
      });
      _showMessage('تم إيقاف النموذج مع الاحتفاظ بسجلاته');
    } catch (error) {
      _showMessage('تعذر إيقاف النموذج: $error');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Map<String, dynamic> _applyFieldValues(
    Map<String, dynamic> content,
    Map<String, String> values,
  ) => DocumentStudioTemplateFields.applyFieldValues(content, values);

  Widget _buildTabSelector() {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: SegmentedButton<DocumentStudioTab>(
            showSelectedIcon: false,
            style: ButtonStyle(
              visualDensity: VisualDensity.compact,
              padding: const WidgetStatePropertyAll(
                EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
              shape: WidgetStatePropertyAll(
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            segments: const [
              ButtonSegment(
                value: DocumentStudioTab.documents,
                label: Text('الوثائق'),
                icon: Icon(LucideIcons.fileText),
              ),
              ButtonSegment(
                value: DocumentStudioTab.templates,
                label: Text('القوالب'),
                icon: Icon(LucideIcons.layoutTemplate),
              ),
              ButtonSegment(
                value: DocumentStudioTab.archive,
                label: Text('الأرشيف'),
                icon: Icon(LucideIcons.archive),
              ),
              ButtonSegment(
                value: DocumentStudioTab.files,
                label: Text('الملفات'),
                icon: Icon(LucideIcons.folderOpen),
              ),
            ],
            selected: {_tab},
            onSelectionChanged: (selection) {
              setState(() {
                _tab = selection.first;
              });
            },
          ),
        ),
      ),
    );
  }

  Widget _buildWorkspaceWelcome() => Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'من المسودة إلى الأرشيف',
            style: Theme.of(context).textTheme.labelMedium
                ?.copyWith(color: Theme.of(context).colorScheme.primary),
          ),
          const SizedBox(height: 8),
          Text(
            'كل وثيقة تبدأ بخطوة واضحة',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          const Text(
            'اختر وثيقة من القائمة لمتابعة العمل، أو أنشئ وثيقة جديدة، أو استخدم قالباً جاهزاً. ملفاتك المستوردة متاحة في المكان نفسه.',
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              Chip(
                label: Text(
                  'وثائق ${_documents.where((d) => d.status != "archived").length}',
                ),
              ),
              Chip(label: Text('قوالب ${_templates.length}')),
              Chip(
                label: Text(
                  'أرشيف ${_documents.where((d) => d.status == "archived").length}',
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: _saving ? null : _chooseTemplateForNewDocument,
                icon: const Icon(LucideIcons.layoutTemplate),
                label: const Text('استخدام قالب'),
              ),
              OutlinedButton.icon(
                onPressed: () => setState(() => _tab = DocumentStudioTab.files),
                icon: const Icon(LucideIcons.folderOpen),
                label: const Text('إدارة الملفات'),
              ),
            ],
          ),
        ],
      ),
    ),
  );

  Widget _buildDocumentList({required bool archived}) {
    final items = _documents
        .where(
          (document) =>
              !document.isLegacyStarterDraft &&
              (document.status == (archived ? 'archived' : 'draft') ||
                  (!archived && document.status == 'issued')),
        )
        .toList();
    if (items.isEmpty) {
      return _emptyState(
        archived ? 'لا توجد وثائق مؤرشفة' : 'لا توجد وثائق بعد',
        archived ? Icons.archive_outlined : Icons.description_outlined,
      );
    }
    return Column(
      children: [
        for (final document in items)
          Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: const CircleAvatar(
                child: Icon(Icons.description_outlined),
              ),
              title: Text(
                document.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(
                [
                  if (document.serialCode.isNotEmpty) document.serialCode,
                  document.subject,
                  if (document.file != null) document.file!.fileName,
                  _formatDate(document.updatedAt),
                ].where((value) => value.isNotEmpty).join(' · '),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              trailing: _statusChip(document.status),
              onTap: () => _selectDocument(document),
            ),
          ),
      ],
    );
  }

  Widget _buildDocumentForm() {
    if (_previewMode && _selectedDocument != null) {
      return _buildDocumentPreview(_selectedDocument!);
    }

    final canEdit =
        _selectedDocument == null || _selectedDocument!.status == 'draft';
    final matchingTemplates = _templates
        .where((template) => template.id == _selectedTemplateId)
        .toList();
    final documentFields =
        _selectedDocument?.templateFieldsSnapshot ??
        const <DocumentTemplateField>[];
    final fields = documentFields.isNotEmpty
        ? documentFields
        : (matchingTemplates.isNotEmpty
              ? matchingTemplates.first.fields
              : const <DocumentTemplateField>[]);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            IconButton(
              tooltip: 'قائمة الوثائق',
              onPressed: () => setState(() {
                _selectedDocument = null;
                _creatingDocument = false;
              }),
              icon: const Icon(Icons.arrow_back),
            ),
            Expanded(
              child: Text(
                _selectedDocument == null ? 'وثيقة جديدة' : 'تحرير الوثيقة',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            if (_selectedDocument != null) ...[
              _statusChip(_selectedDocument!.status),
              const SizedBox(width: 6),
              OutlinedButton.icon(
                onPressed: () => setState(() => _previewMode = true),
                icon: const Icon(Icons.visibility_outlined, size: 18),
                label: const Text('معاينة'),
              ),
            ],
          ],
        ),
        TextField(
          controller: _titleController,
          enabled: canEdit,
          decoration: const InputDecoration(
            labelText: 'عنوان الوثيقة',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 10),
        DropdownButtonFormField<String>(
          initialValue: _documentCategory,
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
          onChanged: canEdit
              ? (value) {
                  if (value != null) setState(() => _documentCategory = value);
                }
              : null,
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _subjectController,
          enabled: canEdit,
          decoration: const InputDecoration(
            labelText: 'الموضوع',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _recipientLabelController,
          enabled: canEdit,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            labelText: 'تسمية جهة التوجيه',
            hintText: 'إلى',
            labelStyle: TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.all(Radius.circular(10)),
            ),
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _recipientValueController,
          onChanged: (_) => setState(() {}),
          enabled: canEdit,
          decoration: const InputDecoration(
            labelText: 'الجهة المستلمة',
            hintText: 'مثال: الإدارة العامة',
            labelStyle: TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.all(Radius.circular(10)),
            ),
          ),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: canEdit ? _chooseDocumentDate : null,
          icon: const Icon(Icons.calendar_month_outlined),
          label: Text(
            'التاريخ: ${DateFormat('yyyy/MM/dd').format(_documentDate)}',
          ),
        ),
        const SizedBox(height: 10),
        DropdownButtonFormField<String?>(
          initialValue: _selectedTemplateId,
          decoration: const InputDecoration(
            labelText: 'النموذج الأساسي',
            border: OutlineInputBorder(),
          ),
          items: [
            const DropdownMenuItem<String?>(
              value: null,
              child: Text('بدون نموذج'),
            ),
            ..._templates
                .where((template) => template.isActive)
                .map(
                  (template) => DropdownMenuItem<String?>(
                    value: template.id,
                    child: Text(template.title),
                  ),
                ),
          ],
          onChanged: canEdit
              ? (value) {
                  if (value == null) {
                    setState(() {
                      _selectedTemplateId = null;
                      _selectedTemplateRevision = null;
                      _resetFieldControllers(const [], {});
                    });
                  } else {
                    final template = _templates.firstWhere(
                      (item) => item.id == value,
                    );
                    _useTemplate(template);
                  }
                }
              : null,
        ),
        if (fields.isNotEmpty) ...[
          const SizedBox(height: 12),
          Card(
            color: Theme.of(context).colorScheme.surfaceContainerLow,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'حقول تعبئة النموذج',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                      if (_selectedDocument == null)
                        TextButton(
                          onPressed: canEdit
                              ? () {
                                  final showEditor = !_showManualDocumentEditor;
                                  if (showEditor) {
                                    _replaceDocumentEditor(
                                      _applyFieldValues(
                                        _templateBaseContent,
                                        _fieldValues,
                                      ),
                                    );
                                  }
                                  setState(
                                    () =>
                                        _showManualDocumentEditor = showEditor,
                                  );
                                }
                              : null,
                          child: Text(
                            _showManualDocumentEditor
                                ? 'إخفاء محرر النص'
                                : 'تحرير النص يدوياً (اختياري)',
                          ),
                        ),
                    ],
                  ),
                  for (final field in fields)
                    _buildDocumentField(field, canEdit),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 12),
        if (_selectedDocument case final document?)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'معاينة وإخراج الوثيقة الرسمية',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    document.file == null
                        ? 'ملف PDF سيُجهّز من محرك الوثائق عند الطلب'
                        : document.file!.mimeType ==
                              DocumentFileSupport.docxMime
                        ? 'تُنشأ معاينة PDF وملف الطباعة من Word على الخادم؛ يبقى الملف الأصلي متاحاً دون تغيير.'
                        : 'تتم معاينة PDF وتنزيله وطباعته من bytes الملف الأصلي.',
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (document.file?.mimeType ==
                          DocumentFileSupport.docxMime) ...[
                        OutlinedButton.icon(
                          onPressed: _saving
                              ? null
                              : () => _saveOriginalDocument(document),
                          icon: const Icon(Icons.download_outlined),
                          label: const Text('تنزيل Word الأصلي'),
                        ),
                        OutlinedButton.icon(
                          onPressed: _saving
                              ? null
                              : () => _shareOriginalDocument(document),
                          icon: const Icon(Icons.share_outlined),
                          label: const Text('مشاركة Word الأصلي'),
                        ),
                        OutlinedButton.icon(
                          onPressed: _saving
                              ? null
                              : () => _printDocumentFile(document),
                          icon: const Icon(Icons.print_outlined),
                          label: const Text('طباعة'),
                        ),
                      ] else ...[
                        OutlinedButton.icon(
                          onPressed: _saving
                              ? null
                              : () => _saveDocumentPdf(document),
                          icon: const Icon(Icons.download_outlined),
                          label: const Text('تنزيل PDF'),
                        ),
                        OutlinedButton.icon(
                          onPressed: _saving
                              ? null
                              : () => _shareDocumentPdf(document),
                          icon: const Icon(Icons.share_outlined),
                          label: const Text('مشاركة PDF'),
                        ),
                        OutlinedButton.icon(
                          onPressed: _saving
                              ? null
                              : () => _printDocumentFile(document),
                          icon: const Icon(Icons.print_outlined),
                          label: const Text('طباعة'),
                        ),
                      ],
                      if (document.file != null) ...[
                        Text(
                          document.file!.fileName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ],
                  ),
                  if (_saving)
                    const Padding(
                      padding: EdgeInsets.only(top: 10),
                      child: LinearProgressIndicator(),
                    ),
                ],
              ),
            ),
          ),
        if (_selectedDocument?.file == null &&
            (_selectedDocument != null ||
                fields.isEmpty ||
                _showManualDocumentEditor))
          _buildA4Editor(controller: _documentEditor, editable: canEdit)
        else if (_selectedDocument == null && fields.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              'ستُنشأ الوثيقة تلقائياً من إجابات الحقول أعلاه. يمكنك فتح تحرير النص يدوياً عند الحاجة.',
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton.icon(
              onPressed: _saving || !canEdit ? null : _saveDocument,
              icon: const Icon(Icons.save_outlined),
              label: const Text('حفظ الوثيقة'),
            ),
            if (_selectedDocument?.status == 'draft' &&
                _canIssueDocuments &&
                !_selectedDocument!.id.startsWith('local_'))
              FilledButton.tonalIcon(
                onPressed: _saving ? null : _issueDocument,
                icon: const Icon(Icons.verified_outlined),
                label: const Text('إصدار'),
              ),
            if (_selectedDocument?.status == 'issued')
              OutlinedButton.icon(
                onPressed: _saving ? null : _archiveDocument,
                icon: const Icon(Icons.archive_outlined),
                label: const Text('أرشفة'),
              ),
          ],
        ),
      ],
    );
  }

  Widget _buildDocumentPreview(OfficialDocument document) {
    final mimeType = document.file?.mimeType;
    final isWord = mimeType == DocumentFileSupport.docxMime;
    final isPdf = mimeType == DocumentFileSupport.pdfMime;
    final isNativeDocument = document.file == null;
    final canUsePdfActions = isPdf || isNativeDocument;
    final canPrint = isWord || canUsePdfActions;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            IconButton(
              tooltip: 'قائمة الوثائق',
              onPressed: () => setState(() {
                _previewMode = false;
                _selectedDocument = null;
                _creatingDocument = false;
              }),
              icon: const Icon(Icons.arrow_back),
            ),
            Expanded(
              child: Text(
                document.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            _statusChip(document.status),
          ],
        ),
        const SizedBox(height: 10),
        _buildDocumentVersionHistory(),
        if (isNativeDocument)
          _buildA4Editor(controller: _documentEditor, editable: false)
        else if (isWord || isPdf)
          SizedBox(
            height: 620,
            child: PdfPreview(
              pdfFileName: isWord
                  ? '${document.title}.pdf'
                  : document.file!.fileName,
              build: (_) => _fetchDocumentPdf(document),
              allowPrinting: false,
              allowSharing: false,
              canChangePageFormat: false,
              canChangeOrientation: false,
            ),
          )
        else
          _buildUnsupportedDocumentPreview(
            document,
            'نوع الملف هذا لا يدعم المعاينة داخل التطبيق حالياً',
          ),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 1.55,
          children: [
            _documentPreviewAction(
              icon: Icons.download_outlined,
              label: isWord ? 'تنزيل Word' : 'تنزيل PDF',
              onPressed: _saving
                  ? null
                  : isWord
                  ? () => _saveOriginalDocument(document)
                  : canUsePdfActions
                  ? () => _saveDocumentPdf(document)
                  : null,
            ),
            _documentPreviewAction(
              icon: Icons.share_outlined,
              label: isWord ? 'مشاركة Word' : 'مشاركة PDF',
              onPressed: _saving
                  ? null
                  : isWord
                  ? () => _shareOriginalDocument(document)
                  : canUsePdfActions
                  ? () => _shareDocumentPdf(document)
                  : null,
            ),
            _documentPreviewAction(
              icon: Icons.print_outlined,
              label: 'طباعة',
              onPressed: _saving || !canPrint
                  ? null
                  : () => _printDocumentFile(document),
            ),
            _documentPreviewAction(
              icon: Icons.edit_outlined,
              label: 'تعديل الوثيقة',
              onPressed: _saving
                  ? null
                  : () => setState(() => _previewMode = false),
            ),
          ],
        ),
        if (_saving) ...[
          const SizedBox(height: 10),
          const LinearProgressIndicator(),
        ],
      ],
    );
  }

  Widget _buildUnsupportedDocumentPreview(
    OfficialDocument document,
    String message,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            const Icon(Icons.description_outlined, size: 42),
            const SizedBox(height: 8),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 4),
            Text(
              document.file?.fileName ?? document.title,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _documentPreviewAction({
    required IconData icon,
    required String label,
    required VoidCallback? onPressed,
  }) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 21),
          const SizedBox(height: 5),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 11),
          ),
        ],
      ),
    );
  }

  Widget _buildDocumentField(DocumentTemplateField field, bool canEdit) {
    final controller = _fieldControllers.putIfAbsent(
      field.key,
      () => TextEditingController(text: _fieldValues[field.key] ?? ''),
    );
    final label = '${field.label}${field.required ? ' *' : ''}';
    if (field.type == DocumentTemplateFieldType.select) {
      return Padding(
        padding: const EdgeInsets.only(top: 8),
        child: DropdownButtonFormField<String>(
          initialValue: _fieldValues[field.key]?.isEmpty == true
              ? null
              : _fieldValues[field.key],
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
          ),
          items: field.options
              .map(
                (option) => DropdownMenuItem(
                  value: option.label,
                  child: Text(option.label),
                ),
              )
              .toList(),
          onChanged: canEdit
              ? (value) {
                  if (value == null) return;
                  _fieldValues[field.key] = value;
                  controller.text = value;
                }
              : null,
        ),
      );
    }
    if (field.type == DocumentTemplateFieldType.date) {
      return Padding(
        padding: const EdgeInsets.only(top: 8),
        child: TextField(
          controller: controller,
          readOnly: true,
          enabled: canEdit,
          decoration: InputDecoration(
            labelText: label,
            labelStyle: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
            ),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            suffixIcon: const Icon(Icons.calendar_today_outlined),
          ),
          onTap: canEdit
              ? () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate:
                        DateTime.tryParse(controller.text) ?? DateTime.now(),
                    firstDate: DateTime(1950),
                    lastDate: DateTime(2100),
                  );
                  if (picked == null) return;
                  final value = DateFormat('yyyy-MM-dd').format(picked);
                  controller.text = value;
                  _fieldValues[field.key] = value;
                }
              : null,
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: TextField(
        controller: controller,
        enabled: canEdit,
        maxLines: field.type == DocumentTemplateFieldType.multiline ? 3 : 1,
        keyboardType: field.type == DocumentTemplateFieldType.number
            ? TextInputType.number
            : TextInputType.text,
        maxLength: field.maxLength,
        decoration: InputDecoration(
          labelText: label,
          labelStyle: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w800,
          ),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        ),
        onChanged: (value) => _fieldValues[field.key] = value,
      ),
    );
  }

  Future<void> _chooseDocumentDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _documentDate,
      firstDate: DateTime(1950),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _documentDate = picked);
  }

  Widget _buildTemplateLibrary() {
    final activeTemplates = _templates.where((template) => template.isActive);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'مكتبة النماذج',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ),
            FilledButton.icon(
              onPressed: _startNewTemplate,
              icon: const Icon(Icons.add),
              label: const Text('نموذج جديد'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (!_creatingTemplate && _selectedTemplate == null)
          for (final template in activeTemplates)
            Card(
              child: ListTile(
                title: Text(template.title),
                subtitle: Text(
                  '${_categories[template.category] ?? template.category} · إصدار ${template.revision}',
                ),
                trailing: PopupMenuButton<String>(
                  onSelected: (value) {
                    if (value == 'edit') _selectTemplate(template);
                    if (value == 'use') _useTemplate(template);
                  },
                  itemBuilder: (context) => const [
                    PopupMenuItem(value: 'edit', child: Text('تعديل النموذج')),
                    PopupMenuItem(value: 'use', child: Text('استخدام النموذج')),
                  ],
                ),
                onTap: () => _selectTemplate(template),
              ),
            ),
        if (_creatingTemplate || _selectedTemplate != null)
          _buildTemplateForm(),
      ],
    );
  }

  Widget _buildTemplateForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            IconButton(
              tooltip: 'قائمة النماذج',
              onPressed: () {
                setState(() {
                  _selectedTemplate = null;
                  _editingTemplateId = null;
                  _creatingTemplate = false;
                });
              },
              icon: const Icon(Icons.arrow_back),
            ),
            const Expanded(
              child: Text(
                'محرر النموذج',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
            if (_selectedTemplate != null)
              IconButton(
                tooltip: 'إيقاف النموذج',
                onPressed: _saving ? null : _deactivateTemplate,
                icon: const Icon(Icons.archive_outlined),
              ),
          ],
        ),
        TextField(
          controller: _templateTitleController,
          decoration: const InputDecoration(
            labelText: 'اسم النموذج',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: _templateCategory,
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
            if (value != null) setState(() => _templateCategory = value);
          },
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _templateDescriptionController,
          maxLines: 2,
          decoration: const InputDecoration(
            labelText: 'وصف النموذج',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            const Expanded(
              child: Text(
                'حقول التعبئة',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
            TextButton.icon(
              onPressed: _addTemplateField,
              icon: const Icon(Icons.add),
              label: const Text('إضافة حقل'),
            ),
          ],
        ),
        for (var index = 0; index < _templateFields.length; index++)
          _buildTemplateFieldEditor(index),
        const SizedBox(height: 12),
        const Text(
          'المتغيرات التلقائية: {{organization}} للجهة، {{date}} للتاريخ، '
          '{{number}} للرقم عند الإصدار، و{{subject}} للموضوع. '
          'يمكنك أيضاً إضافة حقول تعبئة مخصصة.',
          textDirection: ui.TextDirection.rtl,
        ),
        const SizedBox(height: 8),
        _buildA4Editor(controller: _templateEditor, editable: true),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: _saving ? null : _saveTemplate,
          icon: const Icon(Icons.save_outlined),
          label: const Text('حفظ النموذج'),
        ),
      ],
    );
  }

  Widget _buildTemplateFieldEditor(int index) {
    final field = _templateFields[index];
    final optionsText = field.options.map((option) => option.label).join(', ');
    return Card(
      key: _templateFieldKeys[index],
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          children: [
            TextFormField(
              key: ValueKey('field-label-$index'),
              initialValue: field.label,
              decoration: const InputDecoration(
                labelText: 'اسم الحقل',
                border: OutlineInputBorder(),
              ),
              onChanged: (value) => _updateTemplateField(index, label: value),
            ),
            const SizedBox(height: 8),
            TextFormField(
              key: ValueKey('field-key-$index'),
              initialValue: field.key,
              textAlign: TextAlign.left,
              decoration: const InputDecoration(
                labelText: 'المفتاح البرمجي',
                hintText: 'employee_name',
                helperText: 'المفتاح إنجليزي؛ تتحول المسافات إلى _، وتبقى مسافات التسمية والقيم والخيارات مسموحة.',
                labelStyle: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.all(Radius.circular(10)),
                ),
              ),
              onChanged: (value) => _updateTemplateField(
                index,
                key: value.toLowerCase().replaceAll(RegExp(r'[^a-z0-9_]'), '_'),
              ),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<DocumentTemplateFieldType>(
              initialValue: field.type,
              decoration: const InputDecoration(
                labelText: 'نوع الحقل',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(
                  value: DocumentTemplateFieldType.text,
                  child: Text('نص'),
                ),
                DropdownMenuItem(
                  value: DocumentTemplateFieldType.multiline,
                  child: Text('نص متعدد الأسطر'),
                ),
                DropdownMenuItem(
                  value: DocumentTemplateFieldType.date,
                  child: Text('تاريخ'),
                ),
                DropdownMenuItem(
                  value: DocumentTemplateFieldType.number,
                  child: Text('رقم'),
                ),
                DropdownMenuItem(
                  value: DocumentTemplateFieldType.select,
                  child: Text('قائمة اختيار'),
                ),
              ],
              onChanged: (value) {
                if (value == null) return;
                _updateTemplateField(
                  index,
                  type: value,
                  options: value == DocumentTemplateFieldType.select
                      ? (field.options.isNotEmpty
                            ? field.options
                            : const [
                                DocumentTemplateFieldOption(
                                  value: 'yes',
                                  label: 'نعم',
                                ),
                                DocumentTemplateFieldOption(
                                  value: 'no',
                                  label: 'لا',
                                ),
                              ])
                      : const [],
                );
              },
            ),
            if (field.type == DocumentTemplateFieldType.select) ...[
              const SizedBox(height: 8),
              TextFormField(
                key: ValueKey('field-options-$index'),
                initialValue: optionsText,
                decoration: const InputDecoration(
                  labelText: 'الخيارات مفصولة بفواصل',
                  border: OutlineInputBorder(),
                ),
                onChanged: (value) {
                  final labels = value
                      .split(',')
                      .map((item) => item.trim())
                      .where((item) => item.isNotEmpty)
                      .toList();
                  _updateTemplateField(
                    index,
                    options: [
                      for (var i = 0; i < labels.length; i++)
                        DocumentTemplateFieldOption(
                          value: 'option_${i + 1}',
                          label: labels[i],
                        ),
                    ],
                  );
                },
              ),
            ],
            Row(
              children: [
                Checkbox(
                  value: field.required,
                  onChanged: (value) =>
                      _updateTemplateField(index, isRequired: value ?? false),
                ),
                const Text('حقل مطلوب'),
                const Spacer(),
                IconButton(
                  tooltip: 'حذف الحقل',
                  onPressed: () {
                    setState(() {
                      _templateFields.removeAt(index);
                      _templateFieldKeys.removeAt(index);
                    });
                  },
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _editDocumentSettings() async {
    if (!_isPlatformOwner) return;

    final values = Map<String, dynamic>.from(_platformDocumentSettings);
    final watermarkController = TextEditingController(
      text: values['watermarkText']?.toString() ?? 'وزارة الداخلية',
    );
    final titleController = TextEditingController(
      text: values['headerTitle']?.toString().trim().isNotEmpty == true
          ? values['headerTitle'].toString()
          : 'المقدم غسان صالح كنو',
    );
    final subtitleController = TextEditingController(
      text: values['headerSubtitle']?.toString().trim().isNotEmpty == true
          ? values['headerSubtitle'].toString()
          : 'رئيس قسم الشهباء',
    );
    final rankController = TextEditingController(
      text: values['headerChiefRank']?.toString() ?? '',
    );
    final nameController = TextEditingController(
      text: values['headerChiefName']?.toString() ?? '',
    );
    var showWatermark = values['showMinistryWatermarkText'] != false;
    var showLogo = values['headerShowLogo'] != false;
    var opacity = (values['watermarkOpacityPercent'] as num? ?? 12).toDouble();
    var watermarkScale = (values['watermarkScalePercent'] as num? ?? 100)
        .toDouble();
    var logoSize = (values['headerLogoSize'] as num? ?? 120).toDouble();
    var topPadding = (values['headerTopPaddingMm'] as num? ?? 0).toDouble();
    var horizontalPadding = (values['headerHorizontalPaddingMm'] as num? ?? 0)
        .toDouble();
    var bottomPadding = (values['headerBottomPaddingMm'] as num? ?? 6)
        .toDouble();
    var alignment = values['headerAlignment']?.toString() ?? 'spread';
    var dividerStyle = values['headerDividerStyle']?.toString() ?? 'double';
    var frameStyle = values['frameStyle']?.toString() ?? 'single';
    var frameColor = values['frameColor']?.toString() ?? '#b49a55';
    var dividerWidth = (values['headerDividerWidthPt'] as num? ?? 2.25)
        .toDouble();
    var frameWidth = (values['frameWidthPt'] as num? ?? 1).toDouble();
    var marginTop = (values['pageMarginTopMm'] as num? ?? 10).toDouble();
    var marginRight = (values['pageMarginRightMm'] as num? ?? 10).toDouble();
    var marginBottom = (values['pageMarginBottomMm'] as num? ?? 10).toDouble();
    var marginLeft = (values['pageMarginLeftMm'] as num? ?? 10).toDouble();

    try {
      final updated = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
          builder: (context, setDialogState) => AlertDialog(
            title: closableDialogTitle(
              dialogContext,
              const Text('إعدادات الوثيقة الرسمية'),
            ),
            content: SizedBox(
              width: 520,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'العلامة الأمنية',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('إظهار العلامة الأمنية'),
                      value: showWatermark,
                      onChanged: (value) =>
                          setDialogState(() => showWatermark = value),
                    ),
                    TextField(
                      controller: watermarkController,
                      maxLength: 255,
                      decoration: const InputDecoration(
                        labelText: 'نص العلامة الأمنية',
                        hintText: 'وزارة الداخلية',
                      ),
                    ),
                    _documentSettingSlider(
                      label: 'شفافية العلامة الأمنية',
                      value: opacity,
                      min: 0,
                      max: 60,
                      suffix: '%',
                      onChanged: (value) =>
                          setDialogState(() => opacity = value),
                    ),
                    _documentSettingSlider(
                      label: 'حجم العلامة المائية',
                      value: watermarkScale,
                      min: 40,
                      max: 180,
                      suffix: '%',
                      onChanged: (value) =>
                          setDialogState(() => watermarkScale = value),
                    ),
                    const Divider(height: 28),
                    const Text(
                      'محتوى ترويسة الوثيقة',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const Padding(
                      padding: EdgeInsets.only(top: 6, bottom: 8),
                      child: Text(
                        'يظهر الشعار في منتصف الترويسة أعلى الصفحة، ويظهر سطرا المسؤول في منتصف الصفحة أسفل متن الوثيقة مباشرة.',
                        style: TextStyle(
                          color: Colors.black54,
                          fontSize: 12,
                          height: 1.5,
                        ),
                      ),
                    ),
                    TextField(
                      controller: titleController,
                      decoration: const InputDecoration(
                        labelText: 'رتبة رئيس الوحدة',
                        hintText: 'المقدم غسان صالح كنو',
                      ),
                    ),
                    TextField(
                      controller: subtitleController,
                      decoration: const InputDecoration(
                        labelText: 'اسم الوحدة / صفة المسؤول',
                        hintText: 'رئيس قسم الشهباء',
                      ),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('إظهار شعار الجهة'),
                      value: showLogo,
                      onChanged: (value) =>
                          setDialogState(() => showLogo = value),
                    ),
                    _documentSettingSlider(
                      label: 'حجم الشعار',
                      value: logoSize,
                      min: 90,
                      max: 160,
                      suffix: ' px',
                      onChanged: (value) =>
                          setDialogState(() => logoSize = value),
                    ),
                    _documentSettingSlider(
                      label: 'الهامش العلوي',
                      value: topPadding,
                      min: 0,
                      max: 30,
                      suffix: ' مم',
                      onChanged: (value) =>
                          setDialogState(() => topPadding = value),
                    ),
                    _documentSettingSlider(
                      label: 'الهامش الأفقي',
                      value: horizontalPadding,
                      min: 0,
                      max: 30,
                      suffix: ' مم',
                      onChanged: (value) =>
                          setDialogState(() => horizontalPadding = value),
                    ),
                    _documentSettingSlider(
                      label: 'الهامش السفلي',
                      value: bottomPadding,
                      min: 0,
                      max: 30,
                      suffix: ' مم',
                      onChanged: (value) =>
                          setDialogState(() => bottomPadding = value),
                    ),
                    const Divider(height: 28),
                    const Text(
                      'صفحة الوثيقة والإطار',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    for (final item
                        in <
                          ({
                            String label,
                            double value,
                            void Function(double) onChanged,
                          })
                        >[
                          (
                            label: 'الهامش العلوي',
                            value: marginTop,
                            onChanged: (v) =>
                                setDialogState(() => marginTop = v),
                          ),
                          (
                            label: 'الهامش الأيمن',
                            value: marginRight,
                            onChanged: (v) =>
                                setDialogState(() => marginRight = v),
                          ),
                          (
                            label: 'الهامش السفلي',
                            value: marginBottom,
                            onChanged: (v) =>
                                setDialogState(() => marginBottom = v),
                          ),
                          (
                            label: 'الهامش الأيسر',
                            value: marginLeft,
                            onChanged: (v) =>
                                setDialogState(() => marginLeft = v),
                          ),
                        ])
                      _documentSettingSlider(
                        label: item.label,
                        value: item.value,
                        min: 0,
                        max: 35,
                        suffix: ' مم',
                        onChanged: item.onChanged,
                      ),
                    DropdownButtonFormField<String>(
                      initialValue: frameStyle,
                      decoration: const InputDecoration(
                        labelText: 'شكل الإطار',
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'none',
                          child: Text('بدون إطار'),
                        ),
                        DropdownMenuItem(value: 'single', child: Text('مفرد')),
                        DropdownMenuItem(value: 'double', child: Text('مزدوج')),
                        DropdownMenuItem(value: 'ornate', child: Text('زخرفي')),
                      ],
                      onChanged: (v) {
                        if (v != null) setDialogState(() => frameStyle = v);
                      },
                    ),
                    TextField(
                      decoration: const InputDecoration(
                        labelText: 'لون الإطار #RRGGBB',
                      ),
                      controller: TextEditingController(text: frameColor),
                      onChanged: (v) => frameColor = v,
                    ),
                    _documentSettingSlider(
                      label: 'سماكة الإطار',
                      value: frameWidth,
                      min: .5,
                      max: 4,
                      suffix: ' نقطة',
                      onChanged: (v) => setDialogState(() => frameWidth = v),
                    ),
                    DropdownButtonFormField<String>(
                      initialValue: dividerStyle,
                      decoration: const InputDecoration(
                        labelText: 'نمط الفاصل',
                      ),
                      items: const [
                        DropdownMenuItem(value: 'solid', child: Text('متصل')),
                        DropdownMenuItem(value: 'double', child: Text('مزدوج')),
                        DropdownMenuItem(value: 'dashed', child: Text('متقطع')),
                        DropdownMenuItem(value: 'dotted', child: Text('منقط')),
                        DropdownMenuItem(
                          value: 'tricolor-stars',
                          child: Text('أسود وأخضر مع ثلاث نجوم'),
                        ),
                      ],
                      onChanged: (v) {
                        if (v != null) setDialogState(() => dividerStyle = v);
                      },
                    ),
                    _documentSettingSlider(
                      label: 'سماكة الفاصل',
                      value: dividerWidth,
                      min: .5,
                      max: 6,
                      suffix: ' نقطة',
                      onChanged: (v) => setDialogState(() => dividerWidth = v),
                    ),
                    DropdownButtonFormField<String>(
                      initialValue: alignment,
                      decoration: const InputDecoration(
                        labelText: 'محاذاة الرأس',
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'spread',
                          child: Text('توزيع متوازن'),
                        ),
                        DropdownMenuItem(value: 'center', child: Text('توسيط')),
                        DropdownMenuItem(
                          value: 'right',
                          child: Text('إلى اليمين'),
                        ),
                      ],
                      onChanged: (value) {
                        if (value != null) {
                          setDialogState(() => alignment = value);
                        }
                      },
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('إلغاء'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, {
                  ...values,
                  'showMinistryWatermarkText': showWatermark,
                  'watermarkText': watermarkController.text.trim().isEmpty
                      ? 'وزارة الداخلية'
                      : watermarkController.text.trim(),
                  'watermarkOpacityPercent': opacity.round(),
                  'watermarkScalePercent': watermarkScale.round(),
                  'headerTitle': titleController.text.trim(),
                  'headerSubtitle': subtitleController.text.trim(),
                  'headerChiefRank': rankController.text.trim(),
                  'headerChiefName': nameController.text.trim(),
                  'headerShowLogo': showLogo,
                  'headerLogoSize': logoSize.round(),
                  'headerTopPaddingMm': topPadding.round(),
                  'headerHorizontalPaddingMm': horizontalPadding.round(),
                  'headerBottomPaddingMm': bottomPadding.round(),
                  'headerAlignment': alignment,
                  'headerDividerStyle': dividerStyle,
                  'headerDividerWidthPt': dividerWidth,
                  'pageMarginTopMm': marginTop.round(),
                  'pageMarginRightMm': marginRight.round(),
                  'pageMarginBottomMm': marginBottom.round(),
                  'pageMarginLeftMm': marginLeft.round(),
                  'frameStyle': frameStyle,
                  'frameColor': frameColor,
                  'frameWidthPt': frameWidth,
                }),
                child: const Text('حفظ الإعدادات'),
              ),
            ],
          ),
        ),
      );

      if (updated == null || !mounted) return;
      await widget.api.call(
        'platformDocumentSettings.update',
        input: updated,
        mutation: true,
      );
      if (!mounted) return;
      setState(() => _platformDocumentSettings = updated);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('تم حفظ إعدادات الوثيقة')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('تعذر حفظ الإعدادات: $error')));
    } finally {
      watermarkController.dispose();
      titleController.dispose();
      subtitleController.dispose();
      rankController.dispose();
      nameController.dispose();
    }
  }

  Widget _documentSettingSlider({
    required String label,
    required double value,
    required double min,
    required double max,
    required String suffix,
    required ValueChanged<double> onChanged,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text(label)),
            Text('${value.round()}$suffix'),
          ],
        ),
        Slider(
          value: value.clamp(min, max),
          min: min,
          max: max,
          divisions: (max - min).round(),
          onChanged: onChanged,
        ),
      ],
    );
  }

  String _headerSetting(String key, String fallback) {
    final value = _platformDocumentSettings[key]?.toString().trim();
    return value == null || value.isEmpty ? fallback : value;
  }

  double _headerMillimeters(String key, double fallback) {
    final value = _platformDocumentSettings[key];
    final parsed = value is num ? value.toDouble() : double.tryParse('$value');
    return (parsed ?? fallback).clamp(0, 30).toDouble();
  }

  Widget _buildA4Editor({
    required QuillController controller,
    required bool editable,
  }) {
    controller.readOnly = !editable;
    final rawOpacity = _platformDocumentSettings['watermarkOpacityPercent'];
    final opacity =
        (rawOpacity is num
            ? rawOpacity.toDouble()
            : double.tryParse('$rawOpacity') ?? 12) /
        100;
    final rawWatermarkScale =
        _platformDocumentSettings['watermarkScalePercent'];
    final watermarkScalePercent =
        (rawWatermarkScale is num
                ? rawWatermarkScale.toDouble()
                : double.tryParse('$rawWatermarkScale') ?? 100)
            .clamp(40.0, 180.0)
            .toDouble();
    const pixelsPerMillimeter = 794 / 210;
    final headerTitle = _headerSetting('headerTitle', 'المقدم غسان صالح كنو');
    final headerSubtitle = _headerSetting('headerSubtitle', 'رئيس قسم الشهباء');
    final showLogo = _platformDocumentSettings['headerShowLogo'] != false;
    final logoSizeValue = _platformDocumentSettings['headerLogoSize'];
    final logoSize =
        ((logoSizeValue is num ? logoSizeValue.toDouble() : 160.0) * 1.35)
            .clamp(120.0, 220.0)
            .toDouble();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (editable)
          Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: QuillSimpleToolbar(
                controller: controller,
                config: const QuillSimpleToolbarConfig(),
              ),
            ),
          ),
        LayoutBuilder(
          builder: (context, _) {
            const pageWidth = 794.0;
            final pageHeight =
                pageWidth * DocumentPaper.a4Height / DocumentPaper.a4Width;
            final paper = DocumentPaper(
              fixedWidth: pageWidth,
              showWatermarkText:
                  _platformDocumentSettings['showMinistryWatermarkText'] !=
                  false,
              watermarkOpacity: opacity,
              watermarkScalePercent: watermarkScalePercent,
              watermarkText:
                  _platformDocumentSettings['watermarkText']?.toString() ??
                  'وزارة الداخلية',
              logoUrl: _letterhead['logoUrl']?.toString(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (showLogo &&
                      (_letterhead['logoUrl']?.toString().isNotEmpty ?? false))
                    Padding(
                      padding: EdgeInsets.only(
                        top:
                            _headerMillimeters('headerTopPaddingMm', 0) *
                            pixelsPerMillimeter,
                      ),
                      child: Center(
                        child: Image.network(
                          _letterhead['logoUrl'].toString(),
                          width: logoSize,
                          height: logoSize,
                          fit: BoxFit.contain,
                          errorBuilder: (_, _, _) =>
                              SizedBox(width: logoSize, height: logoSize),
                        ),
                      ),
                    ),
                  Container(
                    padding: EdgeInsets.fromLTRB(
                      _headerMillimeters('headerHorizontalPaddingMm', 0) *
                          pixelsPerMillimeter,
                      _headerMillimeters('headerTopPaddingMm', 0) *
                          pixelsPerMillimeter,
                      _headerMillimeters('headerHorizontalPaddingMm', 0) *
                          pixelsPerMillimeter,
                      _headerMillimeters('headerBottomPaddingMm', 6) *
                          pixelsPerMillimeter,
                    ),
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(
                          color: _documentHeaderDividerColor(),
                          width: 3,
                        ),
                      ),
                    ),
                    child: Row(
                      textDirection: ui.TextDirection.rtl,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                'الرقم: ${_selectedDocument?.serialCode.isNotEmpty == true ? _selectedDocument!.serialCode : 'يخصص عند الإصدار'}',
                                maxLines: 1,
                                softWrap: false,
                                textAlign: TextAlign.right,
                                style: TextStyle(
                                  color: _documentSettingColor(
                                    'documentFontColor',
                                    Colors.black,
                                  ),
                                  fontFamily: _documentSettingFamily(
                                    'documentFontFamily',
                                    'Amiri',
                                  ),
                                  fontWeight: _documentSettingWeight(
                                    'documentFontWeight',
                                    FontWeight.w700,
                                  ),
                                  fontSize:
                                      _documentSettingSize(
                                        'documentFontSizePt',
                                        12,
                                      ) *
                                      1.65,
                                  height: 1.5,
                                ),
                              ),
                              Row(
                                textDirection: ui.TextDirection.rtl,
                                children: [
                                  Text(
                                    'التاريخ:',
                                    style: TextStyle(
                                      color: _documentSettingColor(
                                        'documentFontColor',
                                        Colors.black,
                                      ),
                                      fontFamily: _documentSettingFamily(
                                        'documentFontFamily',
                                        'Amiri',
                                      ),
                                      fontWeight: _documentSettingWeight(
                                        'documentFontWeight',
                                        FontWeight.w700,
                                      ),
                                      fontSize:
                                          _documentSettingSize(
                                            'documentFontSizePt',
                                            12,
                                          ) *
                                          1.65,
                                      height: 1.5,
                                    ),
                                  ),
                                  const SizedBox(width: 4),
                                  Directionality(
                                    textDirection: ui.TextDirection.ltr,
                                    child: Text(
                                      _formatOfficialDate(_documentDate),
                                      maxLines: 1,
                                      softWrap: false,
                                      style: TextStyle(
                                        color: _documentSettingColor(
                                          'documentFontColor',
                                          Colors.black,
                                        ),
                                        fontFamily: _documentSettingFamily(
                                          'documentFontFamily',
                                          'Amiri',
                                        ),
                                        fontWeight: _documentSettingWeight(
                                          'documentFontWeight',
                                          FontWeight.w700,
                                        ),
                                        fontSize:
                                            _documentSettingSize(
                                              'documentFontSizePt',
                                              12,
                                            ) *
                                            1.65,
                                        height: 1.5,
                                        fontFeatures: const [
                                          ui.FontFeature.tabularFigures(),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Center(
                      child: RichText(
                        textDirection: ui.TextDirection.rtl,
                        textAlign: TextAlign.center,
                        text: TextSpan(
                          style: TextStyle(
                            color: _documentSettingColor(
                              'recipientFontColor',
                              Colors.black,
                            ),
                            fontFamily: _documentSettingFamily(
                              'recipientFontFamily',
                              'Amiri',
                            ),
                          ),
                          children: [
                            TextSpan(
                              text:
                                  '${_recipientLabelController.text.trim().isEmpty ? defaultDocumentRecipientLabel : _recipientLabelController.text.trim()}: ',
                              style: TextStyle(
                                fontSize:
                                    _documentSettingSize(
                                      'recipientFontSizePt',
                                      16,
                                    ) +
                                    2,
                                fontWeight: _documentSettingWeight(
                                  'recipientFontWeight',
                                  FontWeight.w600,
                                ),
                                height: 1.5,
                              ),
                            ),
                            TextSpan(
                              text: _recipientValueController.text,
                              style: TextStyle(
                                fontSize: _documentSettingSize(
                                  'recipientFontSizePt',
                                  12,
                                ),
                                fontWeight: _documentSettingWeight(
                                  'recipientFontWeight',
                                  FontWeight.w600,
                                ),
                                height: 1.8,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    child: Text(
                      _subjectController.text.isEmpty
                          ? 'الموضوع: —'
                          : 'الموضوع: ${_subjectController.text}',
                      style: TextStyle(
                        color: _documentSettingColor(
                          'documentFontColor',
                          Colors.black,
                        ),
                        fontFamily: _documentSettingFamily(
                          'documentFontFamily',
                          'Amiri',
                        ),
                        fontWeight: _documentSettingWeight(
                          'documentFontWeight',
                          FontWeight.w600,
                        ),
                        fontSize: _documentSettingSize('documentFontSizePt', 12),
                      ),
                    ),
                  ),
                  Container(
                    constraints: BoxConstraints(
                      minHeight: math.max(96, pageHeight - 350),
                    ),
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 20),
                    child: DefaultTextStyle(
                      style: TextStyle(
                        fontFamily: _documentSettingFamily(
                          'documentFontFamily',
                          'Amiri',
                        ),
                        color: _documentSettingColor(
                          'documentFontColor',
                          Colors.black,
                        ),
                        fontSize: _documentSettingSize(
                          'documentFontSizePt',
                          12,
                        ),
                        fontWeight: _documentSettingWeight(
                          'documentFontWeight',
                          FontWeight.w400,
                        ),
                      ),
                      child: QuillEditor.basic(
                        controller: controller,
                        config: const QuillEditorConfig(
                          padding: EdgeInsets.zero,
                        ),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (headerTitle.isNotEmpty)
                            Text(
                              headerTitle,
                              textAlign: TextAlign.center,
                              maxLines: 1,
                              softWrap: false,
                              style: TextStyle(
                                color: _documentSettingColor(
                                  'documentFontColor',
                                  Colors.black,
                                ),
                                fontFamily: _documentSettingFamily(
                                  'documentFontFamily',
                                  'Amiri',
                                ),
                                fontWeight: _documentSettingWeight(
                                  'documentFontWeight',
                                  FontWeight.w700,
                                ),
                                fontSize:
                                    _documentSettingSize(
                                      'documentFontSizePt',
                                      12,
                                    ) *
                                    1.4,
                                height: 1.4,
                              ),
                            ),
                          if (headerSubtitle.isNotEmpty)
                            Text(
                              headerSubtitle.startsWith('رئيس')
                                  ? headerSubtitle
                                  : 'رئيس $headerSubtitle',
                              textAlign: TextAlign.center,
                              maxLines: 1,
                              softWrap: false,
                              style: TextStyle(
                                color: _documentSettingColor(
                                  'documentFontColor',
                                  Colors.black,
                                ),
                                fontFamily: _documentSettingFamily(
                                  'documentFontFamily',
                                  'Amiri',
                                ),
                                fontWeight: _documentSettingWeight(
                                  'documentFontWeight',
                                  FontWeight.w700,
                                ),
                                fontSize:
                                    _documentSettingSize(
                                      'documentFontSizePt',
                                      12,
                                    ) *
                                    1.3,
                                height: 1.4,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 4, 16, 12),
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: Text(
                        'وثائقي',
                        textAlign: TextAlign.right,
                        style: TextStyle(color: Colors.black54, fontSize: 11),
                      ),
                    ),
                  ),
                ],
              ),
            );
            return FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.topCenter,
              child: paper,
            );
          },
        ),
      ],
    );
  }

  String _formatOfficialDate(DateTime value) {
    final pattern =
        _platformDocumentSettings['documentDateFormat']?.toString() ??
        'yyyy/MM/dd';
    final localDate = value.toLocal();
    const arabicMonths = [
      'يناير',
      'فبراير',
      'مارس',
      'أبريل',
      'مايو',
      'يونيو',
      'يوليو',
      'أغسطس',
      'سبتمبر',
      'أكتوبر',
      'نوفمبر',
      'ديسمبر',
    ];
    if (pattern == 'd MMMM yyyy') {
      return '${localDate.day} ${arabicMonths[localDate.month - 1]} ${localDate.year}';
    }
    if (pattern == 'MMMM d, yyyy') {
      return '${arabicMonths[localDate.month - 1]} ${localDate.day}, ${localDate.year}';
    }
    return DateFormat(pattern, 'en').format(localDate);
  }

  String _documentSettingFamily(String key, String fallback) =>
      _platformDocumentSettings[key]?.toString() ?? fallback;

  double _documentSettingSize(String key, double fallback) {
    final value = _platformDocumentSettings[key];
    return (value is num ? value.toDouble() : fallback)
        .clamp(8.0, 30.0)
        .toDouble();
  }

  FontWeight _documentSettingWeight(String key, FontWeight fallback) {
    final value = _platformDocumentSettings[key];
    final weight = value is num ? value.toInt() : null;
    if (weight == null) return fallback;
    return switch (weight) {
      >= 800 => FontWeight.w800,
      >= 700 => FontWeight.w700,
      >= 600 => FontWeight.w600,
      >= 500 => FontWeight.w500,
      >= 400 => FontWeight.w400,
      _ => fallback,
    };
  }

  Color _documentSettingColor(String key, Color fallback) {
    final value = _platformDocumentSettings[key]
        ?.toString()
        .replaceFirst('#', '');
    final parsed = int.tryParse(value ?? '', radix: 16);
    return parsed == null ? fallback : Color(0xFF000000 | parsed);
  }

  Color _documentHeaderDividerColor() {
    final value = _platformDocumentSettings['headerDividerColor']
        ?.toString()
        .replaceFirst('#', '');
    final parsed = int.tryParse(value ?? '', radix: 16);
    return Color(0xFF000000 | (parsed ?? 0xFFB49A55));
  }

  Widget _statusChip(String status) {
    final label = switch (status) {
      'issued' => 'صادرة',
      'archived' => 'مؤرشفة',
      _ => 'مسودة',
    };
    final color = switch (status) {
      'issued' => context.appSuccess,
      'archived' => Theme.of(context).colorScheme.onSurfaceVariant,
      _ => Theme.of(context).colorScheme.primary,
    };
    return Chip(
      label: Text(label),
      backgroundColor: color.withValues(alpha: 0.12),
      side: BorderSide(color: color.withValues(alpha: 0.35)),
      visualDensity: VisualDensity.compact,
    );
  }

  Widget _emptyState(String message, IconData icon) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(
        children: [
          Icon(icon, size: 44, color: Theme.of(context).disabledColor),
          const SizedBox(height: 10),
          Text(message, style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    );
  }

  String _formatDate(DateTime value) =>
      DateFormat('yyyy/MM/dd').format(value.toLocal());

  @override
  Widget build(BuildContext context) {
    final pendingCountFuture = _outbox.pendingCount();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Align(
            alignment: AlignmentDirectional.centerStart,
            child: Text(
              'أنشئ، نظّم، واطبع. وثائقك وقوالبك وملفاتك في مكان واحد.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ),
        _buildTabSelector(),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(switch (_tab) {
                  DocumentStudioTab.documents => 'إعداد الوثائق الرسمية',
                  DocumentStudioTab.templates => 'النماذج الإدارية',
                  DocumentStudioTab.archive => 'أرشيف الوثائق',
                  DocumentStudioTab.files => 'الملفات الأصلية',
                }, style: Theme.of(context).textTheme.titleMedium),
              ),
              FutureBuilder<int>(
                future: pendingCountFuture,
                builder: (context, snapshot) {
                  final count = snapshot.data ?? 0;
                  return OutlinedButton.icon(
                    onPressed: count == 0 ? null : _syncLocalChanges,
                    icon: const Icon(Icons.sync, size: 18),
                    label: Text('المزامنة ${count > 0 ? '($count)' : ''}'),
                  );
                },
              ),
              if (_isPlatformOwner)
                IconButton(
                  tooltip: 'إعدادات الوثيقة',
                  onPressed: _editDocumentSettings,
                  icon: const Icon(Icons.tune),
                ),
              IconButton(
                tooltip: 'تحديث',
                onPressed: _refresh,
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        Expanded(
          child: Stack(
            children: [
              Offstage(
                offstage: _tab != DocumentStudioTab.files,
                child: DocumentLibraryPage(
                  api: widget.api,
                  embedded: true,
                  onEditDocument: _selectDocument,
                ),
              ),
              Offstage(
                offstage: _tab == DocumentStudioTab.files,
                child: Column(
                  children: [
                    if (_loading)
                      const Expanded(
                        child: Center(child: CircularProgressIndicator()),
                      )
                    else if (_loadError != null &&
                        _documents.isEmpty &&
                        _templates.isEmpty)
                      Expanded(
                        child: Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.cloud_off_outlined, size: 44),
                                const SizedBox(height: 12),
                                Text(
                                  'تعذر تحميل البيانات: $_loadError',
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 12),
                                FilledButton(
                                  onPressed: _refresh,
                                  child: const Text('إعادة المحاولة'),
                                ),
                              ],
                            ),
                          ),
                        ),
                      )
                    else
                      Expanded(
                        child: RefreshIndicator(
                          onRefresh: _refresh,
                          child: ListView(
                            padding: const EdgeInsets.fromLTRB(12, 0, 12, 28),
                            children: [
                              if (_tab == DocumentStudioTab.documents)
                                if (_selectedDocument == null &&
                                    !_creatingDocument) ...[
                                  Align(
                                    alignment: AlignmentDirectional.centerEnd,
                                    child: Wrap(
                                      spacing: 8,
                                      runSpacing: 8,
                                      children: [
                                        FilledButton.icon(
                                          onPressed: _saving
                                              ? null
                                              : _showCreateDocumentOptions,
                                          icon: const Icon(Icons.add),
                                          label: const Text('إنشاء وثيقة'),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  _buildWorkspaceWelcome(),
                                  const SizedBox(height: 12),
                                  _buildDocumentList(archived: false),
                                ] else
                                  _buildDocumentForm()
                              else if (_tab == DocumentStudioTab.templates)
                                _buildTemplateLibrary()
                              else if (_selectedDocument?.status != 'archived')
                                _buildDocumentList(archived: true)
                              else
                                _buildDocumentForm(),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
