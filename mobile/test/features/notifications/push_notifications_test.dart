import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/features/notifications/push_notifications.dart';

void main() {
  group('legacy Telegram delivery push filtering', () {
    test('rejects incoming Telegram delivery notifications', () {
      expect(
        isLegacyTelegramDeliveryPush({
          'type': 'telegram.incoming',
          'telegramId': '42',
        }),
        isTrue,
      );
    });

    test('rejects outgoing Telegram delivery notifications', () {
      expect(
        isLegacyTelegramDeliveryPush({
          'type': 'telegram.created',
          'telegram_id': 73,
        }),
        isTrue,
      );
    });

    test('does not reject general system notices or app updates', () {
      expect(
        isLegacyTelegramDeliveryPush({
          'type': 'system.notice',
          'title': 'تحديث إعدادات النظام',
        }),
        isFalse,
      );
      expect(
        isLegacyTelegramDeliveryPush({'type': 'app.update'}),
        isFalse,
      );
    });
  });
}
