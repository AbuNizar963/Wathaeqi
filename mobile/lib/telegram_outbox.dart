import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// A read-only view of a queue record created by an older Telegram workflow.
/// The payload is intentionally retained for compatibility and audit, but
/// print-only mode never retries, sends, edits, or deletes these records.
class TelegramOutboxEntry {
  const TelegramOutboxEntry({
    required this.id,
    required this.idempotencyKey,
    required this.payload,
    required this.createdAt,
    this.operation = TelegramOutbox.operationCreate,
    this.attachment,
    this.attempts = 0,
    this.lastError,
  });

  factory TelegramOutboxEntry.fromJson(Map<String, dynamic> json) {
    final operation = '${json['operation'] ?? TelegramOutbox.operationCreate}';
    return TelegramOutboxEntry(
      id: '${json['id'] ?? ''}',
      idempotencyKey: '${json['idempotencyKey'] ?? ''}',
      payload: Map<String, dynamic>.from(json['payload'] as Map? ?? const {}),
      createdAt:
          DateTime.tryParse('${json['createdAt'] ?? ''}') ??
          DateTime.now().toUtc(),
      operation: operation == TelegramOutbox.operationUpdate
          ? TelegramOutbox.operationUpdate
          : TelegramOutbox.operationCreate,
      attachment: json['attachment'] is Map
          ? Map<String, dynamic>.from(json['attachment'] as Map)
          : null,
      attempts: int.tryParse('${json['attempts'] ?? 0}') ?? 0,
      lastError: json['lastError']?.toString(),
    );
  }

  final String id;
  final String idempotencyKey;
  final Map<String, dynamic> payload;
  final DateTime createdAt;
  final String operation;
  final Map<String, dynamic>? attachment;
  final int attempts;
  final String? lastError;

  bool get isUpdate => operation == TelegramOutbox.operationUpdate;

  int? get telegramId => isUpdate ? int.tryParse('${payload['id']}') : null;

  Map<String, dynamic> toJson() => {
    'id': id,
    'idempotencyKey': idempotencyKey,
    'operation': operation,
    'payload': payload,
    'createdAt': createdAt.toUtc().toIso8601String(),
    if (attachment != null) 'attachment': attachment,
    'attempts': attempts,
    if (lastError != null) 'lastError': lastError,
  };
}

class TelegramOutbox {
  TelegramOutbox({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const storageKey = 'telegram_outbox_v1';
  static const operationCreate = 'create';
  static const operationUpdate = 'update';

  final FlutterSecureStorage _storage;

  /// Reads legacy records without changing or deleting their stored bytes.
  Future<List<TelegramOutboxEntry>> list() async {
    final raw = await _storage.read(key: storageKey);
    if (raw == null || raw.trim().isEmpty) return <TelegramOutboxEntry>[];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return <TelegramOutboxEntry>[];
      return decoded
          .whereType<Map>()
          .map(
            (row) =>
                TelegramOutboxEntry.fromJson(Map<String, dynamic>.from(row)),
          )
          .where(
            (entry) => entry.id.isNotEmpty && entry.idempotencyKey.length >= 16,
          )
          .toList();
    } catch (_) {
      return <TelegramOutboxEntry>[];
    }
  }

  Future<int> pendingCount() async => (await list()).length;
}
