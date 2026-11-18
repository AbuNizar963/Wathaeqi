/// Document Studio domain models shared conceptually with the web contract.
///
/// Templates are reusable definitions. Official documents retain a snapshot
/// of the template revision and entered values. Server authorization remains
/// authoritative for organization scope and every persisted operation.
library;

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
    required this.organizationId,
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
  final String organizationId;
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
        organizationId: json['organizationId'] as String? ?? '',
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
    'organizationId': organizationId,
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
    required this.organizationId,
    required this.title,
    required this.subject,
    required this.content,
    required this.fieldValues,
    required this.serialNumber,
    required this.serialCode,
    required this.documentDate,
    required this.status,
    required this.createdByUserId,
    required this.createdAt,
    required this.updatedAt,
    this.templateId,
    this.templateRevision,
    this.issuedAt,
    this.archivedAt,
  });

  final String id;
  final String organizationId;
  final String? templateId;
  final int? templateRevision;
  final String title;
  final String subject;
  final Map<String, dynamic> content;
  final Map<String, String> fieldValues;
  final int serialNumber;
  final String serialCode;
  final DateTime documentDate;
  final String status;
  final int createdByUserId;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? issuedAt;
  final DateTime? archivedAt;

  factory OfficialDocument.fromJson(Map<String, dynamic> json) =>
      OfficialDocument(
        id: json['id'] as String? ?? '',
        organizationId: json['organizationId'] as String? ?? '',
        templateId: json['templateId'] as String?,
        templateRevision: (json['templateRevision'] as num?)?.toInt(),
        title: json['title'] as String? ?? '',
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
        createdByUserId: (json['createdByUserId'] as num?)?.toInt() ?? 0,
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
    'organizationId': organizationId,
    if (templateId != null) 'templateId': templateId,
    if (templateRevision != null) 'templateRevision': templateRevision,
    'title': title,
    'subject': subject,
    'content': content,
    'fieldValues': fieldValues,
    'serialNumber': serialNumber,
    'serialCode': serialCode,
    'documentDate': documentDate.toUtc().toIso8601String(),
    'status': status,
    'createdByUserId': createdByUserId,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'updatedAt': updatedAt.toUtc().toIso8601String(),
    if (issuedAt != null) 'issuedAt': issuedAt!.toUtc().toIso8601String(),
    if (archivedAt != null) 'archivedAt': archivedAt!.toUtc().toIso8601String(),
  };
}
