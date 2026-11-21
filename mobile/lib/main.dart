import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_quill/flutter_quill.dart'
    show FlutterQuillLocalizations;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import './features/auth_session/app_lock.dart';

import 'api.dart';
import 'document_studio_page.dart';
import 'document_library_page.dart';
import 'document_studio_outbox.dart';
import 'app_theme.dart';
import 'advanced_create_telegram_page.dart';
import 'app_update_page.dart';
import 'app_update_service.dart';
import './features/admin/mobile_access_policy.dart';
import 'mobile_pages.dart';
import './features/admin/native_operations_page.dart';
import './features/admin/native_owner_dashboard_page.dart';
import './features/organizations/native_organization_management_page.dart';
import './features/organizations/organization_logo_resolution.dart';
import './features/users/native_user_management_page.dart';
import './features/platform_settings/platform_document_settings_page.dart';

import 'package:police_telegrams/features/telegrams/documents/official_telegram_document.dart';

import './features/notifications/push_notifications.dart';
import 'public_pages.dart';
import 'telegram_display.dart';
import 'telegram_actions.dart';
import 'telegram_routes.dart';
import './features/reports/telegram_report_labels.dart';
import 'telegram_edit_dialog.dart';
import 'telegram_outbox.dart';
import 'telegram_outbox_page.dart';
import './features/notifications/toast.dart';

const navy = AppPalette.navy;
const brandBlue = AppPalette.brandBlue;
const canvas = AppPalette.canvas;

void main() {
  PoliceTelegramsApp.restoreThemeMode();
  runApp(const PoliceTelegramsApp());
}

class PoliceTelegramsApp extends StatelessWidget {
  const PoliceTelegramsApp({super.key, this.api});

  static final ValueNotifier<ThemeMode> _themeMode = ValueNotifier<ThemeMode>(
    ThemeMode.system,
  );
  static const _preferences = FlutterSecureStorage();

  static Future<void> restoreThemeMode() async {
    try {
      final saved = await _preferences.read(key: 'mobile_theme_mode');
      _themeMode.value = switch (saved) {
        'dark' => ThemeMode.dark,
        'light' => ThemeMode.light,
        _ => ThemeMode.system,
      };
    } catch (_) {
      // A preference read failure should not prevent the app from starting.
    }
  }

  static Future<void> toggleTheme() async {
    final currentBrightness = switch (_themeMode.value) {
      ThemeMode.dark => Brightness.dark,
      ThemeMode.light => Brightness.light,
      ThemeMode.system =>
        WidgetsBinding.instance.platformDispatcher.platformBrightness,
    };
    final next = currentBrightness == Brightness.dark
        ? ThemeMode.light
        : ThemeMode.dark;
    _themeMode.value = next;
    try {
      await _preferences.write(
        key: 'mobile_theme_mode',
        value: next == ThemeMode.dark ? 'dark' : 'light',
      );
    } catch (_) {
      // Keep the selected theme for this session if storage is unavailable.
    }
  }

  static ThemeMode get themeMode => _themeMode.value;

  static Future<void> setThemeMode(ThemeMode mode) async {
    _themeMode.value = mode;
    final storedValue = switch (mode) {
      ThemeMode.dark => 'dark',
      ThemeMode.light => 'light',
      ThemeMode.system => 'system',
    };
    try {
      await _preferences.write(key: 'mobile_theme_mode', value: storedValue);
    } catch (_) {
      // Keep the selected appearance for this session if storage is unavailable.
    }
  }

  static Future<void> useSystemTheme() => setThemeMode(ThemeMode.system);

  final PoliceApi? api;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<ThemeMode>(
    valueListenable: _themeMode,
    builder: (context, mode, _) => MaterialApp(
      debugShowCheckedModeBanner: false,
      builder: (context, child) => AppLockOverlayHost(
        child: ToastOverlayHost(
          key: Toast.hostKey,
          child: child ?? const SizedBox.shrink(),
        ),
      ),
      title: 'وثائقي',
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        FlutterQuillLocalizations.delegate,
      ],
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: mode,
      home: SessionGate(
        api: api,
        onToggleTheme: toggleTheme,
        onUseSystemTheme: useSystemTheme,
        isDarkMode:
            mode == ThemeMode.dark ||
            (mode == ThemeMode.system &&
                WidgetsBinding.instance.platformDispatcher.platformBrightness ==
                    Brightness.dark),
      ),
    ),
  );
}

class SessionGate extends StatefulWidget {
  const SessionGate({
    super.key,
    this.api,
    this.onToggleTheme,
    this.onUseSystemTheme,
    this.isDarkMode = false,
  });

  final PoliceApi? api;
  final VoidCallback? onToggleTheme;
  final VoidCallback? onUseSystemTheme;
  final bool isDarkMode;

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  late final PoliceApi _api;
  late Future<Map<String, dynamic>?> _session;

  @override
  void initState() {
    super.initState();
    _api = widget.api ?? PoliceApi();
    _session = _restoreSessionWithMandatoryPin();
    _session.then(
      (account) => AppLockRuntime.setSessionActive(account != null),
      onError: (_) => AppLockRuntime.setSessionActive(false),
    );
  }

  Future<Map<String, dynamic>?> _restoreSessionWithMandatoryPin() async {
    final account = await _api.restoreSession();
    if (account == null) return null;

    try {
      if (!await AppLockService.hasPin()) {
        await _api.logout();
        return null;
      }
      await AppLockService.setEnabled(true);
      return account;
    } catch (_) {
      // Do not expose authenticated screens when the mandatory PIN state
      // cannot be verified or enforced.
      try {
        await _api.logout();
      } catch (_) {
        // Keep the UI on the login screen even if the server is unreachable.
      }
      return null;
    }
  }

  Future<void> _returnToLogin() async {
    try {
      await _api.logout();
    } catch (_) {
      // The local session must still be cleared when the server is unreachable.
    } finally {
      AppLockRuntime.setSessionActive(false);
      if (mounted) {
        setState(() => _session = Future<Map<String, dynamic>?>.value(null));
      }
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>?>(
    future: _session,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        final successColor = context.appSuccess;
        return Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            backgroundColor: Theme.of(context).scaffoldBackgroundColor,
            body: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 76,
                    height: 76,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: successColor.withValues(alpha: 0.10),
                      border: Border.all(
                        color: successColor.withValues(alpha: 0.20),
                      ),
                    ),
                    alignment: Alignment.center,
                    child: SizedBox(
                      width: 42,
                      height: 42,
                      child: CircularProgressIndicator(
                        strokeWidth: 3.2,
                        color: successColor,
                        backgroundColor: successColor.withValues(alpha: 0.16),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'جارٍ التحقق من جلسة الدخول...',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurface,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'يرجى الانتظار لحظات',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }

      final account = snapshot.data;
      if (account != null) {
        return DashboardPage(
          api: _api,
          account: account,
          onToggleTheme: widget.onToggleTheme,
          onUseSystemTheme: widget.onUseSystemTheme,
          isDarkMode: widget.isDarkMode,
        );
      }

      if (snapshot.hasError) {
        return Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.wifi_off_outlined, size: 42, color: navy),
                    const SizedBox(height: 12),
                    Text(
                      snapshot.error is NetworkException &&
                              (snapshot.error as NetworkException).message !=
                                  const NetworkException().message
                          ? (snapshot.error as NetworkException).message
                          : 'تعذر التحقق من جلسة الدخول بسبب مشكلة في الاتصال. تحقق من الإنترنت ثم أعد المحاولة.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: () => setState(
                        () => _session = _restoreSessionWithMandatoryPin(),
                      ),
                      icon: const Icon(Icons.refresh),
                      label: const Text('إعادة المحاولة'),
                    ),
                    TextButton(
                      onPressed: _returnToLogin,
                      child: const Text('العودة إلى تسجيل الدخول'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }

      return LoginPage(
        api: _api,
        onToggleTheme: widget.onToggleTheme,
        isDarkMode: widget.isDarkMode,
      );
    },
  );
}

class LoginPage extends StatefulWidget {
  const LoginPage({
    super.key,
    this.api,
    this.onToggleTheme,
    this.isDarkMode = false,
  });

  final PoliceApi? api;
  final VoidCallback? onToggleTheme;
  final bool isDarkMode;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final username = TextEditingController();
  final password = TextEditingController();
  late final PoliceApi api = widget.api ?? PoliceApi();
  bool busy = false;
  String? error;

