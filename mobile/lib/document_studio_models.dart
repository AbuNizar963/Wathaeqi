/// Document Studio domain models shared conceptually with the web contract.
///
/// Templates are reusable definitions. Official documents retain a snapshot
/// of the template revision and entered values. Server authorization remains
/// authoritative for owner scope and every persisted operation.
library;

const _legacyStarterDraftHtml =
    '<h2>بسم الله الرحمن الرحيم</h2><p>العدد: ....................</p><p>التاريخ: .... / .... / ........</p><p><strong>إلى /</strong> ................................................</p><p><strong>الموضوع /</strong> ............................................</p><p>تحية طيبة...</p><p>يرجى التفضل بالاطلاع واتخاذ ما يلزم بشأن الموضوع أعلاه، مع التقدير.</p><p>وتفضلوا بقبول فائق الاحترام.</p><p><strong>التوقيع:</strong> ............................</p>';

enum DocumentTemplateFieldType {
  text,
  multiline,
  date,
  number,
  select;

  static DocumentTemplateFieldType fromWire(String? value) =>
      DocumentTemplateFieldType.values.firstWhere(
        (item) => item.name == value,
        orElse: () => DocumentTemplateFieldType.text,
      );
}

class DocumentTemplateFieldOption {
  const DocumentTemplateFieldOption({required this.value, required this.label});

  final String value;
  final String label;

  factory DocumentTemplateFieldOption.fromJson(Map<String, dynamic> json) =>
      DocumentTemplateFieldOption(
        value: json['value'] as String? ?? '',
        label: json['label'] as String? ?? '',
      );

  Map<String, dynamic> toJson() => {'value': value, 'label': label};
}

class DocumentTemplateField {
  const DocumentTemplateField({
    required this.key,
    required this.label,
    required this.type,
    required this.required,
    this.maxLength,
    this.options = const [],
    this.defaultValue,
  });

  final String key;
  final String label;
  final DocumentTemplateFieldType type;
  final bool required;
  final int? maxLength;
  final List<DocumentTemplateFieldOption> options;
  final String? defaultValue;

  factory DocumentTemplateField.fromJson(Map<String, dynamic> json) =>
      DocumentTemplateField(
        key: json['key'] as String? ?? '',
        label: json['label'] as String? ?? '',
        type: DocumentTemplateFieldType.fromWire(json['type'] as String?),
        required: json['required'] == true,
        maxLength: (json['maxLength'] as num?)?.toInt(),
        options: (json['options'] as List<dynamic>? ?? const [])
            .whereType<Map>()
            .map(
              (item) => DocumentTemplateFieldOption.fromJson(
                Map<String, dynamic>.from(item),
              ),
            )
            .toList(growable: false),
        defaultValue: json['defaultValue'] as String?,
      );

  Map<String, dynamic> toJson() => {
    'key': key,
    'label': label,
    'type': type.name,
    'required': required,
    if (maxLength != null) 'maxLength': maxLength,
    if (options.isNotEmpty)
      'options': options.map((item) => item.toJson()).toList(),
    if (defaultValue != null) 'defaultValue': defaultValue,
  };
}

class DocumentTemplate {
  const DocumentTemplate({
    required this.id,
    required this.ownerId,
    required this.title,
    required this.category,
    required this.content,
    required this.fields,
    required this.revision,
    required this.isActive,
    required this.createdAt,
    required this.updatedAt,
    this.description,
  });

  final String id;
  final String ownerId;
  final String title;
  final String? description;
  final String category;

  /// TipTap JSON on the web. Flutter treats it as a structured payload.
  final Map<String, dynamic> content;
  final List<DocumentTemplateField> fields;
  final int revision;
  final bool isActive;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory DocumentTemplate.fromJson(Map<String, dynamic> json) =>
      DocumentTemplate(
        id: json['id'] as String? ?? '',
        ownerId: json['ownerId'] as String? ?? '',
        title: json['title'] as String? ?? '',
        description: json['description'] as String?,
        category: json['category'] as String? ?? 'general',
        content: Map<String, dynamic>.from(json['content'] as Map? ?? const {}),
        fields: (json['fields'] as List<dynamic>? ?? const [])
            .whereType<Map>()
            .map(
              (item) => DocumentTemplateField.fromJson(
                Map<String, dynamic>.from(item),
              ),
            )
            .toList(growable: false),
        revision: (json['revision'] as num?)?.toInt() ?? 1,
        isActive: json['isActive'] != false,
        createdAt:
            DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
        updatedAt:
            DateTime.tryParse(json['updatedAt'] as String? ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'ownerId': ownerId,
    'title': title,
    if (description != null) 'description': description,
    'category': category,
    'content': content,
    'fields': fields.map((item) => item.toJson()).toList(),
    'revision': revision,
    'isActive': isActive,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'updatedAt': updatedAt.toUtc().toIso8601String(),
  };
}

class OfficialDocument {
  const OfficialDocument({
    required this.id,
    required this.ownerId,
    required this.title,
    required this.category,
    required this.subject,
    required this.content,
    required this.fieldValues,
    required this.serialNumber,
    required this.serialCode,
    required this.documentDate,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.organizationId,
    this.templateId,
    this.templateRevision,
    this.templateFieldsSnapshot = const [],
    this.file,
    this.issuedAt,
    this.archivedAt,
  });

