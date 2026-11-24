import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

const MethodChannel _androidAppNotificationChannel = MethodChannel(
  'com.hadir.police.police_telegrams/telegram_notifications',
);

bool isLegacyTelegramDeliveryPush(Map<String, dynamic> data) {
  final type = data['type']?.toString() ?? '';
  return type.startsWith('telegram.') ||
      data.containsKey('telegramId') ||
      data.containsKey('telegram_id');
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

class PushNotificationService {
  // Resolve Firebase lazily: DashboardPage can be constructed before Firebase
  // is configured, and initialization errors must not crash the app at startup.
  FirebaseMessaging get _messaging => FirebaseMessaging.instance;

  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;
  void Function()? _onAppUpdate;
  void Function()? _onOpenNotifications;

  Future<void> initialize({
    void Function()? onAppUpdate,
    void Function()? onOpenNotifications,
  }) async {
    _onAppUpdate = onAppUpdate;
    _onOpenNotifications = onOpenNotifications;
    await _prepareAndroidNotificationBridge();
    await _foregroundSubscription?.cancel();
    await _openedSubscription?.cancel();

    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        await _messaging.setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );
      }

      // Only application-update messages remain actionable in the
      // print-only product. Legacy telegram delivery pushes are ignored.
      _foregroundSubscription = FirebaseMessaging.onMessage.listen((message) {
        if (_isAppUpdate(message)) onAppUpdate?.call();
      });
      _openedSubscription = FirebaseMessaging.onMessageOpenedApp.listen((
        message,
      ) {
        if (_isAppUpdate(message)) {
          onAppUpdate?.call();
          return;
        }
        if (!isLegacyTelegramDeliveryPush(message.data)) {
          _onOpenNotifications?.call();
        }
      });
      final initial = await _messaging.getInitialMessage();
      if (initial != null && _isAppUpdate(initial)) {
        onAppUpdate?.call();
        return;
      }
      if (initial != null && !isLegacyTelegramDeliveryPush(initial.data)) {
        _onOpenNotifications?.call();
      }
    } on FirebaseException {
      // Firebase configuration is supplied per Android/iOS environment.
      // The app remains usable when a developer build has no Firebase files.
    }
  }

  Future<void> _prepareAndroidNotificationBridge() async {
    if (defaultTargetPlatform != TargetPlatform.android) return;

    _androidAppNotificationChannel.setMethodCallHandler((call) async {
      if (call.method == 'onAppUpdateNotificationOpened') {
        _onAppUpdate?.call();
      }
    });

    try {
      final pendingUpdate = await _androidAppNotificationChannel
          .invokeMethod<bool>('markAppUpdateNotificationHandlerReady');
      if (pendingUpdate == true) _onAppUpdate?.call();
    } on MissingPluginException {
      // Native notifications are unavailable in widget tests and unsupported
      // preview builds; this must not prevent Firebase from initializing.
    } on PlatformException {
      // A platform-specific notification bridge failure must not block login.
    }
  }

  bool _isAppUpdate(RemoteMessage message) =>
      message.data['type'] == 'app.update';

  Future<void> dispose() async {
    await _foregroundSubscription?.cancel();
    await _openedSubscription?.cancel();
    _foregroundSubscription = null;
    _openedSubscription = null;
    _onAppUpdate = null;
    _onOpenNotifications = null;

    if (defaultTargetPlatform == TargetPlatform.android) {
      _androidAppNotificationChannel.setMethodCallHandler(null);
      try {
        await _androidAppNotificationChannel.invokeMethod<void>(
          'markAppUpdateNotificationHandlerNotReady',
        );
      } on MissingPluginException {
        // No native bridge is expected in widget tests or preview builds.
      } on PlatformException {
        // Logging out must remain possible if the bridge is unavailable.
      }
    }
  }
}
