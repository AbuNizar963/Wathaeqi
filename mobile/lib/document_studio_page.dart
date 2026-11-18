import 'dart:async';

import 'dart:ui' show TextDirection;

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:intl/intl.dart';

import 'api.dart';
import 'document_studio_models.dart';
import 'document_studio_outbox.dart';
import 'document_studio_quill_codec.dart';

enum DocumentStudioTab { documents, templates, archive }

class DocumentStudioPage extends StatefulWidget {
  const DocumentStudioPage({
    super.key,
    required this.api,
    this.outbox,
    this.initialTab = DocumentStudioTab.documents,
  });

  final PoliceApi api;
  final DocumentStudioOutbox? outbox;
  final DocumentStudioTab initialTab;

  @override
  State<DocumentStudioPage> createState() => _DocumentStudioPageState();
}

class _DocumentStudioPageState extends State<DocumentStudioPage> {
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
  String? _loadError;
  bool _canIssueDocuments = false;
  Map<String, dynamic> _letterhead = {};

  final _titleController = TextEditingController();
  final _subjectController = TextEditingController();
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
  final Map<String, TextEditingController> _fieldControllers = {};
  bool _templateContentDirty = false;
  bool _creatingTemplate = false;
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
    _load();
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
      } catch (_) {
        documentsRaw = await widget.api.readCachedResponse(
          'documentStudio.listDocuments',
        );
      }
      try {
        templatesRaw = await widget.api.call('documentStudio.listTemplates');
      } catch (_) {
        templatesRaw = await widget.api.readCachedResponse(
          'documentStudio.listTemplates',
        );
      }
      try {
        contextRaw = await widget.api.call('organizations.context');
      } catch (_) {
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
              ? null
              : {'organizationId': organizationId},
        );
        if (rawLetterhead is Map) {
          letterhead = Map<String, dynamic>.from(rawLetterhead);
        }
      } catch (_) {
        // The editor remains usable with the cached or minimal letterhead.
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
        _canIssueDocuments =
            context['isOwner'] == true ||
            const [
              'system_admin',
              'organization_admin',
            ].contains(context['role']?.toString());
        _letterhead = letterhead;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = error.toString();
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
    _documentContent = content;
    _documentEditor = _makeEditor(content);
    _documentEditor.addListener(_onDocumentEditorChanged);
    setState(() {});
  }

  void _replaceTemplateEditor(Map<String, dynamic> content) {
    _templateEditor.removeListener(_onTemplateEditorChanged);
    _templateEditor.dispose();
    _templateContent = content;
    _templateContentDirty = false;
    _templateEditor = _makeEditor(content);
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
      _fieldControllers[field.key] = TextEditingController(
        text: values[field.key] ?? field.defaultValue ?? '',
      );
    }
    _fieldValues = {
      for (final field in fields)
        field.key: values[field.key] ?? field.defaultValue ?? '',
    };
  }

  void _startNewDocument() {
    _selectedDocument = null;
    _selectedTemplateId = null;
    _selectedTemplateRevision = null;
    _documentCategory = 'general';
    _documentDate = DateTime.now();
    _titleController.clear();
    _subjectController.clear();
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
    _selectedDocument = document;
    _selectedTemplateId = document.templateId;
    _selectedTemplateRevision = document.templateRevision;
    _documentCategory = document.category;
    _documentDate = document.documentDate;
    _titleController.text = document.title;
    _subjectController.text = document.subject;
    _templateBaseContent = document.content;
    _resetFieldControllers(
      document.templateFieldsSnapshot,
      document.fieldValues,
    );
    _replaceDocumentEditor(document.content);
    setState(
      () => _tab = document.status == 'archived'
          ? DocumentStudioTab.archive
          : DocumentStudioTab.documents,
    );
  }

  void _useTemplate(DocumentTemplate template) {
    _selectedDocument = null;
    _selectedTemplate = template;
    _selectedTemplateId = template.id;
    _selectedTemplateRevision = template.revision;
    _documentCategory = template.category;
    _documentDate = DateTime.now();
    _titleController.text = template.title;
    _subjectController.clear();
    _templateBaseContent = template.content;
    _resetFieldControllers(template.fields, {});
    _replaceDocumentEditor(template.content);
    setState(() => _tab = DocumentStudioTab.documents);
  }

  Future<void> _saveDocument() async {
    if (_titleController.text.trim().isEmpty) {
      _showMessage('أدخل عنوان الوثيقة أولاً');
      return;
    }
    setState(() => _saving = true);
    final content = _applyFieldValues(_documentContent, _fieldValues);
    final input = <String, dynamic>{
      'title': _titleController.text.trim(),
      'category': _documentCategory,
      'subject': _subjectController.text.trim(),
      'content': content,
      'fieldValues': _fieldValues,
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
              'expectedUpdatedAt': _selectedDocument!.updatedAt,
            });
      if (!mounted) return;
      _selectedDocument = OfficialDocument.fromJson(saved);
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
        title: const Text('إصدار الوثيقة'),
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
        'expectedUpdatedAt': document.updatedAt,
      });
      _selectedDocument = OfficialDocument.fromJson(saved);
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
        title: const Text('أرشفة الوثيقة'),
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
        'expectedUpdatedAt': document.updatedAt,
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
          : (_selectedTemplate?.content ?? _templateContent),
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
        title: const Text('إيقاف النموذج'),
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
  ) {
    dynamic visit(dynamic value) {
      if (value is List) return value.map(visit).toList();
      if (value is! Map) return value;
      final node = Map<String, dynamic>.from(value);
      if (node['type'] == 'text' && node['text'] is String) {
        var text = node['text'] as String;
        for (final entry in values.entries) {
          text = text.replaceAll('{{${entry.key}}}', entry.value);
        }
        node['text'] = text;
        return node;
      }
      return node.map((key, child) => MapEntry(key, visit(child)));
    }

    return Map<String, dynamic>.from(visit(content) as Map);
  }

  Widget _buildTabSelector() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: SegmentedButton<DocumentStudioTab>(
        segments: const [
          ButtonSegment(
            value: DocumentStudioTab.documents,
            label: Text('الوثائق'),
            icon: Icon(Icons.description_outlined),
          ),
          ButtonSegment(
            value: DocumentStudioTab.templates,
            label: Text('القوالب'),
            icon: Icon(Icons.dashboard_customize_outlined),
          ),
          ButtonSegment(
            value: DocumentStudioTab.archive,
            label: Text('الأرشيف'),
            icon: Icon(Icons.archive_outlined),
          ),
        ],
        selected: {_tab},
        onSelectionChanged: (selection) {
          setState(() {
            _tab = selection.first;
            if (_tab == DocumentStudioTab.archive) {
              _selectedDocument = null;
            }
          });
        },
      ),
    );
  }

  Widget _buildDocumentList({required bool archived}) {
    final items = _documents
        .where(
          (document) =>
              document.status == (archived ? 'archived' : 'draft') ||
              (!archived && document.status == 'issued'),
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
              onPressed: () => setState(() => _selectedDocument = null),
              icon: const Icon(Icons.arrow_back),
            ),
            Expanded(
              child: Text(
                _selectedDocument == null ? 'وثيقة جديدة' : 'تحرير الوثيقة',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            if (_selectedDocument != null)
              _statusChip(_selectedDocument!.status),
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
                      TextButton(
                        onPressed: canEdit
                            ? () {
                                final filled = _applyFieldValues(
                                  _templateBaseContent,
                                  _fieldValues,
                                );
                                _replaceDocumentEditor(filled);
                              }
                            : null,
                        child: const Text('تطبيق في النص'),
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
        _buildA4Editor(controller: _documentEditor, editable: canEdit),
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
                  value: option.value,
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
            border: const OutlineInputBorder(),
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
          border: const OutlineInputBorder(),
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
    final optionsText = field.options
        .map((option) => option.label)
        .join(', ');
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          children: [
            TextFormField(
              key: ValueKey('field-label-${field.key}'),
              initialValue: field.label,
              decoration: const InputDecoration(
                labelText: 'اسم الحقل',
                border: OutlineInputBorder(),
              ),
              onChanged: (value) => _updateTemplateField(index, label: value),
            ),
            const SizedBox(height: 8),
            TextFormField(
              key: ValueKey('field-key-${field.key}'),
              initialValue: field.key,
              textDirection: TextDirection.ltr,
              decoration: const InputDecoration(
                labelText: 'المفتاح البرمجي',
                hintText: 'employee_name',
                border: OutlineInputBorder(),
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
                key: ValueKey('field-options-${field.key}'),
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

  Widget _buildA4Editor({
    required QuillController controller,
    required bool editable,
  }) {
    controller.readOnly = !editable;
    return Card(
      clipBehavior: Clip.antiAlias,
      color: Colors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (editable)
            QuillSimpleToolbar(
              controller: controller,
              config: const QuillSimpleToolbarConfig(),
            ),
          Container(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(
                bottom: BorderSide(color: Colors.blueGrey.shade100),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                if (_letterhead['logoUrl'] is String &&
                    (_letterhead['logoUrl'] as String).isNotEmpty)
                  Image.network(
                    _letterhead['logoUrl'] as String,
                    width: 52,
                    height: 52,
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) =>
                        const SizedBox(width: 52, height: 52),
                  ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _letterhead['departmentName']?.toString() ?? 'وثائقي',
                        style: const TextStyle(
                          color: Colors.black,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      if ((_letterhead['unitName']?.toString() ?? '')
                          .isNotEmpty)
                        Text(
                          _letterhead['unitName'].toString(),
                          style: const TextStyle(color: Colors.black87),
                        ),
                    ],
                  ),
                ),
                if ((_letterhead['unitChiefName']?.toString() ?? '').isNotEmpty)
                  Column(
                    children: [
                      Text(
                        _letterhead['unitChiefRank']?.toString() ?? '',
                        style: const TextStyle(color: Colors.black87),
                      ),
                      Text(
                        _letterhead['unitChiefName'].toString(),
                        style: const TextStyle(
                          color: Colors.black,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'الرقم: ${_selectedDocument?.serialCode.isNotEmpty == true ? _selectedDocument!.serialCode : 'يخصص عند الإصدار'}',
                  style: const TextStyle(color: Colors.black87, fontSize: 12),
                ),
                Text(
                  'التاريخ: ${DateFormat('yyyy/MM/dd').format(_documentDate)}',
                  style: const TextStyle(color: Colors.black87, fontSize: 12),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text(
              _subjectController.text.isEmpty
                  ? 'الموضوع: —'
                  : 'الموضوع: ${_subjectController.text}',
              style: const TextStyle(
                color: Colors.black,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Container(
            constraints: const BoxConstraints(minHeight: 420),
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 20),
            color: Colors.white,
            child: QuillEditor.basic(
              controller: controller,
              config: const QuillEditorConfig(padding: EdgeInsets.zero),
            ),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 20),
            child: Text(
              'وثائقي',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.black54, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }

  Widget _statusChip(String status) {
    final label = switch (status) {
      'issued' => 'صادرة',
      'archived' => 'مؤرشفة',
      _ => 'مسودة',
    };
    final color = switch (status) {
      'issued' => Colors.green,
      'archived' => Colors.blueGrey,
      _ => Colors.orange,
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
              IconButton(
                tooltip: 'تحديث',
                onPressed: _refresh,
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        if (_loading)
          const Expanded(child: Center(child: CircularProgressIndicator()))
        else if (_loadError != null && _documents.isEmpty && _templates.isEmpty)
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
                    if (_selectedDocument == null) ...[
                      Align(
                        alignment: AlignmentDirectional.centerEnd,
                        child: FilledButton.icon(
                          onPressed: _startNewDocument,
                          icon: const Icon(Icons.add),
                          label: const Text('وثيقة جديدة'),
                        ),
                      ),
                      const SizedBox(height: 10),
                      _buildDocumentList(archived: false),
                    ] else
                      _buildDocumentForm()
                  else if (_tab == DocumentStudioTab.templates)
                    _buildTemplateLibrary()
                  else if (_selectedDocument == null)
                    _buildDocumentList(archived: true)
                  else
                    _buildDocumentForm(),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
