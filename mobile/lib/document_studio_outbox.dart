import 'package:uuid/uuid.dart';

import 'api.dart';
import 'document_studio_models.dart';
import 'offline_vault.dart';

class DocumentOutboxSyncResult {
  const DocumentOutboxSyncResult({
    required this.synced,
    required this.remaining,
    this.lastError,
  });

  final int synced;
  final int remaining;
  final String? lastError;
}

class DocumentStudioOutbox {
  DocumentStudioOutbox({
    required this.api,
    OfflineVault? vault,
  }) : _vault = vault ?? OfflineVault();

  static const _storageKey = 'document_studio_outbox_v1';
  static const _uuid = Uuid();

  final PoliceApi api;
  final OfflineVault _vault;

  Future<int> pendingCount() async => (await _readQueue()).length;

  Future<List<Map<String, dynamic>>> _readQueue() async {
    final raw = await _vault.readJson(_storageKey);
    if (raw is! List) return [];
    return raw
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: true);
  }

  Future<void> _writeQueue(List<Map<String, dynamic>> queue) =>
      _vault.writeJson(_storageKey, queue);

  bool _isTransient(Object error) {
    if (error is NetworkException) return true;
    if (error is ApiException) {
      return error.statusCode == 408 ||
          error.statusCode == 429 ||
          error.statusCode >= 500;
    }
    return false;
  }

  Future<Map<String, dynamic>> createDocument(
    Map<String, dynamic> input,
  ) => _mutate('documentStudio.createDocument', input);

  Future<Map<String, dynamic>> updateDocument(
    Map<String, dynamic> input,
  ) => _mutate('documentStudio.updateDocument', input);

  Future<Map<String, dynamic>> archiveDocument(
    Map<String, dynamic> input,
  ) => _mutate('documentStudio.archiveDocument', input);

  Future<Map<String, dynamic>> createTemplate(
    Map<String, dynamic> input,
  ) => _mutate('documentStudio.createTemplate', input);

  Future<Map<String, dynamic>> updateTemplate(
    Map<String, dynamic> input,
  ) => _mutate('documentStudio.updateTemplate', input);

  Future<Map<String, dynamic>> deactivateTemplate(
    Map<String, dynamic> input,
  ) => _mutate('documentStudio.deactivateTemplate', input);

  Future<Map<String, dynamic>> issueDocument(
    Map<String, dynamic> input,
  ) async {
    final value = await api.call(
      'documentStudio.issueDocument',
      input: input,
      mutation: true,
    );
    if (value is! Map) {
      throw const FormatException('استجابة إصدار الوثيقة غير صالحة');
    }
    final result = Map<String, dynamic>.from(value);
    await _applyServerResult('documentStudio.issueDocument', input, result);
    return result;
  }

  Future<Map<String, dynamic>> _mutate(
    String procedure,
    Map<String, dynamic> input,
  ) async {
    final shouldQueueFirst =
        (input['id']?.toString().startsWith('local_') ?? false) ||
        (input['templateId']?.toString().startsWith('local_') ?? false);
    if (!shouldQueueFirst) {
      try {
        final value = await api.call(
          procedure,
          input: input,
          mutation: true,
        );
        if (value is! Map) {
          throw const FormatException('استجابة حفظ الوثيقة غير صالحة');
        }
        final result = Map<String, dynamic>.from(value);
        await _applyServerResult(procedure, input, result);
        return result;
      } catch (error) {
        if (!_isTransient(error)) rethrow;
      }
    }
    return _enqueue(procedure, input);
  }

  Future<Map<String, dynamic>> _enqueue(
    String procedure,
    Map<String, dynamic> input,
  ) async {
    final queue = await _readQueue();
    final isCreate =
        procedure == 'documentStudio.createDocument' ||
        procedure == 'documentStudio.createTemplate';
    final localId = isCreate
        ? 'local_${_uuid.v4()}'
        : (input['id']?.toString() ?? '');
    if (localId.isEmpty) throw const NetworkException();

    final entry = <String, dynamic>{
      'procedure': procedure,
      'input': Map<String, dynamic>.from(input),
      'localId': isCreate ? localId : null,
      'queuedAt': DateTime.now().toUtc().toIso8601String(),
    };

    if (procedure == 'documentStudio.updateDocument') {
      final createIndex = queue.lastIndexWhere(
        (item) =>
            item['procedure'] == 'documentStudio.createDocument' &&
            item['localId'] == localId,
      );
      final updateIndex = queue.lastIndexWhere(
        (item) =>
            item['procedure'] == procedure &&
            (item['input'] as Map)['id'] == localId,
      );
      if (createIndex >= 0) {
        final previous = Map<String, dynamic>.from(
          queue[createIndex]['input'] as Map,
        );
        final latest = Map<String, dynamic>.from(input)
          ..remove('id')
          ..remove('expectedUpdatedAt');
        queue[createIndex]['input'] = {...previous, ...latest};
      } else if (updateIndex >= 0) {
        final previous = Map<String, dynamic>.from(
          queue[updateIndex]['input'] as Map,
        );
        queue[updateIndex]['input'] = {
          ...input,
          'expectedUpdatedAt': previous['expectedUpdatedAt'],
        };
      } else {
        queue.add(entry);
      }
    } else if (procedure == 'documentStudio.updateTemplate') {
      final createIndex = queue.lastIndexWhere(
        (item) =>
            item['procedure'] == 'documentStudio.createTemplate' &&
            item['localId'] == localId,
      );
      final updateIndex = queue.lastIndexWhere(
        (item) =>
            item['procedure'] == procedure &&
            (item['input'] as Map)['id'] == localId,
      );
      if (createIndex >= 0) {
        final previous = Map<String, dynamic>.from(
          queue[createIndex]['input'] as Map,
        );
        final latest = Map<String, dynamic>.from(input)
          ..remove('id')
          ..remove('expectedRevision');
        queue[createIndex]['input'] = {...previous, ...latest};
      } else if (updateIndex >= 0) {
        final previous = Map<String, dynamic>.from(
          queue[updateIndex]['input'] as Map,
        );
        queue[updateIndex]['input'] = {
          ...input,
          'expectedRevision': previous['expectedRevision'],
        };
      } else {
        queue.add(entry);
      }
    } else {
      queue.add(entry);
    }

    await _writeQueue(queue);
    final local = await _applyLocalResult(
      procedure,
      input,
      localId,
      DateTime.now().toUtc().toIso8601String(),
    );
    if (local == null) {
      throw const FormatException('تعذر حفظ التغيير محلياً');
    }
    return local;
  }

  Future<Map<String, dynamic>?> _applyLocalResult(
    String procedure,
    Map<String, dynamic> input,
    String localId,
    String now,
  ) async {
    final isDocument = procedure.endsWith('Document');
    final listProcedure = isDocument
        ? 'documentStudio.listDocuments'
        : 'documentStudio.listTemplates';
    final cached = await api.readCachedResponse(listProcedure);
    final values = cached is List
        ? cached
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList()
        : <Map<String, dynamic>>[];
    final index = values.indexWhere((item) => item['id'] == localId);

    if (procedure == 'documentStudio.createDocument') {
      final templatesRaw =
          await api.readCachedResponse('documentStudio.listTemplates');
      final templates = templatesRaw is List
          ? templatesRaw
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList()
          : <Map<String, dynamic>>[];
      Map<String, dynamic>? template;
      for (final item in templates) {
        if (item['id'] == input['templateId']) {
          template = item;
          break;
        }
      }
      final context = await api.readCachedResponse('organizations.context');
      final organizationId =
          context is Map ? context['organizationId']?.toString() : null;
      final local = <String, dynamic>{
        'id': localId,
        'ownerId': 'offline',
        'organizationId': organizationId,
        'templateId': input['templateId'],
        'templateRevision': input['templateRevision'],
        'templateFieldsSnapshot': template?['fields'] ?? const [],
        'title': input['title'],
        'category': input['category'],
        'subject': input['subject'] ?? '',
        'content': input['content'],
        'fieldValues': input['fieldValues'] ?? const {},
        'serialNumber': 0,
        'serialCode': '',
        'documentDate': input['documentDate'] ?? now,
        'status': 'draft',
        'createdAt': now,
        'updatedAt': now,
        'issuedAt': null,
        'archivedAt': null,
      };
      values.removeWhere((item) => item['id'] == localId);
      values.insert(0, local);
      await api.writeCachedResponse(listProcedure, null, values);
      return local;
    }

    if (procedure == 'documentStudio.createTemplate') {
      final local = <String, dynamic>{
        'id': localId,
        'ownerId': 'offline',
        'title': input['title'],
        'description': input['description'],
        'category': input['category'],
        'content': input['content'],
        'fields': input['fields'] ?? const [],
        'revision': 1,
        'isActive': true,
        'createdAt': now,
        'updatedAt': now,
      };
      values.removeWhere((item) => item['id'] == localId);
      values.insert(0, local);
      await api.writeCachedResponse(listProcedure, null, values);
      return local;
    }

    if (index < 0) return null;
    final current = values[index];
    if (procedure == 'documentStudio.updateDocument') {
      values[index] = {
        ...current,
        'title': input['title'] ?? current['title'],
        'category': input['category'] ?? current['category'],
        'subject': input['subject'] ?? current['subject'],
        'content': input['content'] ?? current['content'],
        'fieldValues': input['fieldValues'] ?? current['fieldValues'],
        'documentDate': input['documentDate'] ?? current['documentDate'],
        'templateId': input['templateId'] ?? current['templateId'],
        'templateRevision':
            input['templateRevision'] ?? current['templateRevision'],
        'updatedAt': now,
      };
    } else if (procedure == 'documentStudio.archiveDocument') {
      values[index] = {
        ...current,
        'status': 'archived',
        'archivedAt': now,
        'updatedAt': now,
      };
    } else if (procedure == 'documentStudio.updateTemplate') {
      values[index] = {
        ...current,
        'title': input['title'] ?? current['title'],
        'description': input['description'] ?? current['description'],
        'category': input['category'] ?? current['category'],
        'content': input['content'] ?? current['content'],
        'fields': input['fields'] ?? current['fields'],
        'revision': (current['revision'] as num? ?? 0).toInt() + 1,
        'updatedAt': now,
      };
    } else if (procedure == 'documentStudio.deactivateTemplate') {
      values[index] = {
        ...current,
        'isActive': false,
        'revision': (current['revision'] as num? ?? 0).toInt() + 1,
        'updatedAt': now,
      };
    }
    await api.writeCachedResponse(listProcedure, null, values);
    return values[index];
  }

  Future<void> _applyServerResult(
    String procedure,
    Map<String, dynamic> input,
    Map<String, dynamic> result, {
    String? localId,
  }) async {
    final isDocument = procedure.endsWith('Document');
    final listProcedure = isDocument
        ? 'documentStudio.listDocuments'
        : 'documentStudio.listTemplates';
    final cached = await api.readCachedResponse(listProcedure);
    final values = cached is List
        ? cached
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList()
        : <Map<String, dynamic>>[];
    values.removeWhere(
      (item) =>
          item['id'] == result['id'] ||
          (localId != null && item['id'] == localId),
    );
    values.insert(0, result);
    await api.writeCachedResponse(listProcedure, null, values);
  }

  Future<DocumentOutboxSyncResult> sync() async {
    final queue = await _readQueue();
    if (queue.isEmpty) {
      return const DocumentOutboxSyncResult(synced: 0, remaining: 0);
    }

    var synced = 0;
    String? lastError;
    while (queue.isNotEmpty) {
      final entry = queue.first;
      final procedure = entry['procedure']?.toString() ?? '';
      final input = Map<String, dynamic>.from(entry['input'] as Map);
      try {
        final value = await api.call(
          procedure,
          input: input,
          mutation: true,
          allowOfflineCache: false,
        );
        if (value is! Map) {
          throw const FormatException('استجابة مزامنة الوثيقة غير صالحة');
        }
        final result = Map<String, dynamic>.from(value);
        final localId = entry['localId']?.toString();
        queue.removeAt(0);
        await _applyServerResult(
          procedure,
          input,
          result,
          localId: localId,
        );
        if (localId != null && localId != result['id']) {
          for (final pending in queue) {
            final pendingInput =
                Map<String, dynamic>.from(pending['input'] as Map);
            if (pendingInput['id'] == localId) {
              pendingInput['id'] = result['id'];
              if (pendingInput.containsKey('expectedUpdatedAt')) {
                pendingInput['expectedUpdatedAt'] = result['updatedAt'];
              }
              if (pendingInput.containsKey('expectedRevision')) {
                pendingInput['expectedRevision'] = result['revision'];
              }
            }
            if (pendingInput['templateId'] == localId) {
              pendingInput['templateId'] = result['id'];
              pendingInput['templateRevision'] = result['revision'];
            }
            pending['input'] = pendingInput;
          }
        }
        await _writeQueue(queue);
        synced++;
      } catch (error) {
        lastError = error.toString();
        break;
      }
    }

    await _writeQueue(queue);
    return DocumentOutboxSyncResult(
      synced: synced,
      remaining: queue.length,
      lastError: lastError,
    );
  }
}