  @override
  void dispose() {
    username.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> login() async {
    if (username.text.trim().isEmpty || password.text.isEmpty) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final account = await api.login(username.text.trim(), password.text);
      final hasPin = await AppLockService.hasPin();
      if (!mounted) {
        await api.logout();
        return;
      }
      if (!hasPin) {
        final pinConfigured = await showMandatoryPinSetupDialog(context);
        if (!pinConfigured) {
          await api.logout();
          return;
        }
      } else {
        await AppLockService.setEnabled(true);
      }
      if (!mounted) return;
      AppLockRuntime.setSessionActive(true);
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => DashboardPage(
            api: api,
            account: account,
            onToggleTheme: widget.onToggleTheme,
            isDarkMode: widget.isDarkMode,
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(22),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Container(
                      width: 78,
                      height: 78,
                      decoration: const BoxDecoration(
                        color: navy,
                        shape: BoxShape.circle,
                      ),
                      child: ClipOval(
                        child: Image.asset(
                          'assets/wathaeqi-app-icon.png',
                          width: 78,
                          height: 78,
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'برقيات الشرطة',
                      style: TextStyle(
                        color: navy,
                        fontSize: 27,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'منصة وثائقي الرسمية لإدارة الوثائق',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 26),
                    TextField(
                      controller: username,
                      textDirection: TextDirection.ltr,
                      decoration: const InputDecoration(
                        labelText: 'اسم المستخدم',
                        prefixIcon: Icon(Icons.person_outline),
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 13),
                    TextField(
                      controller: password,
                      obscureText: true,
                      textDirection: TextDirection.ltr,
                      onSubmitted: (_) => login(),
                      decoration: const InputDecoration(
                        labelText: 'كلمة المرور',
                        prefixIcon: Icon(Icons.lock_outline),
                        border: OutlineInputBorder(),
                      ),
                    ),
                    if (error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(
                          error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: FilledButton.icon(
                        onPressed: busy ? null : login,
                        icon: busy
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.login),
                        label: Text(busy ? 'جارٍ التحقق...' : 'تسجيل الدخول'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      alignment: WrapAlignment.center,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          'بتسجيل الدخول، فإنك توافق على',
                          style: TextStyle(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant,
                            fontSize: 12,
                          ),
                        ),
                        TextButton(
                          onPressed: () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => const TermsPage(),
                              ),
                            );
                          },
                          style: TextButton.styleFrom(
                            foregroundColor: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant,
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            textStyle: const TextStyle(
                              fontSize: 12,
                              decoration: TextDecoration.underline,
                              decorationColor: Colors.grey,
                            ),
                          ),
                          child: const Text('الشروط والأحكام'),
                        ),
                        Text(
                          '.',
                          style: TextStyle(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class _AnimatedWelcomeGreeting extends StatefulWidget {
  const _AnimatedWelcomeGreeting({required this.name});

  final String name;

  @override
  State<_AnimatedWelcomeGreeting> createState() =>
      _AnimatedWelcomeGreetingState();
}

class _AnimatedWelcomeGreetingState extends State<_AnimatedWelcomeGreeting> {
  static const _flipInterval = Duration(seconds: 7);
  static const _flipDuration = Duration(milliseconds: 1200);
  Timer? _flipTimer;
  bool _showTimeGreeting = false;

  String get _timeBasedGreeting {
    final hour = DateTime.now().hour;
    if (hour >= 5 && hour < 11) return 'صباح الخير';
    if (hour >= 11 && hour < 13) return 'نهار سعيد';
    if (hour >= 13 && hour < 17) return 'طاب يومك';
    if (hour >= 17 && hour < 22) return 'مساء الخير';
    return 'ليلة سعيدة';
  }

  @override
  void initState() {
    super.initState();
    _flipTimer = Timer.periodic(_flipInterval, (_) {
      if (mounted) setState(() => _showTimeGreeting = !_showTimeGreeting);
    });
  }

  @override
  void dispose() {
    _flipTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final greeting = _showTimeGreeting
        ? _timeBasedGreeting
        : 'مرحباً، يا ${widget.name}';
    return Semantics(
      liveRegion: true,
      label: greeting,
      child: AnimatedSwitcher(
        duration: _flipDuration,
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: (child, animation) {
          // A gentle fade keeps the greeting calm and avoids the 3D flip.
          return FadeTransition(
            opacity: CurvedAnimation(
              parent: animation,
              curve: Curves.easeInOutCubic,
            ),
            child: child,
          );
        },
        child: Text(
          greeting,
          key: ValueKey(_showTimeGreeting),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurface,
            fontSize: 17,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }
}

class DashboardPage extends StatefulWidget {
  const DashboardPage({
    super.key,
    required this.api,
    required this.account,
    this.outbox,
    this.onToggleTheme,
    this.onUseSystemTheme,
    this.isDarkMode = false,
  });
  final PoliceApi api;
  final Map<String, dynamic> account;
  final TelegramOutbox? outbox;
  final VoidCallback? onToggleTheme;
  final VoidCallback? onUseSystemTheme;
  final bool isDarkMode;
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

String _dashboardRefreshError(Object error) {
  final details = error.toString().toLowerCase();
  if (error is NetworkException ||
      error is SocketException ||
      details.contains('socketfailed host lookup') ||
      details.contains('failed host lookup') ||
      details.contains('no address associated with hostname') ||
      details.contains('network is unreachable') ||
      details.contains('connection refused') ||
      details.contains('connection timed out')) {
    return 'تعذر الاتصال بالخادم حاليًا. تحقق من اتصال الإنترنت أو إعدادات DNS، ثم أعد المحاولة. ستبقى هذه الصفحة متاحة، ولم يتم تسجيل خروجك.';
  }
  return 'تعذر تحديث بيانات لوحة التحكم. تحقق من الاتصال ثم أعد المحاولة.';
}

class _DashboardPageState extends State<DashboardPage>
    with WidgetsBindingObserver {
  late final Map<String, dynamic> _account;
  bool loading = true;
  String? error;
  Map<String, dynamic> stats = {};
  List<dynamic> telegrams = [];
  String? activeOrganizationId;
  String? activeOrganizationName;
  String? activeOrganizationRole;
  bool activeOrganizationIsActive = false;
  bool activeOrganizationIsOwner = false;
  String? _organizationLogoUrl;
  String? _loadedOrganizationLogoIdentity;
  String? _logoResolvedOrganizationId;
  DateTime? _logoResolvedAt;
  bool _logoLookupResolved = false;
  bool _lastLogoLookupSucceeded = false;
  DateTime? _lastLogoLoadAttemptAt;
  DateTime? _organizationLogoBytesLoadedAt;
  Uint8List? _organizationLogoBytes;
  String numberSystem = 'latin';
  int unreadNotificationCount = 0;
  bool _pushEnabled = false;
  bool _pushBusy = false;
  final _pushTokenRegistration = OrganizationPushTokenRegistration();
  int section = 0;
  int telegramPage = 1;
  bool hasNextTelegramPage = false;
  String searchQuery = '';
  DateTime? _filterFrom;
  DateTime? _filterTo;
  String statusFilter = 'all';
  String priorityFilter = 'all';
  String classificationFilter = 'all';
  String categoryFilter = 'all';
  final searchController = TextEditingController();
  final push = PushNotificationService();
  late final TelegramOutbox _outbox;
  late final DocumentStudioOutbox _documentStudioOutbox;
  bool _outboxSyncInProgress = false;
  Timer? _searchDebounce;
  StreamSubscription<ApiMutationEvent>? _mutationSubscription;
  bool _refreshInProgress = false;
  bool _refreshQueued = false;
  bool _updateCheckInProgress = false;
  bool _forceUpdateCheckQueued = false;
  DateTime? _lastUpdateCheckAt;

  String get _currentOrganizationLabel {
    final value =
        activeOrganizationName ??
        _account['organizationName'] ??
        _account['organization_name'] ??
        (_account['organization'] is Map
            ? (_account['organization'] as Map)['name']
            : null) ??
        _account['departmentName'];
    final label = '$value'.trim();
    return label.isEmpty || label == 'null' ? 'الجهة الحالية غير محددة' : label;
  }

  @override
  void initState() {
    super.initState();
    _account = Map<String, dynamic>.from(widget.account);
    _outbox = widget.outbox ?? TelegramOutbox();
    _documentStudioOutbox = DocumentStudioOutbox(api: widget.api);
    _mutationSubscription = widget.api.mutationEvents.listen(_handleMutation);
    WidgetsBinding.instance.addObserver(this);
    unawaited(_refreshOrganizationContext());
    unawaited(_syncOutbox());
    _loadUnreadNotificationCount();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_checkForAppUpdate());
    });
    push
        .initialize(
          onToken: _handlePushToken,
          onTelegramOpened: (_) => _showNotificationsPreview(),
          onForegroundTelegram: (_) {
            _loadUnreadNotificationCount();
          },
          onAppUpdate: _openAppUpdate,
          onOpenNotifications: _showNotificationsPreview,
        )
        .then((_) async {
          final enabled = await push.notificationsEnabled();
          if (mounted) {
            setState(() => _pushEnabled = enabled);
            if (enabled) {
              unawaited(
                _syncPushTokenForActiveOrganization(activeOrganizationId)
                    .then<void>((_) {}),
              );
            }
          }
        });
  }

  void _handleMutation(ApiMutationEvent event) {
    if (!mounted) return;
    if (event.procedure == 'organizations.selectWorkplace') {
      unawaited(_refreshOrganizationContext());
    }
    if (event.procedure.startsWith('notifications.')) {
      unawaited(_loadUnreadNotificationCount());
    }
  }

  Future<void> _loadOrganizationLogo(
    String? organizationIdValue,
    String? source,
  ) async {
    final organizationId = organizationIdValue?.trim() ?? '';
    final value = source?.trim() ?? '';

    if (organizationId.isEmpty) {
      _loadedOrganizationLogoIdentity = null;
      _lastLogoLoadAttemptAt = null;
      _organizationLogoBytesLoadedAt = null;
      if (mounted && _organizationLogoBytes != null) {
        setState(() => _organizationLogoBytes = null);
      }
      return;
    }

    // A missing settings URL must not suppress the authenticated,
    // organization-scoped binary endpoint. The API client intentionally
    // supports an empty source and resolves the logo by organization ID.
    final sourceIdentity = resolveOrganizationLogoSourceIdentity(
      value,
      widget.api.organizationLogoCacheIdentity,
    );
    if (sourceIdentity == null) {
      _loadedOrganizationLogoIdentity = null;
      _lastLogoLoadAttemptAt = null;
      _organizationLogoBytesLoadedAt = null;
      if (mounted && _organizationLogoBytes != null) {
        setState(() => _organizationLogoBytes = null);
      }
      return;
    }

    final identity = '$organizationId\n$sourceIdentity';
    final now = DateTime.now();
    final isSameIdentity = _loadedOrganizationLogoIdentity == identity;
    final bytesLoadedAt = _organizationLogoBytesLoadedAt;

    // Revalidate periodically: an organization can replace its logo at the
    // same storage path, so a stable URL alone must not cache it forever.
    if (isSameIdentity &&
        _organizationLogoBytes != null &&
        bytesLoadedAt != null &&
        now.difference(bytesLoadedAt) < const Duration(minutes: 10)) {
      return;
    }

    final lastAttempt = _lastLogoLoadAttemptAt;
    if (isSameIdentity &&
        lastAttempt != null &&
        now.difference(lastAttempt) < const Duration(seconds: 30)) {
      return;
    }

    _loadedOrganizationLogoIdentity = identity;
    _lastLogoLoadAttemptAt = now;
    if (!isSameIdentity && mounted && _organizationLogoBytes != null) {
      setState(() {
        _organizationLogoBytes = null;
        _organizationLogoBytesLoadedAt = null;
      });
    }

    Uint8List? imageBytes;
    try {
      imageBytes = await widget.api.fetchOrganizationLogo(
        organizationId: organizationId,
        source: value,
      );
    } catch (_) {
      imageBytes = null;
    }

    if (!mounted || _loadedOrganizationLogoIdentity != identity) return;
    setState(() {
      if (imageBytes != null) {
        _organizationLogoBytes = imageBytes;
        _organizationLogoBytesLoadedAt = DateTime.now();
      } else if (!isSameIdentity) {
        _organizationLogoBytes = null;
        _organizationLogoBytesLoadedAt = null;
      }
      // If revalidation fails for the same logo, retain the last known-good
      // bytes and retry later rather than replacing a valid logo with a blank.
    });
  }

  Future<void> _checkForAppUpdate({bool force = false}) async {
    if (!mounted) return;
    if (_updateCheckInProgress) {
      if (force) _forceUpdateCheckQueued = true;
      return;
    }

    _updateCheckInProgress = true;
    try {
      // Always inspect the tiny local state first. A completed background APK
      // must be offered for installation immediately, even inside the regular
      // two-minute network update-check throttle.
      final hasPendingUpdate = await hasPendingInternalUpdate();
      if (!mounted) return;

      final now = DateTime.now();
      final lastCheck = _lastUpdateCheckAt;
      if (!force &&
          !hasPendingUpdate &&
          lastCheck != null &&
          now.difference(lastCheck) < const Duration(minutes: 2)) {
        return;
      }

      _lastUpdateCheckAt = now;
      await checkAndPromptForAppUpdate(context);
    } finally {
      _updateCheckInProgress = false;
      if (_forceUpdateCheckQueued && mounted) {
        _forceUpdateCheckQueued = false;
        unawaited(_checkForAppUpdate(force: true));
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Revalidate the organization logo as soon as connectivity may have
      // changed; the persisted cache remains available if this request fails.
      _lastLogoLoadAttemptAt = null;
      _logoLookupResolved = false;
      _lastLogoLookupSucceeded = false;
      unawaited(_refreshOrganizationContext());
      unawaited(_syncOutbox(showProgress: false));
      _loadUnreadNotificationCount();
      unawaited(_checkForAppUpdate());
    } else if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached ||
        state == AppLifecycleState.hidden) {
      // Background refresh pauses while the app is not active.
    }
  }

  void _handlePushToken(String token) {
    unawaited(_registerPushToken(token).then<void>((_) {}));
  }

  Future<bool> _registerPushToken(String token) async {
    final organizationId = activeOrganizationId;
    try {
      await widget.api.call(
        'notifications.registerMobileToken',
        mutation: true,
        input: {'token': token, 'platform': Platform.isIOS ? 'ios' : 'android'},
      );
      if (organizationId == activeOrganizationId) {
        _pushTokenRegistration.markRegistered(organizationId);
      }
      return true;
    } catch (_) {
      // A temporary registration failure must not block the user interface.
      return false;
    }
  }

  Future<bool> _syncPushTokenForActiveOrganization(
    String? organizationId,
  ) async {
    if (!mounted || !_pushEnabled) return false;
    return _pushTokenRegistration.ensureRegistered(
      organizationId: organizationId,
      notificationsEnabled: push.notificationsEnabled,
      currentToken: push.currentToken,
      registerToken: _registerPushToken,
    );
  }

  Future<void> _syncOutbox({bool showProgress = true}) async {
    if (_outboxSyncInProgress) return;
    if (mounted) {
      setState(() => _outboxSyncInProgress = true);
    } else {
      _outboxSyncInProgress = true;
    }

    try {
      final legacyResult = await _outbox.sync(widget.api);
      final documentResult = await _documentStudioOutbox.sync();
      final totalSynced = legacyResult.synced + documentResult.synced;

      if (totalSynced > 0) _loadUnreadNotificationCount();
      if (!mounted || !showProgress) return;

      if (legacyResult.permanentFailures > 0) {
        final details = legacyResult.permanentErrorMessages.isEmpty
            ? 'تحقق أو صلاحيات'
            : legacyResult.permanentErrorMessages.join('، ');
        Toast.error(
          context,
          'تم رفض ${legacyResult.permanentFailures} عملية قديمة من الخادم: $details',
        );
      } else if (documentResult.lastError != null) {
        Toast.error(
          context,
          'تعذرت مزامنة الوثائق: ${documentResult.lastError}',
        );
      } else if (totalSynced > 0) {
        Toast.success(context, 'تمت مزامنة $totalSynced عملية بنجاح');
      }
    } catch (_) {
      if (mounted && showProgress) {
        Toast.error(
          context,
          'تعذر تنفيذ المزامنة الآن؛ ستبقى التغييرات محفوظة محلياً',
        );
      }
    } finally {
      if (mounted) {
        setState(() => _outboxSyncInProgress = false);
      } else {
        _outboxSyncInProgress = false;
      }
    }
  }

  void _openOutbox() {
    _pushPage(
      TelegramOutboxPage(
        api: widget.api,
        outbox: _outbox,
        documentOutbox: _documentStudioOutbox,
      ),
    );
  }

  Future<void> _togglePushNotifications() async {
    if (_pushBusy) return;
    setState(() => _pushBusy = true);
    try {
      if (_pushEnabled) {
        final token = await push.currentToken();
        if (token != null) {
          await widget.api.call(
            'notifications.unregisterMobileToken',
            mutation: true,
            input: {'token': token},
          );
        }
        await push.disableNotifications();
        _pushTokenRegistration.clear();
        if (mounted) {
          setState(() => _pushEnabled = false);
          Toast.success(context, 'تم إيقاف إشعارات هذا الجهاز');
        }
      } else {
        final enabled = await push.enableNotifications(
          onToken: _handlePushToken,
        );
        if (!mounted) return;
        setState(() => _pushEnabled = enabled);
        if (!enabled) {
          Toast.error(
            context,
            'اسمح بالإشعارات من إعدادات الجهاز ثم أعد المحاولة',
          );
          return;
        }

        final registered = await _syncPushTokenForActiveOrganization(
          activeOrganizationId,
        );
        if (!mounted) return;
        if (registered) {
          Toast.success(
            context,
            'تم تفعيل الإشعارات وتسجيل هذا الجهاز لاستقبال البرقيات',
          );
        } else {
          Toast.error(
            context,
            'سُمح بالإشعارات، لكن تعذر تسجيل الجهاز لدى الخادم. تحقق من الاتصال ثم أعد المحاولة',
          );
        }
      }
    } catch (_) {
      if (mounted) {
        Toast.error(context, 'تعذر تحديث إعداد الإشعارات الآن');
      }
    } finally {
      if (mounted) setState(() => _pushBusy = false);
    }
  }

  bool get _canViewAuditLogs =>
      _account['role'] == 'admin' ||
      _isPlatformOwner ||
      (activeOrganizationIsActive &&
          {'system_admin', 'auditor'}.contains(activeOrganizationRole));

  bool get _canManageUsers => hasMobileUserManagementAccess(
    accountRole: _account['role']?.toString(),
    organizationRole: activeOrganizationRole,
    isPlatformOwner: _isPlatformOwner,
  );

  bool get _canManageOrganizationSettings =>
      hasMobileOrganizationSettingsAccess(
        organizationRole: activeOrganizationRole,
        isPlatformOwner: _isPlatformOwner,
      );

  bool get _isPlatformOwner =>
      activeOrganizationIsOwner || _account['isPlatformOwner'] == true;

  void _handleAccountAction(String action) {
    switch (action) {
      case 'profile':
        _pushPage(
          ProfileSettingsPage(
            api: widget.api,
            onLogout: _logout,
            onProfileUpdated: _updateAccountProfile,
          ),
        );
        break;
      case 'theme':
        widget.onToggleTheme?.call();
        break;
      case 'system-theme':
        widget.onUseSystemTheme?.call();
        break;
      case 'notifications':
        _togglePushNotifications();
        break;
      case 'refresh':
        refresh();
        break;
      case 'department':
        if (_canManageOrganizationSettings) {
          _pushPage(DepartmentSettingsPage(api: widget.api));
        }
        break;
      case 'owner_dashboard':
        if (_isPlatformOwner) {
          _pushPage(NativeOwnerDashboardPage(api: widget.api));
        }
        break;
      case 'platform_document_settings':
        if (_isPlatformOwner) {
          _pushPage(PlatformDocumentSettingsPage(api: widget.api));
        }
        break;
      case 'organizations':
        _pushPage(
          NativeOrganizationManagementPage(
            api: widget.api,
            canEditStructure: hasMobileOrganizationStructureEditAccess(
              accountRole: _account['role']?.toString(),
            ),
            isPlatformOwner: _isPlatformOwner,
          ),
        );
        break;
      case 'users':
        if (_canManageUsers) {
          _pushPage(NativeUserManagementPage(api: widget.api));
        }
        break;
      case 'regions':
        _pushPage(NativeOperationsPage(api: widget.api, initialTab: 1));
        break;
      case 'terms':
        _pushPage(const TermsPage());
        break;
      case 'system_about':
        _pushPage(const AboutPage());
        break;
      case 'app_about_update':
        _pushPage(const AppUpdatePage());
        break;
      case 'logout':
        _logout();
        break;
    }
  }

  void _pushPage(Widget page) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => page));
  }

  void _openAppUpdate() {
    if (!mounted) return;
    _pushPage(const AppUpdatePage());
    // A notification tap is an explicit request to inspect the update now.
    // Run after the update page is pushed so any install/resume prompt appears
    // above that page rather than behind it.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_checkForAppUpdate(force: true));
    });
  }

  void _updateAccountProfile(Map<String, dynamic> profile) {
    if (!mounted) return;
    setState(() {
      if (profile['name'] != null) _account['name'] = profile['name'];
      if (profile['mustChangePassword'] != null) {
        _account['mustChangePassword'] = profile['mustChangePassword'];
      }
    });
  }

  Future<void> _loadUnreadNotificationCount() async {
    try {
      final result = await widget.api.call('notifications.inbox');
      final rows = result is List
          ? result
          : result is Map && result['items'] is List
          ? result['items'] as List
          : const <dynamic>[];
      final unread = rows.where((item) {
        return item is Map && item['readAt'] == null;
      }).length;
      if (mounted) setState(() => unreadNotificationCount = unread);
    } catch (_) {
      // The badge is optional and must never block the dashboard.
    }
  }

  Future<void> _logout() async {
    final navigator = Navigator.of(context);
    try {
      final token = await push.currentToken();
      if (token != null) {
        await widget.api.call(
          'notifications.unregisterMobileToken',
          mutation: true,
          input: {'token': token},
        );
      }
    } catch (_) {
      // Continue with local logout if push cleanup cannot reach the server.
    }
    try {
      await widget.api.logout();
    } catch (_) {
      // PoliceApi.logout clears the local session in its finally block.
    }
    _pushTokenRegistration.clear();
    AppLockRuntime.setSessionActive(false);
    if (!mounted) return;
    navigator.pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginPage()),
    );
  }

  Future<void> _showNotificationsPreview() async {
    final notifications = widget.api.call('notifications.inbox');
    await showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (dialogContext) {
        final screenWidth = MediaQuery.sizeOf(dialogContext).width;
        final panelWidth = screenWidth < 440 ? screenWidth - 32 : 408.0;
        return Dialog(
          alignment: AlignmentDirectional.topEnd,
          insetPadding: const EdgeInsets.fromLTRB(12, 76, 12, 12),
          child: SizedBox(
            width: panelWidth,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.notifications_none_rounded, color: navy),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          'الإشعارات',
                          style: TextStyle(fontWeight: FontWeight.w900),
                        ),
                      ),
                      IconButton(
                        tooltip: 'إغلاق',
                        onPressed: () => Navigator.pop(dialogContext),
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                  const Divider(height: 1),
                  SizedBox(
                    height: 236,
                    child: FutureBuilder<dynamic>(
                      future: notifications,
                      builder: (context, snapshot) {
                        if (snapshot.connectionState != ConnectionState.done) {
                          return const Center(
                            child: CircularProgressIndicator(color: navy),
                          );
                        }
                        if (snapshot.hasError) {
                          return Center(
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(
                                    Icons.cloud_off_outlined,
                                    color: Color(0xFF7A8493),
                                    size: 30,
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    _dashboardRefreshError(snapshot.error!),
                                    textAlign: TextAlign.center,
                                  ),
                                  TextButton.icon(
                                    onPressed: () {
                                      Navigator.pop(dialogContext);
                                      if (mounted) _showNotificationsPreview();
                                    },
                                    icon: const Icon(Icons.refresh_rounded),
                                    label: const Text('إعادة المحاولة'),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }
                        final rows = snapshot.data is List
                            ? snapshot.data as List
                            : const <dynamic>[];
                        if (rows.isEmpty) {
                          return const Center(
                            child: Padding(
                              padding: EdgeInsets.all(20),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.notifications_none_rounded,
                                    size: 34,
                                    color: Color(0xFF7A8493),
                                  ),
                                  SizedBox(height: 8),
                                  Text(
                                    'لا توجد تنبيهات جديدة',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  SizedBox(height: 4),
                                  Text(
                                    'ستظهر هنا إشعارات النظام والوثائق.',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: Color(0xFF7A8493),
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }
                        final visibleRows = rows.take(4).toList();
                        return ListView.separated(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          itemCount: visibleRows.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final notification = Map<String, dynamic>.from(
                              visibleRows[index] as Map,
                            );
                            final telegramId = int.tryParse(
                              '${notification['telegramId'] ?? ''}',
                            );
                            final notificationId = int.tryParse(
                              '${notification['id'] ?? ''}',
                            );
                            final read = notification['readAt'] != null;
                            return ListTile(
                              dense: true,
                              leading: const CircleAvatar(
                                radius: 17,
                                backgroundColor: Color(0xFFF1E8D5),
                                child: Icon(
                                  Icons.notifications_active_outlined,
                                  color: navy,
                                  size: 18,
                                ),
                              ),
                              title: Text(
                                '${notification['title'] ?? 'إشعار جديد'}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 13,
                                ),
                              ),
                              subtitle: Text(
                                '${notification['body'] ?? notification['content'] ?? ''}',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              trailing: null,
                              onTap: telegramId == null
                                  ? null
                                  : () async {
                                      if (!read && notificationId != null) {
                                        try {
                                          await widget.api.call(
                                            'notifications.markRead',
                                            mutation: true,
                                            input: {'id': notificationId},
                                          );
                                        } catch (_) {
                                          // Opening the telegram still helps
                                          // the user recover from a mark-read
                                          // request failure.
                                        }
                                      }
                                      if (!dialogContext.mounted) return;
                                      Navigator.pop(dialogContext);
                                      await _openIncomingTelegram(telegramId);
                                    },
                            );
                          },
                        );
                      },
                    ),
                  ),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton(
                      onPressed: () {
                        Navigator.pop(dialogContext);
                        if (!mounted) return;
                        _pushPage(
                          NotificationsPage(
                            api: widget.api,
                            onOpenTelegram: (id) {
                              _openIncomingTelegram(id);
                            },
                          ),
                        );
                      },
                      child: const Text('عرض جميع الإشعارات'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _openIncomingTelegram(int telegramId) async {
    await refresh();
    if (!mounted) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => TelegramDetailsPage(
          api: widget.api,
          telegramId: telegramId,
          account: _account,
          organizationRole: activeOrganizationRole,
          organizationIsOwner: activeOrganizationIsOwner,
          officialDocument: true,
        ),
      ),
    );
    if (mounted) await refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _searchDebounce?.cancel();
    final mutationSubscription = _mutationSubscription;
    if (mutationSubscription != null) {
      unawaited(mutationSubscription.cancel());
    }
    searchController.dispose();
    push.dispose();
    super.dispose();
  }

  Future<void> _refreshOrganizationContext() async {
    try {
      final value = await widget.api.call('organizations.context');
      if (value is! Map) return;
      final organizationId = value['organizationId']?.toString();
      if (!mounted) return;
      setState(() {
        activeOrganizationId = organizationId;
        activeOrganizationName = (value['organizationName'] ?? value['name'])
            ?.toString();
        activeOrganizationRole = value['role']?.toString();
        activeOrganizationIsActive = value['isActive'] == true;
        activeOrganizationIsOwner = value['isOwner'] == true;
      });
      if (organizationId != null && organizationId.isNotEmpty) {
        unawaited(
          _syncPushTokenForActiveOrganization(organizationId)
              .then<void>((_) {}),
        );
      }
    } catch (_) {
      // Keep the last verified organization context when offline.
    }
  }

  Future<void> refresh({bool showLoading = true}) async {
    if (!mounted) return;
    if (_refreshInProgress) {
      _refreshQueued = true;
      return;
    }
    _refreshInProgress = true;
    if (showLoading) setState(() => loading = true);
    try {
      final canUseCachedDashboard =
          showLoading &&
          telegramPage == 1 &&
          section == 0 &&
          searchQuery.trim().isEmpty &&
          statusFilter == 'all' &&
          priorityFilter == 'all' &&
          classificationFilter == 'all' &&
          categoryFilter == 'all' &&
          _filterFrom == null &&
          _filterTo == null;
      if (canUseCachedDashboard) {
        final cached = await widget.api.readCachedDashboard();
        final cachedStats = cached?['stats'];
        final cachedTelegrams = cached?['telegrams'];
        if (mounted && cached != null && cachedTelegrams is List) {
          setState(() {
            if (cachedStats is Map) {
              stats = Map<String, dynamic>.from(cachedStats);
            }
            telegrams = List<dynamic>.from(cachedTelegrams);
            loading = false;
            error = null;
          });
        }
      }
      final results = await Future.wait([
        widget.api.call('dashboard.stats'),
        widget.api.call('organizations.context').catchError((_) => null),
        widget.api.call('settings.get').catchError((_) => null),
        widget.api.call(
          'telegrams.list',
          input: {
            'page': telegramPage,
            // Fetch one look-ahead row so the Next button is enabled only
            // when another page actually exists.
            'pageSize': 21,
            if (section == 1) 'direction': 'outgoing',
            if (section == 2) 'direction': 'incoming',
            if (_filterFrom != null)
              'from': _filterFrom!.toUtc().toIso8601String(),
            if (_filterTo != null) 'to': _filterTo!.toUtc().toIso8601String(),
            if (searchQuery.trim().isNotEmpty) 'search': searchQuery.trim(),
            if (statusFilter != 'all') 'status': statusFilter,
            if (priorityFilter != 'all') 'priority': priorityFilter,
            if (classificationFilter != 'all')
              'classification': classificationFilter,
            if (categoryFilter != 'all') 'category': categoryFilter,
          },
        ),
      ]);
      final organizationContext = results[1];
      var settings = results[2];
      final list = results[3];

      // Organization logos must come only from the verified active
      // organization. Never fall back to a legacy user-level logo.
      final contextOrganizationId = organizationContext is Map
          ? organizationContext['organizationId']?.toString().trim()
          : null;
      final settingsOrganizationId = settings is Map
          ? settings['organizationId']?.toString().trim()
          : null;
      final accountOrganization = _account['organization'];
      final accountOrganizationId =
          _account['organizationId'] ??
          _account['organization_id'] ??
          (accountOrganization is Map ? accountOrganization['id'] : null);
      final organizationId =
          (contextOrganizationId != null && contextOrganizationId.isNotEmpty)
          ? contextOrganizationId
          : settingsOrganizationId != null && settingsOrganizationId.isNotEmpty
          ? settingsOrganizationId
          : accountOrganizationId?.toString().trim();

      final mergedSettings = settings is Map
          ? Map<String, dynamic>.from(settings)
          : <String, dynamic>{};
      final savedOrganizationLogo = mergedSettings['logoUrl']
          ?.toString()
          .trim();
      // Use settings.get as a fallback only when its organization ID
      // matches the active organization. Missing metadata cannot prove that
      // a legacy logo belongs to this unit; the scoped endpoint may refresh it.
      mergedSettings['logoUrl'] =
          organizationId != null &&
              organizationId.isNotEmpty &&
              settingsOrganizationId == organizationId &&
              savedOrganizationLogo != null &&
              savedOrganizationLogo.isNotEmpty
          ? savedOrganizationLogo
          : null;
      final now = DateTime.now();
      final logoResolutionIsFresh =
          organizationId != null &&
          organizationId.isNotEmpty &&
          _logoLookupResolved &&
          _logoResolvedOrganizationId == organizationId &&
          _logoResolvedAt != null &&
          now.difference(_logoResolvedAt!) <
              (_lastLogoLookupSucceeded
                  ? const Duration(minutes: 10)
                  : const Duration(minutes: 2));
      var logoLookupSucceeded = false;
      if (logoResolutionIsFresh) {
        mergedSettings['logoUrl'] = _organizationLogoUrl;
      } else if (organizationId != null && organizationId.isNotEmpty) {
        try {
          final organizationSettings = await widget.api.call(
            'organizations.logo',
            input: {'organizationId': organizationId},
          );
          if (organizationSettings is Map &&
              organizationSettings['organizationId']?.toString() ==
                  organizationId) {
            final scopedLogo = organizationSettings['logoUrl']
                ?.toString()
                .trim();
            if (scopedLogo == null || scopedLogo.isEmpty) {
              mergedSettings['logoUrl'] = null;
            } else {
              mergedSettings['logoUrl'] = scopedLogo;
            }
            logoLookupSucceeded = true;
          }
        } catch (_) {
          // Preserve the verified account-scoped fallback if logo lookup is unavailable.
        }
      } else {
        mergedSettings['logoUrl'] = null;
      }
      if (organizationId != null && organizationId.isNotEmpty) {
        _logoLookupResolved = true;
        _logoResolvedOrganizationId = organizationId;
        _logoResolvedAt = now;
        _lastLogoLookupSucceeded =
            logoLookupSucceeded || mergedSettings['logoUrl'] != null;
      } else {
        _logoLookupResolved = false;
        _logoResolvedOrganizationId = null;
        _logoResolvedAt = null;
        _lastLogoLookupSucceeded = false;
      }
      settings = mergedSettings;

      final logoUrl = settings['logoUrl']?.toString().trim();
      final rows = list is Map && list['items'] is List
          ? list['items'] as List
          : list is List
          ? list
          : <dynamic>[];
      final hasMoreRows = rows.length > 20;
      final visibleRows = rows.take(20).toList(growable: false);
      if (mounted) {
        setState(() {
          stats = Map<String, dynamic>.from(results[0] as Map);
          activeOrganizationId = organizationId;
          activeOrganizationName = organizationContext is Map
              ? (organizationContext['organizationName'] ??
                        organizationContext['name'])
                    ?.toString()
              : null;
          activeOrganizationRole = organizationContext is Map
              ? organizationContext['role']?.toString()
              : null;
          activeOrganizationIsActive =
              organizationContext is Map &&
              organizationContext['isActive'] == true;
          activeOrganizationIsOwner =
              organizationContext is Map &&
              organizationContext['isOwner'] == true;
          if (settings is Map) {
            numberSystem = settings['numberSystem'] == 'arabic'
                ? 'arabic'
                : 'latin';
            _organizationLogoUrl = logoUrl == null || logoUrl.isEmpty
                ? null
                : logoUrl;
          }
          telegrams = visibleRows;
          hasNextTelegramPage = hasMoreRows;
          error = null;
        });
      }
      unawaited(_loadOrganizationLogo(organizationId, _organizationLogoUrl));
      if (organizationId != null && organizationId.isNotEmpty) {
        unawaited(
          _syncPushTokenForActiveOrganization(organizationId)
              .then<void>((_) {}),
        );
      }
      if (telegramPage == 1 &&
          section == 0 &&
          searchQuery.trim().isEmpty &&
          statusFilter == 'all' &&
          priorityFilter == 'all' &&
          classificationFilter == 'all' &&
          categoryFilter == 'all' &&
          _filterFrom == null &&
          _filterTo == null) {
        await widget.api.cacheDashboard(
          stats: Map<String, dynamic>.from(results[0] as Map),
          telegrams: visibleRows,
        );
      }
    } catch (e) {
      if (mounted) {
        final cached = await widget.api.readCachedDashboard();
        if (cached != null) {
          final cachedStats = cached['stats'];
          final cachedTelegrams = cached['telegrams'];
          setState(() {
            if (cachedStats is Map) {
              stats = Map<String, dynamic>.from(cachedStats);
            }
            if (cachedTelegrams is List) telegrams = cachedTelegrams;
            error = 'وضع عدم الاتصال — تُعرض آخر نسخة محفوظة محليًا';
          });
        } else {
          setState(() {
            error = _dashboardRefreshError(e);
            // No cached dashboard is available, so report the connection
            // failure instead of claiming that cached data is being shown.
          });
        }
      }
    } finally {
      _refreshInProgress = false;
      if (mounted && showLoading) setState(() => loading = false);
      if (mounted && _refreshQueued) {
        _refreshQueued = false;
        refresh(showLoading: false);
      }
    }
  }

  Future<void> create() async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) {
        final keyboardInset = MediaQuery.viewInsetsOf(sheetContext).bottom;
        return AnimatedPadding(
          padding: EdgeInsets.only(bottom: keyboardInset),
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          child: AdvancedCreateTelegramSheet(api: widget.api, outbox: _outbox),
        );
      },
    );
    if (result == true) {
      await _syncOutbox();
      refresh();
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        titleSpacing: 0,
        leading: Builder(
          builder: (context) => IconButton(
            tooltip: 'فتح القائمة الجانبية',
            onPressed: () => Scaffold.of(context).openDrawer(),
            icon: const Icon(LucideIcons.panelLeft),
          ),
        ),
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.asset(
                'assets/wathaeqi-app-icon.png',
                width: 36,
                height: 36,
                fit: BoxFit.contain,
                semanticLabel: 'أيقونة وثائقي',
              ),
            ),
            const SizedBox(width: 8),
            const Flexible(
              child: Text(
                'وثائقي',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
              ),
            ),
          ],
        ),
        actions: [
          PopupMenuButton<ThemeMode>(
            tooltip: 'إعدادات المظهر',
            icon: const Icon(Icons.brightness_6_outlined),
            onSelected: PoliceTelegramsApp.setThemeMode,
            itemBuilder: (context) {
              final selectedMode = PoliceTelegramsApp.themeMode;
              Widget option({
                required IconData icon,
                required String title,
                required ThemeMode mode,
              }) {
                return SizedBox(
                  width: 216,
                  child: Row(
                    children: [
                      Icon(
                        icon,
                        size: 18,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: Text(title)),
                      if (selectedMode == mode)
                        Icon(
                          Icons.check_rounded,
                          size: 18,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                    ],
                  ),
                );
              }

              return [
                PopupMenuItem<ThemeMode>(
                  value: ThemeMode.system,
                  child: option(
                    icon: Icons.brightness_auto_outlined,
                    title: 'تلقائي حسب الجهاز',
                    mode: ThemeMode.system,
                  ),
                ),
                PopupMenuItem<ThemeMode>(
                  value: ThemeMode.light,
                  child: option(
                    icon: Icons.light_mode_outlined,
                    title: 'الوضع الفاتح',
                    mode: ThemeMode.light,
                  ),
                ),
                PopupMenuItem<ThemeMode>(
                  value: ThemeMode.dark,
                  child: option(
                    icon: Icons.dark_mode_outlined,
                    title: 'الوضع الداكن',
                    mode: ThemeMode.dark,
                  ),
                ),
              ];
            },
          ),
          IconButton(
            tooltip: 'الإشعارات',
            onPressed: _showNotificationsPreview,
            icon: Stack(
              clipBehavior: Clip.none,
              children: [
                const Icon(LucideIcons.bell),
                if (unreadNotificationCount > 0)
                  Positioned(
                    top: -5,
                    right: -6,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 17),
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      height: 17,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: const Color(0xFFB42332),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: const Color(0xFFF8F7F2),
                          width: 2,
                        ),
                      ),
                      child: Text(
                        unreadNotificationCount > 99
                            ? '99+'
                            : '$unreadNotificationCount',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          height: 1,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          PopupMenuButton<String>(
            tooltip: 'إعدادات الحساب',
            onSelected: _handleAccountAction,
            icon: const Icon(LucideIcons.ellipsis),
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'profile',
                child: _AccountMenuItem(
                  icon: Icons.person_outline_rounded,
                  title: 'الملف الشخصي',
                ),
              ),
              PopupMenuItem(
                value: 'notifications',
                enabled: !_pushBusy,
                child: _AccountMenuItem(
                  icon: _pushEnabled
                      ? Icons.notifications_off_outlined
                      : Icons.notifications_active_outlined,
                  title: _pushBusy
                      ? 'جارٍ تحديث الإشعارات...'
                      : _pushEnabled
                      ? 'إيقاف الإشعارات'
                      : 'تفعيل الإشعارات',
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem<String>(
                enabled: false,
                height: 34,
                child: Text(
                  'إعدادات الجهة',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF7A8493),
                  ),
                ),
              ),
              if (_canManageOrganizationSettings)
                const PopupMenuItem(
                  value: 'department',
                  child: _AccountMenuItem(
                    icon: Icons.settings_outlined,
                    title: 'إعدادات الجهة',
                  ),
                ),
              if (_canManageUsers) ...[
                PopupMenuItem<String>(
                  enabled: false,
                  height: 34,
                  child: Text(
                    getMobileManagementMenuHeading(
                      accountRole: _account['role']?.toString(),
                      isPlatformOwner: _isPlatformOwner,
                    ),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF7A8493),
                    ),
                  ),
                ),
                if (_isPlatformOwner) ...[
                  const PopupMenuItem(
                    value: 'owner_dashboard',
                    child: _AccountMenuItem(
                      icon: Icons.dashboard_customize_outlined,
                      title: 'لوحة قيادة المالك',
                    ),
                  ),
                  const PopupMenuItem(
                    value: 'platform_document_settings',
                    child: _AccountMenuItem(
                      icon: Icons.tune_rounded,
                      title: 'إعدادات النظام والوثائق',
                    ),
                  ),
                ],
                const PopupMenuItem(
                  value: 'users',
                  child: _AccountMenuItem(
                    icon: Icons.manage_accounts_outlined,
                    title: 'إدارة المستخدمين',
                  ),
                ),
                const PopupMenuItem(
                  value: 'organizations',
                  child: _AccountMenuItem(
                    icon: Icons.account_tree_outlined,
                    title: 'إدارة الجهات',
                  ),
                ),
              ],
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'terms',
                child: _AccountMenuItem(
                  icon: Icons.gavel_outlined,
                  title: 'الشروط والأحكام',
                ),
              ),
              const PopupMenuItem(
                value: 'system_about',
                child: _AccountMenuItem(
                  icon: Icons.account_tree_outlined,
                  title: 'حول وثائقي وميزاته',
                ),
              ),
              const PopupMenuItem(
                value: 'app_about_update',
                child: _AccountMenuItem(
                  icon: Icons.phone_android_rounded,
                  title: 'حول التطبيق والتحديثات',
                ),
              ),
              const PopupMenuItem(
                value: 'logout',
                child: _AccountMenuItem(
                  icon: Icons.logout_rounded,
                  title: 'تسجيل الخروج',
                  color: Color(0xFFB42332),
                ),
              ),
            ],
          ),
        ],
      ),
      drawer: Drawer(
        backgroundColor: navy,
        child: SafeArea(
          child: ListTileTheme(
            data: const ListTileThemeData(
              textColor: Colors.white,
              iconColor: Color(0xFFB8C5D6),
              selectedColor: Colors.white,
              selectedTileColor: Color(0xFF12385D),
              titleTextStyle: TextStyle(
                color: Colors.white,
                fontFamily: 'Cairo',
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
              subtitleTextStyle: TextStyle(
                color: Color(0xFFB8C5D6),
                fontFamily: 'Cairo',
                fontSize: 11,
                fontWeight: FontWeight.w500,
              ),
              visualDensity: VisualDensity(vertical: -1),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.all(Radius.circular(12)),
              ),
            ),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 4, 8, 12),
                  child: Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.asset(
                          'assets/wathaeqi-app-icon.png',
                          width: 38,
                          height: 38,
                          fit: BoxFit.cover,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'وثائقي',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              _currentOrganizationLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Color(0xFFD8C38E),
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'إغلاق القائمة',
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(
                          LucideIcons.panelLeft,
                          color: Colors.white70,
                        ),
                      ),
                    ],
                  ),
                ),
                const Divider(color: Color(0xFF29415E)),
                const Padding(
                  padding: EdgeInsets.fromLTRB(12, 7, 12, 5),
                  child: Text(
                    'التنقل الرئيسي',
                    style: TextStyle(
                      color: Color(0xFF8FA4BD),
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                ListTile(
                  leading: const Icon(Icons.description_outlined),
                  title: const Text('مكتبة الوثائق'),
                  selected: true,
                  onTap: () => Navigator.pop(context),
                ),
                ListTile(
                  leading: const Icon(Icons.edit_outlined),
                  title: const Text('استوديو الوثائق'),
                  onTap: () {
                    Navigator.pop(context);
                    _pushPage(
                      DocumentStudioPage(
                        api: widget.api,
                        outbox: _documentStudioOutbox,
                      ),
                    );
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.sync_outlined),
                  title: const Text('المزامنة المحلية'),
                  subtitle: const Text('حفظ التغييرات وإعادة مزامنتها'),
                  onTap: () {
                    Navigator.pop(context);
                    _openOutbox();
                  },
                ),
                if (_isPlatformOwner)
                  ListTile(
                    leading: const Icon(LucideIcons.layoutDashboard),
                    title: const Text('لوحة قيادة المالك'),
                    subtitle: const Text('مؤشرات المنصة وسجل العمليات'),
                    onTap: () {
                      Navigator.pop(context);
                      _pushPage(NativeOwnerDashboardPage(api: widget.api));
                    },
                  ),
                if (_canViewAuditLogs)
                  ListTile(
                    leading: const Icon(Icons.history),
                    title: const Text('سجل الإجراءات'),
                    subtitle: const Text('سجل التدقيق المركزي'),
                    onTap: () {
                      Navigator.pop(context);
                      _pushPage(AuditLogPage(api: widget.api));
                    },
                  ),
                if (_canManageUsers)
                  ListTile(
                    leading: const Icon(LucideIcons.users),
                    title: const Text('إدارة المستخدمين'),
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              NativeUserManagementPage(api: widget.api),
                        ),
                      );
                    },
                  ),
                if (_canManageUsers)
                  ListTile(
                    leading: const Icon(LucideIcons.building2),
                    title: const Text('إدارة الجهات'),
                    onTap: () {
                      Navigator.pop(context);
                      _handleAccountAction('organizations');
                    },
                  ),
              ],
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        heroTag: 'create-document-fab',
        tooltip: 'إنشاء وثيقة',
        backgroundColor: const Color(0xFF348FEA),
        foregroundColor: Colors.white,
        onPressed: () => _pushPage(
          DocumentStudioPage(
            api: widget.api,
            outbox: _documentStudioOutbox,
            initialTab: DocumentStudioTab.documents,
            openCreationOptionsOnOpen: true,
          ),
        ),
        child: const Icon(Icons.add_comment_outlined, size: 25),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      body: DocumentLibraryPage(
        api: widget.api,
        onEditDocument: (document) => _pushPage(
          DocumentStudioPage(
            api: widget.api,
            outbox: _documentStudioOutbox,
            initialTab: DocumentStudioTab.documents,
            initialDocumentId: document.id,
          ),
        ),
      ),
    ),
  );
}