  final String id;
  final String ownerId;
  final String? organizationId;
  final String? templateId;
  final int? templateRevision;
  final List<DocumentTemplateField> templateFieldsSnapshot;
  final UploadedDocumentFile? file;
  final String title;
  final String category;
  final String subject;
  final Map<String, dynamic> content;
  final Map<String, String> fieldValues;
  final int serialNumber;
  final String serialCode;
  final DateTime documentDate;
  final String status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? issuedAt;
  final DateTime? archivedAt;

  /// Identifies a legacy sample draft provisioned before the user workspace
  /// was made personal. It stays in storage but is excluded from user lists.
  bool get isLegacyStarterDraft =>
      title == 'كتاب رسمي جديد' &&
      category == 'مسودة' &&
      status == 'draft' &&
      serialNumber == 0 &&
      serialCode.isEmpty &&
      file == null &&
      templateId == null &&
      templateRevision == null &&
      content['type'] == 'legacy-html' &&
      content['html'] == _legacyStarterDraftHtml;

  /// The API requires an ISO-8601 UTC string for optimistic concurrency.
  String get expectedUpdatedAt => updatedAt.toUtc().toIso8601String();

  factory OfficialDocument.fromJson(Map<String, dynamic> json) =>
      OfficialDocument(
        id: json['id'] as String? ?? '',
        ownerId: json['ownerId'] as String? ?? '',
        organizationId: json['organizationId'] as String?,
        templateId: json['templateId'] as String?,
        templateRevision: (json['templateRevision'] as num?)?.toInt(),
        templateFieldsSnapshot:
            (json['templateFieldsSnapshot'] as List<dynamic>? ?? const [])
                .whereType<Map>()
                .map(
                  (item) => DocumentTemplateField.fromJson(
                    Map<String, dynamic>.from(item),
                  ),
                )
                .toList(growable: false),
        file: json['file'] is Map
            ? UploadedDocumentFile.fromJson(
                Map<String, dynamic>.from(json['file'] as Map),
              )
            : null,
        title: json['title'] as String? ?? '',
        category: json['category'] as String? ?? 'general',
        subject: json['subject'] as String? ?? '',
        content: Map<String, dynamic>.from(json['content'] as Map? ?? const {}),
        fieldValues: (json['fieldValues'] as Map? ?? const {}).map(
          (key, value) => MapEntry('$key', '$value'),
        ),
        serialNumber: (json['serialNumber'] as num?)?.toInt() ?? 0,
        serialCode: json['serialCode'] as String? ?? '',
        documentDate:
            DateTime.tryParse(json['documentDate'] as String? ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
        status: json['status'] as String? ?? 'draft',
        createdAt:
            DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
        updatedAt:
            DateTime.tryParse(json['updatedAt'] as String? ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
        issuedAt: DateTime.tryParse(json['issuedAt'] as String? ?? ''),
        archivedAt: DateTime.tryParse(json['archivedAt'] as String? ?? ''),
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'ownerId': ownerId,
    if (organizationId != null) 'organizationId': organizationId,
    if (templateId != null) 'templateId': templateId,
    if (templateRevision != null) 'templateRevision': templateRevision,
    if (templateFieldsSnapshot.isNotEmpty)
      'templateFieldsSnapshot': templateFieldsSnapshot
          .map((item) => item.toJson())
          .toList(),
    if (file != null) 'file': file!.toJson(),
    'title': title,
    'category': category,
    'subject': subject,
    'content': content,
    'fieldValues': fieldValues,
    'serialNumber': serialNumber,
    'serialCode': serialCode,
    'documentDate': documentDate.toUtc().toIso8601String(),
    'status': status,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'updatedAt': updatedAt.toUtc().toIso8601String(),
    if (issuedAt != null) 'issuedAt': issuedAt!.toUtc().toIso8601String(),
    if (archivedAt != null) 'archivedAt': archivedAt!.toUtc().toIso8601String(),
  };
}

/// Public metadata for an uploaded document file.
///
/// Storage keys and signed URLs are deliberately not represented here, so
/// serializing a document for the offline cache cannot persist either value.
class UploadedDocumentFile {
  const UploadedDocumentFile({
    required this.fileName,
    required this.mimeType,
    required this.sizeBytes,
    required this.pageCount,
  });

  final String fileName;
  final String mimeType;
  final int sizeBytes;
  final int pageCount;

  factory UploadedDocumentFile.fromJson(Map<String, dynamic> json) =>
      UploadedDocumentFile(
        fileName: json['fileName'] as String? ?? '',
        mimeType: json['mimeType'] as String? ?? '',
        sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
        pageCount: (json['pageCount'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toJson() => {
    'fileName': fileName,
    'mimeType': mimeType,
    'sizeBytes': sizeBytes,
    'pageCount': pageCount,
  };
}
