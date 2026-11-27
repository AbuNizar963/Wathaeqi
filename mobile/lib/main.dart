import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_quill/flutter_quill.dart'
    show FlutterQuillLocalizations;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import './features/auth_session/app_lock.dart';

import 'api.dart';
import 'document_studio_page.dart';
import 'document_studio_outbox.dart';
import 'app_theme.dart';
import 'widgets/wathaeqi_brand_mark.dart';
import 'app_update_page.dart';
import 'app_update_service.dart';
import './features/admin/mobile_access_policy.dart';
import 'mobile_pages.dart';
import './features/admin/native_operations_page.dart';
import './features/admin/native_owner_dashboard_page.dart';
import './features/users/native_user_management_page.dart';
import './features/platform_settings/platform_document_settings_page.dart';

import './features/notifications/push_notifications.dart';
import 'public_pages.dart';
import 'telegram_outbox.dart';
import 'telegram_outbox_page.dart';
import './features/notifications/toast.dart';

const navy = AppPalette.navy;
const brandBlue = AppPalette.brandBlue;
const canvas = AppPalette.canvas;

void main() {
  WathaeqiApp.restoreThemeMode();
  runApp(const WathaeqiApp());
}

class WathaeqiApp extends StatelessWidget {
  const WathaeqiApp({super.key, this.api});

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
                        child: WathaeqiBrandMark(
                          size: 78,
                          borderRadius: BorderRadius.circular(39),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'وثائقك. منظّمة وواضحة.',
                      style: TextStyle(
                        color: navy,
                        fontSize: 27,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'سجّل الدخول للوصول إلى وثائقك وقوالبك وملفاتك المحفوظة بأمان.',
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
  String? activeOrganizationName;
  String? activeOrganizationRole;
  bool activeOrganizationIsActive = false;
  bool activeOrganizationIsOwner = false;
  int unreadNotificationCount = 0;
  final push = PushNotificationService();
  late final TelegramOutbox _outbox;
  final _documentWorkspaceKey = GlobalKey<DocumentStudioPageState>();
  late final DocumentStudioOutbox _documentStudioOutbox;
  bool _outboxSyncInProgress = false;
  StreamSubscription<ApiMutationEvent>? _mutationSubscription;
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
    unawaited(
      push.initialize(
        onAppUpdate: _openAppUpdate,
        onOpenNotifications: _showNotificationsPreview,
      ),
    );
  }

  void _handleMutation(ApiMutationEvent event) {
    if (!mounted) return;
    if (event.procedure == 'organizations.selectWorkplace') {
      unawaited(_refreshOrganizationContext());
    }
    if (event.procedure.startsWith('workspace.notifications.')) {
      unawaited(_loadUnreadNotificationCount());
    }
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

  Future<void> _syncOutbox({bool showProgress = true}) async {
    if (_outboxSyncInProgress) return;
    if (mounted) {
      setState(() => _outboxSyncInProgress = true);
    } else {
      _outboxSyncInProgress = true;
    }

    try {
      // Only the document studio queue is synchronized. Legacy telegram
      // outbox entries remain local and are never sent in print-only mode.
      final documentResult = await _documentStudioOutbox.sync();

      if (documentResult.synced > 0) _loadUnreadNotificationCount();
      if (!mounted || !showProgress) return;

      if (documentResult.lastError != null) {
        Toast.error(
          context,
          'تعذرت مزامنة الوثائق: ${documentResult.lastError}',
        );
      } else if (documentResult.synced > 0) {
        Toast.success(
          context,
          'تمت مزامنة ${documentResult.synced} عملية وثائق بنجاح',
        );
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
      final result = await widget.api.call('workspace.notifications.list');
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
      await widget.api.logout();
    } catch (_) {
      // PoliceApi.logout clears the local session in its finally block.
    }
    AppLockRuntime.setSessionActive(false);
    if (!mounted) return;
    navigator.pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginPage()),
    );
  }

  Future<void> _showNotificationsPreview() async {
    final notifications = widget.api.call('workspace.notifications.list');
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
                            final notificationId = notification['id']
                                ?.toString();
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
                              onTap: !read && notificationId != null
                                  ? () async {
                                      try {
                                        await widget.api.call(
                                          'workspace.notifications.markRead',
                                          mutation: true,
                                          input: {'id': notificationId},
                                        );
                                        await _loadUnreadNotificationCount();
                                      } catch (_) {
                                        // Keep the preview usable if marking
                                        // a notification as read fails.
                                      }
                                      if (dialogContext.mounted) {
                                        Navigator.pop(dialogContext);
                                      }
                                    }
                                  : null,
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
                        _pushPage(NotificationsPage(api: widget.api));
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

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    final mutationSubscription = _mutationSubscription;
    if (mutationSubscription != null) {
      unawaited(mutationSubscription.cancel());
    }
    push.dispose();
    super.dispose();
  }

  Future<void> _refreshOrganizationContext() async {
    try {
      final value = await widget.api.call('organizations.context');
      if (value is! Map) return;
      if (!mounted) return;
      setState(() {
        activeOrganizationName = (value['organizationName'] ?? value['name'])
            ?.toString();
        activeOrganizationRole = value['role']?.toString();
        activeOrganizationIsActive = value['isActive'] == true;
        activeOrganizationIsOwner = value['isOwner'] == true;
      });
    } catch (_) {
      // Keep the last verified organization context when offline.
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
            WathaeqiBrandMark(
              size: 36,
              borderRadius: BorderRadius.circular(10),
            ),
            const SizedBox(width: 8),
            const Flexible(
              child: Text(
                'مساحة الوثائق',
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
            onSelected: WathaeqiApp.setThemeMode,
            itemBuilder: (context) {
              final selectedMode = WathaeqiApp.themeMode;
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
                    title: 'إعدادات الترويسة والطباعة',
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
              selectedTileColor: AppPalette.sidebarAccent,
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
                      WathaeqiBrandMark(
                        size: 38,
                        borderRadius: BorderRadius.circular(12),
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
                                color: AppPalette.gold,
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
                  leading: const Icon(LucideIcons.fileText),
                  title: const Text('مساحة الوثائق'),
                  selected: true,
                  onTap: () => Navigator.pop(context),
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
              ],
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        heroTag: 'create-document-fab',
        tooltip: 'إنشاء وثيقة',
        backgroundColor: Theme.of(context).colorScheme.primary,
        foregroundColor: Theme.of(context).colorScheme.onPrimary,
        elevation: 4,
        onPressed: () => _documentWorkspaceKey.currentState?.createDocument(),
        child: const Icon(LucideIcons.plus),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      body: DocumentStudioPage(
        key: _documentWorkspaceKey,
        api: widget.api,
        outbox: _documentStudioOutbox,
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