class _AccountMenuItem extends StatelessWidget {
  const _AccountMenuItem({required this.icon, required this.title, this.color});

  final IconData icon;
  final String title;
  final Color? color;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 216,
    child: Row(
      children: [
        Icon(icon, size: 18, color: color ?? const Color(0xFF667085)),
        const SizedBox(width: 10),
        Expanded(
          child: Text(title, style: TextStyle(color: color, fontSize: 13)),
        ),
      ],
    ),
  );
}

class TelegramDetailsPage extends StatefulWidget {
  const TelegramDetailsPage({
    super.key,
    required this.api,
    required this.telegramId,
    this.initialTelegram,
    required this.account,
    required this.organizationRole,
    required this.organizationIsOwner,
    this.officialDocument = false,
  });
  final PoliceApi api;
  final int telegramId;
  final Map<String, dynamic>? initialTelegram;
  final Map<String, dynamic> account;
  final String? organizationRole;
  final bool organizationIsOwner;
  final bool officialDocument;
  @override
  State<TelegramDetailsPage> createState() => _TelegramDetailsPageState();
}

class _TelegramDetailsPageState extends State<TelegramDetailsPage> {
  bool loading = true;
  String? error;
  Map<String, dynamic>? telegram;
  bool _versionsLoading = true;
  String? _versionsError;
  List<Map<String, dynamic>> _versions = const [];
  int? _selectedVersionNumber;
  Timer? _refreshTimer;
  StreamSubscription<ApiMutationEvent>? _mutationSubscription;

