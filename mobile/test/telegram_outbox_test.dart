import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/telegram_outbox.dart';

void main() {
  test('reads legacy create records without changing their payload', () {
    final createdAt = DateTime.utc(2026, 10, 17, 2, 0);
    final entry = TelegramOutboxEntry.fromJson({
      'id': 'local-1',
      'idempotencyKey': 'mobile-offline-1234567890',
      'operation': TelegramOutbox.operationCreate,
      'payload': {
        'subject': 'بلاغ',
        'body': 'نص البرقية',
        'requestedOrganizationSerialNumber': 18,
      },
      'createdAt': createdAt.toIso8601String(),
      'attempts': 2,
      'lastError': 'تعذر الاتصال بالخادم',
    });

    expect(entry.id, 'local-1');
    expect(entry.idempotencyKey, 'mobile-offline-1234567890');
    expect(entry.payload['body'], 'نص البرقية');
    expect(entry.createdAt, createdAt);
    expect(entry.attempts, 2);
    expect(entry.lastError, 'تعذر الاتصال بالخادم');
    expect(entry.toJson()['payload'], entry.payload);
  });

  test('reads legacy update records and retains attachment metadata', () {
    final entry = TelegramOutboxEntry.fromJson({
      'id': 'local-2',
      'idempotencyKey': 'mobile-offline-abcdefgh',
      'operation': TelegramOutbox.operationUpdate,
      'payload': {'id': 42, 'subject': 'موضوع معدل'},
      'createdAt': '2026-10-17T00:00:00.000Z',
      'attachment': {
        'fileName': 'محضر.pdf',
        'contentType': 'application/pdf',
        'vaultRef': 'outbox_attachment_local-2',
      },
    });

    expect(entry.isUpdate, isTrue);
    expect(entry.telegramId, 42);
    expect(entry.payload['subject'], 'موضوع معدل');
    expect(entry.attachment?['vaultRef'], 'outbox_attachment_local-2');
    expect(entry.toJson()['attachment'], entry.attachment);
  });
}