  bool get _isAdmin => widget.account['role'] == 'admin';
  bool get _canOperate =>
      _isAdmin ||
      const {
        'system_admin',
        'organization_admin',
        'regional_admin',
        'organization_supervisor',
        'reviewer',
        'dispatcher',
      }.contains(widget.organizationRole);

  bool get _managementExpired {
    final createdAt = DateTime.tryParse('${telegram?['createdAt'] ?? ''}');
    return !_isAdmin &&
        !widget.organizationIsOwner &&
        createdAt != null &&
        DateTime.now().difference(createdAt) > const Duration(hours: 48);
  }

  String _statusLabel(dynamic value) {
    final raw = '$value';
    return telegramStatusLabels[raw.toLowerCase()] ?? raw;
  }

  String _priorityLabel(dynamic value) {
    final raw = '$value';
    return telegramPriorityLabels[raw.toLowerCase()] ?? raw;
  }

  String _classificationLabel(dynamic value) {
    final raw = '$value';
    final normalized = raw.toLowerCase();
    return telegramClassificationLabels[normalized] ??
        switch (normalized) {
          'confidential' || 'restricted' => 'سري',
          'top_secret' || 'top secret' => 'سري للغاية',
          'public' => 'عادية',
          _ => raw,
        };
  }

  String _categoryLabel(dynamic value) {
    final raw = '$value';
    return telegramCategoryLabels[raw.toLowerCase()] ?? raw;
  }

  String _formatDate(dynamic value) {
    final date = DateTime.tryParse('$value');
    if (date == null) return '$value';
    final local = date.toLocal();
    return '${local.year}/${local.month.toString().padLeft(2, '0')}/${local.day.toString().padLeft(2, '0')} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }

  @override
  void initState() {
    super.initState();
    telegram = widget.initialTelegram;
    loading = widget.initialTelegram == null;
    _mutationSubscription = widget.api.mutationEvents.listen(_handleMutation);
    load();
    _loadVersions();
    _refreshTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      load();
      _loadVersions();
    });
  }

  void _handleMutation(ApiMutationEvent event) {
    if (!mounted || !event.isTelegramMutation) return;
    if (event.procedure == 'telegrams.delete' ||
        !event.affectsTelegram(widget.telegramId)) {
      return;
    }
    unawaited(load());
    if (event.procedure == 'telegrams.update' ||
        event.procedure == 'telegrams.reissue') {
      unawaited(_loadVersions());
    }
  }

  Future<void> _loadVersions() async {
    setState(() {
      _versionsLoading = true;
      _versionsError = null;
    });
    final input = {'telegramId': widget.telegramId};
    var hasCachedVersions = false;
    try {
      final cached = await widget.api.readCachedResponse(
        'telegrams.versions',
        input: input,
      );
      if (mounted && cached is List) {
        setState(() {
          _versions = cached
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList();
          _versionsLoading = false;
        });
        hasCachedVersions = true;
      }
    } catch (_) {
      // A corrupt cache must never block the authoritative request.
    }
    try {
      final result = await widget.api.call('telegrams.versions', input: input);
      if (!mounted) return;
      setState(() {
        _versions = result is List
            ? result
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item))
                  .toList()
            : const [];
        _versionsLoading = false;
      });
    } catch (exception) {
      if (!mounted) return;
      setState(() {
        _versionsLoading = false;
        _versionsError = hasCachedVersions
            ? null
            : exception.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    final mutationSubscription = _mutationSubscription;
    if (mutationSubscription != null) {
      unawaited(mutationSubscription.cancel());
    }
    super.dispose();
  }

  Future<void> load() async {
    final input = {'id': widget.telegramId};
    try {
      final cached = await widget.api.readCachedResponse(
        'telegrams.get',
        input: input,
      );
      if (mounted && cached is Map) {
        setState(() {
          telegram = Map<String, dynamic>.from(cached);
          loading = false;
          error = null;
        });
      }
    } catch (_) {
      // A corrupt cache must never block the authoritative request.
    }
    try {
      final data = await widget.api.call('telegrams.get', input: input);
      if (mounted) {
        setState(() {
          telegram = Map<String, dynamic>.from(data as Map);
          error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _editTelegram() async {
    if (telegram == null) await load();
    if (!mounted) return;
    final currentTelegram = telegram;
    if (currentTelegram == null) {
      Toast.error(context, error ?? 'تعذر تحميل بيانات البرقية للتعديل.');
      return;
    }
    if (_managementExpired) {
      Toast.error(
        context,
        'انتهت مهلة تعديل البرقية البالغة 48 ساعة؛ الصلاحية الدائمة للمالك فقط.',
      );
      return;
    }

    final saved = await showDialog<Object?>(
      context: context,
      barrierDismissible: false,
      builder: (_) => TelegramEditDialog(
        api: widget.api,
        telegramId: widget.telegramId,
        telegram: currentTelegram,
      ),
    );

    if (!mounted) return;
    if (saved == TelegramEditDialog.queuedOfflineResult) {
      await load();
      if (!mounted) return;
      Toast.info(
        context,
        'لا يوجد اتصال: حُفظ التعديل محليًا بشكل مشفّر وسيُرسل تلقائيًا عند عودة الاتصال.',
      );
      return;
    }
    if (saved != true) return;
    await load();
    if (!mounted) return;
    Toast.success(context, 'تم حفظ تعديلات البرقية');
  }

  Future<void> _deleteTelegram() async {
    if (telegram == null) await load();
    if (!mounted) return;
    if (telegram == null) {
      Toast.error(context, error ?? 'تعذر تحميل بيانات البرقية للحذف.');
      return;
    }
    if (_managementExpired) {
      Toast.error(
        context,
        'انتهت مهلة حذف البرقية البالغة 48 ساعة؛ الصلاحية الدائمة للمالك فقط.',
      );
      return;
    }
    final reasonController = TextEditingController();
    String? reasonError;
    final reason = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => Directionality(
          textDirection: TextDirection.rtl,
          child: AlertDialog(
            title: const Text('حذف البرقية نهائيًا'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'سيتم حذف البرقية وسجلها والمرفقات المرتبطة بها نهائياً. '
                  'لا يمكن التراجع عن هذا الإجراء.',
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: reasonController,
                  minLines: 2,
                  maxLines: 4,
                  autofocus: true,
                  decoration: InputDecoration(
                    labelText: 'سبب الحذف',
                    hintText: 'اكتب سبباً واضحاً (3 أحرف على الأقل)',
                    errorText: reasonError,
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('إلغاء'),
              ),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: Colors.red),
                onPressed: () {
                  final value = reasonController.text.trim();
                  if (value.length < 3) {
                    setDialogState(
                      () => reasonError =
                          'سبب الحذف مطلوب ويجب ألا يقل عن 3 أحرف',
                    );
                    return;
                  }
                  Navigator.of(dialogContext).pop(value);
                },
                child: const Text('حذف نهائي'),
              ),
            ],
          ),
        ),
      ),
    );
    reasonController.dispose();
    if (reason == null || !mounted) return;

    try {
      await widget.api.call(
        'telegrams.delete',
        mutation: true,
        input: {'id': widget.telegramId, 'reason': reason},
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (exception) {
      if (!mounted) return;
      Toast.info(context, exception.toString().replaceFirst('Exception: ', ''));
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = telegram;
    if (widget.officialDocument) {
      return OfficialTelegramDocumentPage(
        api: widget.api,
        telegramId: widget.telegramId,
        onEdit: _editTelegram,
        onDelete: _deleteTelegram,
        canReissue: !_managementExpired,
        canOperate: _canOperate,
        isAdmin: _isAdmin,
        onWorkflowChanged: load,
        onSubmitForReview: _canOperate && data?['status'] == 'draft'
            ? () async {
                await widget.api.call(
                  'telegrams.transition',
                  mutation: true,
                  input: {'id': widget.telegramId, 'toStatus': 'submitted'},
                );
                await load();
              }
            : null,
      );
    }
    final displaySerial = getTelegramDisplaySerial(data ?? const {}, null);
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: Theme.of(context).colorScheme.surface,
          foregroundColor: Theme.of(context).colorScheme.onSurface,
          title: const Text(
            'تفاصيل البرقية',
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
          actions: [
            IconButton(
              tooltip: 'معاينة وطباعة الوثيقة الرسمية',
              onPressed: loading || data == null
                  ? null
                  : () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => OfficialTelegramDocumentPage(
                          api: widget.api,
                          telegramId: widget.telegramId,
                        ),
                      ),
                    ),
              icon: const Icon(Icons.print_outlined),
            ),
            IconButton(
              tooltip: 'تعديل البرقية',
              onPressed: loading || data == null ? null : _editTelegram,
              icon: const Icon(Icons.edit_outlined),
            ),
            IconButton(
              tooltip: 'حذف البرقية نهائيًا',
              onPressed: loading || data == null ? null : _deleteTelegram,
              icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
            ),
          ],
        ),
        body: loading
            ? const Center(child: CircularProgressIndicator())
            : error != null && data == null
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              )
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: navy,
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'برقية رقم: $displaySerial',
                          style: const TextStyle(
                            fontFamily: 'Cairo',
                            color: brandBlue,
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '${data?['subject'] ?? 'بدون موضوع'}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Align(
                          alignment: Alignment.centerRight,
                          child: Chip(
                            label: Text(
                              _statusLabel(data?['status'] ?? 'draft'),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  _infoCard('بيانات البرقية', [
                    _infoRow(
                      'الجهة المرسلة',
                      data?['senderOrganizationName'] ??
                          data?['organizationName'] ??
                          '—',
                    ),
                    _infoRow('الجهة المستلمة', data?['recipient'] ?? '—'),
                    _infoRow(
                      'الأسبقية',
                      _priorityLabel(data?['priority'] ?? 'normal'),
                    ),
                    _infoRow(
                      'درجة السرية',
                      _classificationLabel(data?['classification'] ?? 'normal'),
                    ),
                    _infoRow(
                      'التصنيف',
                      _categoryLabel(data?['category'] ?? 'administrative'),
                    ),
                    _infoRow(
                      'تاريخ الإنشاء',
                      _formatDate(data?['createdAt'] ?? '—'),
                    ),
                    if (data?['creatorName'] != null)
                      _infoRow('منشئ البرقية', data?['creatorName']),
                  ]),
                  const SizedBox(height: 12),
                  _infoCard('نص البرقية', [
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        '${data?['body'] ?? 'لا يوجد نص'}',
                        style: const TextStyle(fontSize: 15, height: 1.7),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 12),
                  _versionsCard(),
                  const SizedBox(height: 12),
                  TelegramActionsPanel(
                    api: widget.api,
                    telegramId: widget.telegramId,
                    telegramStatus: '${data?['status'] ?? 'draft'}',
                    canOperate: _canOperate,
                    isAdmin: _isAdmin,
                    onChanged: load,
                  ),
                  const SizedBox(height: 12),
                  TelegramRoutesPanel(
                    api: widget.api,
                    telegramId: widget.telegramId,
                    canOperate: _canOperate,
                    onChanged: load,
                  ),
                ],
              ),
      ),
    );
  }

  Widget _versionsCard() => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'إصدارات الوثيقة (${_versions.length})',
            style: const TextStyle(
              color: navy,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
          ),
          if (_versionsLoading)
            const Padding(
              padding: EdgeInsets.all(12),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_versionsError != null)
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'تعذر تحميل سجل الإصدارات: $_versionsError',
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: _loadVersions,
                    icon: const Icon(Icons.refresh),
                    label: const Text('إعادة المحاولة'),
                  ),
                ),
              ],
            )
          else if (_versions.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('لا توجد إصدارات سابقة محفوظة لهذه الوثيقة.'),
            )
          else
            ..._versions.map((version) {
              final number = int.tryParse('${version['versionNumber'] ?? ''}');
              final snapshot = version['snapshot'] is Map
                  ? Map<String, dynamic>.from(version['snapshot'] as Map)
                  : const <String, dynamic>{};
              final selected = _selectedVersionNumber == number;
              return ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(selected ? Icons.visibility : Icons.history),
                title: Text(
                  'الإصدار ${number ?? '—'}${selected ? ' · التفاصيل المعروضة' : ''}',
                ),
                subtitle: Text(
                  '${version['changeReason'] ?? 'تعديل الوثيقة'} · '
                  '${_formatDate(version['createdAt'] ?? '—')}\n'
                  '${snapshot['subject'] ?? '—'}'
                  '${selected ? '\nالجهة المستلمة: ${snapshot['recipient'] ?? '—'}\nالحالة: ${snapshot['status'] ?? '—'}\nالنص: ${snapshot['body'] ?? '—'}' : ''}',
                ),
                isThreeLine: selected,
                trailing: TextButton(
                  onPressed: number == null
                      ? null
                      : () => setState(
                          () =>
                              _selectedVersionNumber = selected ? null : number,
                        ),
                  child: Text(selected ? 'إخفاء التفاصيل' : 'عرض التفاصيل'),
                ),
              );
            }),
        ],
      ),
    ),
  );

  Widget _infoCard(String title, List<Widget> children) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: navy,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
          ),
          ...children,
        ],
      ),
    ),
  );
  Widget _infoRow(String label, dynamic value) => Padding(
    padding: const EdgeInsets.only(top: 10),
    child: Row(
      children: [
        SizedBox(
          width: 125,
          child: Text(
            label,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              fontSize: 12,
            ),
          ),
        ),
        Expanded(
          child: Text(
            '$value',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}

class CreateTelegramSheet extends StatefulWidget {
  const CreateTelegramSheet({super.key, required this.api});
  final PoliceApi api;
  @override
  State<CreateTelegramSheet> createState() => _CreateTelegramSheetState();
}

class _CreateTelegramSheetState extends State<CreateTelegramSheet> {
  final subject = TextEditingController();
  final recipient = TextEditingController();
  final body = TextEditingController();
  bool busy = false;
  String priority = 'normal';
  String classification = 'normal';
  String category = 'administrative';
  String? error;

  Future<void> submit() async {
    if (subject.text.trim().length < 2 ||
        recipient.text.trim().length < 2 ||
        body.text.trim().length < 3) {
      setState(() => error = 'أكمل الموضوع والجهة ونص البرقية');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.call(
        'telegrams.create',
        mutation: true,
        input: {
          'subject': subject.text.trim(),
          'recipient': recipient.text.trim(),
          'body': body.text.trim(),
          'classification': classification,
          'priority': priority,
          'category': category,
        },
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Padding(
      padding: EdgeInsets.only(
        left: 18,
        right: 18,
        top: 18,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 18,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'إنشاء برقية جديدة',
                    style: TextStyle(
                      color: navy,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            TextField(
              controller: subject,
              spellCheckConfiguration: const SpellCheckConfiguration.disabled(),
              autocorrect: false,
              enableSuggestions: false,
              decoration: const InputDecoration(
                labelText: 'موضوع البرقية',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: recipient,
              spellCheckConfiguration: const SpellCheckConfiguration.disabled(),
              autocorrect: false,
              enableSuggestions: false,
              decoration: const InputDecoration(
                labelText: 'الجهة المستلمة',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: priority,
              decoration: const InputDecoration(
                labelText: 'الأسبقية',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'urgent', child: Text('عاجلة')),
                DropdownMenuItem(value: 'normal', child: Text('عادية')),
                DropdownMenuItem(value: 'slow', child: Text('بطيئة')),
              ],
              onChanged: (value) {
                if (value != null) setState(() => priority = value);
              },
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: classification,
              decoration: const InputDecoration(
                labelText: 'درجة السرية',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'normal', child: Text('عادية')),
                DropdownMenuItem(value: 'secret', child: Text('سري')),
              ],
              onChanged: (value) {
                if (value != null) setState(() => classification = value);
              },
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: category,
              decoration: const InputDecoration(
                labelText: 'تصنيف البرقية',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'administrative', child: Text('إداري')),
                DropdownMenuItem(value: 'criminal', child: Text('جنائي')),
                DropdownMenuItem(value: 'traffic', child: Text('مروري')),
                DropdownMenuItem(value: 'security', child: Text('أمني')),
                DropdownMenuItem(value: 'tactical', child: Text('عملياتي')),
                DropdownMenuItem(
                  value: 'intelligence',
                  child: Text('استخباراتي'),
                ),
                DropdownMenuItem(value: 'emergency', child: Text('طوارئ')),
                DropdownMenuItem(
                  value: 'public_order',
                  child: Text('حفظ النظام'),
                ),
                DropdownMenuItem(
                  value: 'personnel',
                  child: Text('شؤون الأفراد'),
                ),
                DropdownMenuItem(value: 'logistics', child: Text('إمداد ودعم')),
                DropdownMenuItem(
                  value: 'training',
                  child: Text('تدريب وتأهيل'),
                ),
                DropdownMenuItem(
                  value: 'community',
                  child: Text('مجتمعي وشكاوى'),
                ),
                DropdownMenuItem(value: 'other', child: Text('أخرى')),
              ],
              onChanged: (value) {
                if (value != null) setState(() => category = value);
              },
            ),
            const SizedBox(height: 10),
            TextField(
              controller: body,
              minLines: 5,
              maxLines: null,
              keyboardType: TextInputType.multiline,
              textInputAction: TextInputAction.newline,
              textDirection: TextDirection.rtl,
              textAlignVertical: TextAlignVertical.top,
              spellCheckConfiguration: const SpellCheckConfiguration.disabled(),
              autocorrect: false,
              enableSuggestions: false,
              decoration: const InputDecoration(
                labelText: 'نص البرقية',
                alignLabelWithHint: true,
                border: OutlineInputBorder(),
              ),
            ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(error!, style: const TextStyle(color: Colors.red)),
              ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: busy ? null : submit,
              icon: const Icon(Icons.send),
              label: Text(busy ? 'جارٍ الإرسال...' : 'إرسال البرقية'),
            ),
          ],
        ),
      ),
    ),
  );
}
