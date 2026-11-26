import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import './features/auth_session/app_lock.dart';

import 'api.dart';
import 'features/organizations/organization_logo_upload.dart';
import 'features/organizations/organization_logo_preview.dart';
import 'app_theme.dart';
import './features/reports/audit_log_presentation.dart';
import './features/notifications/toast.dart';

String _errorMessage(Object error) =>
    error.toString().replaceFirst('Exception: ', '');

String _stringValue(dynamic value, [String fallback = '—']) {
  final text = '$value'.trim();
  return text.isEmpty || text == 'null' ? fallback : text;
}

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key, required this.api});
  final PoliceApi api;

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  bool loading = true;
  String? error;
  List<dynamic> notifications = const [];
  Timer? _refreshTimer;

  int get _unreadCount => notifications
      .where((item) => item is Map && item['readAt'] == null)
      .length;

  @override
  void initState() {
    super.initState();
    load();
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => load(showLoading: false),
    );
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> load({bool showLoading = true}) async {
    if (showLoading && mounted) setState(() => loading = true);
    try {
      final result = await widget.api.call('workspace.notifications.list');
      if (!mounted) return;
      setState(() {
        notifications = result is List ? result : const [];
        error = null;
      });
    } catch (exception) {
      if (mounted) setState(() => error = _errorMessage(exception));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  String _formatDate(dynamic value) {
    final date = DateTime.tryParse('$value');
    if (date == null) return '—';
    return DateFormat('yyyy/MM/dd HH:mm', 'en').format(date.toLocal());
  }

  Future<void> markRead(String id) async {
    try {
      await widget.api.call(
        'workspace.notifications.markRead',
        mutation: true,
        input: {'id': id},
      );
      if (!mounted) return;
      await load(showLoading: false);
    } catch (exception) {
      if (mounted) Toast.error(context, _errorMessage(exception));
    }
  }

  Future<void> markAllRead() async {
    if (_unreadCount == 0) return;
    try {
      await widget.api.call(
        'workspace.notifications.markAllRead',
        mutation: true,
      );
      if (!mounted) return;
      await load(showLoading: false);
      if (mounted) Toast.success(context, 'تم تعليم جميع الإشعارات كمقروءة');
    } catch (exception) {
      if (mounted) Toast.error(context, _errorMessage(exception));
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        title: const Text(
          'الإشعارات',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(
            tooltip: 'تعليم الكل كمقروء',
            onPressed: loading || _unreadCount == 0 ? null : markAllRead,
            icon: const Icon(Icons.done_all_rounded),
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  if (error != null) _ErrorCard(message: error!),
                  if (notifications.isEmpty && error == null)
                    const _EmptyCard(message: 'لا توجد إشعارات جديدة')
                  else
                    ...notifications.map((item) {
                      final notification = Map<String, dynamic>.from(
                        item as Map,
                      );
                      final id = notification['id']?.toString();
                      final read = notification['readAt'] != null;
                      return Card(
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: read
                                ? Theme.of(context)
                                      .colorScheme
                                      .surfaceContainerHighest
                                : AppPalette.gold.withValues(alpha: 0.18),
                            child: Icon(
                              read
                                  ? Icons.notifications_none
                                  : Icons.notifications_active,
                              color: read
                                  ? Theme.of(context).colorScheme.onSurfaceVariant
                                  : Theme.of(context).colorScheme.tertiary,
                            ),
                          ),
                          title: Text(
                            _stringValue(notification['title'], 'إشعار'),
                            style: TextStyle(
                              fontWeight: read
                                  ? FontWeight.w600
                                  : FontWeight.w900,
                            ),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _stringValue(
                                  notification['body'] ??
                                      notification['content'],
                                ),
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _formatDate(notification['createdAt']),
                                textDirection: TextDirection.ltr,
                                style: TextStyle(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurfaceVariant,
                                  fontSize: 11,
                                  fontFeatures: const [
                                    ui.FontFeature.tabularFigures(),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          isThreeLine: true,
                          onTap: !read && id != null
                              ? () => markRead(id)
                              : null,
                          trailing: !read && id != null
                              ? IconButton(
                                  tooltip: 'تحديد التنبيه كمقروء',
                                  onPressed: () => markRead(id),
                                  icon: const Icon(Icons.done),
                                )
                              : null,
                        ),
                      );
                    }),
                ],
              ),
            ),
    ),
  );
}

class ContactsPage extends StatefulWidget {
  const ContactsPage({super.key, required this.api});

  final PoliceApi api;

  @override
  State<ContactsPage> createState() => _ContactsPageState();
}

class _ContactsPageState extends State<ContactsPage> {
  final _searchController = TextEditingController();
  List<Map<String, dynamic>> _contacts = const [];
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load({bool showLoading = true}) async {
    if (showLoading && mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final result = await widget.api.call('workspace.contacts.list');
      final rows = result is List
          ? result
          : result is Map && result['items'] is List
          ? result['items'] as List
          : const <dynamic>[];
      if (!mounted) return;
      setState(() {
        _contacts = rows
            .whereType<Map>()
            .map((row) => Map<String, dynamic>.from(row))
            .toList();
        _error = null;
      });
    } catch (exception) {
      if (mounted) setState(() => _error = _errorMessage(exception));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _filteredContacts {
    final term = _searchController.text.trim().toLowerCase();
    if (term.isEmpty) return _contacts;
    return _contacts.where((contact) {
      return [
        contact['name'],
        contact['email'],
        contact['phone'],
        contact['organization'],
      ].whereType<Object>().any(
        (value) => value.toString().toLowerCase().contains(term),
      );
    }).toList();
  }

  Future<void> _editOrCreate({Map<String, dynamic>? contact}) async {
    final name = TextEditingController(
      text: _stringValue(contact?['name'], ''),
    );
    final email = TextEditingController(
      text: _stringValue(contact?['email'], ''),
    );
    final phone = TextEditingController(
      text: _stringValue(contact?['phone'], ''),
    );
    final organization = TextEditingController(
      text: _stringValue(contact?['organization'], ''),
    );

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          title: Text(
            contact == null ? 'إضافة جهة اتصال' : 'تعديل جهة الاتصال',
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: name,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(labelText: 'الاسم'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: organization,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(labelText: 'الجهة'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: phone,
                  textDirection: TextDirection.ltr,
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(labelText: 'رقم الهاتف'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: email,
                  textDirection: TextDirection.ltr,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'البريد الإلكتروني',
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('إلغاء'),
            ),
            FilledButton.icon(
              onPressed: () => Navigator.pop(dialogContext, true),
              icon: const Icon(Icons.save_outlined),
              label: const Text('حفظ'),
            ),
          ],
        ),
      ),
    );

    if (!mounted || confirmed != true) {
      name.dispose();
      email.dispose();
      phone.dispose();
      organization.dispose();
      return;
    }

    if (name.text.trim().isEmpty) {
      Toast.error(context, 'أدخل اسم جهة الاتصال');
      name.dispose();
      email.dispose();
      phone.dispose();
      organization.dispose();
      return;
    }

    setState(() => _saving = true);
    try {
      final values = {
        'name': name.text.trim(),
        'email': email.text.trim(),
        'phone': phone.text.trim(),
        'organization': organization.text.trim(),
      };
      final id = contact?['id']?.toString();
      if (id == null || id.isEmpty) {
        await widget.api.call(
          'workspace.contacts.create',
          mutation: true,
          input: values,
        );
      } else {
        await widget.api.call(
          'workspace.contacts.update',
          mutation: true,
          input: {'id': id, ...values},
        );
      }
      if (!mounted) return;
      await _load(showLoading: false);
      if (mounted) {
        Toast.success(
          context,
          id == null ? 'تمت إضافة جهة الاتصال' : 'تم تحديث جهة الاتصال',
        );
      }
    } catch (exception) {
      if (mounted) Toast.error(context, _errorMessage(exception));
    } finally {
      name.dispose();
      email.dispose();
      phone.dispose();
      organization.dispose();
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete(Map<String, dynamic> contact) async {
    final id = contact['id']?.toString();
    if (id == null || id.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          title: const Text('حذف جهة الاتصال'),
          content: Text(
            'هل تريد حذف "${_stringValue(contact['name'])}" من الدليل؟',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: Theme.of(dialogContext).colorScheme.error,
              ),
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('حذف'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _saving = true);
    try {
      await widget.api.call(
        'workspace.contacts.delete',
        mutation: true,
        input: {'id': id},
      );
      if (!mounted) return;
      await _load(showLoading: false);
      if (mounted) Toast.success(context, 'تم حذف جهة الاتصال');
    } catch (exception) {
      if (mounted) Toast.error(context, _errorMessage(exception));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final contacts = _filteredContacts;
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: const Text(
            'جهات الاتصال',
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
          actions: [
            IconButton(
              tooltip: 'تحديث الدليل',
              onPressed: _loading || _saving ? null : _load,
              icon: const Icon(Icons.refresh),
            ),
            IconButton(
              tooltip: 'إضافة جهة اتصال',
              onPressed: _saving ? null : () => _editOrCreate(),
              icon: const Icon(Icons.person_add_alt_1_outlined),
            ),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(16),
                  children: [
                    TextField(
                      controller: _searchController,
                      onChanged: (_) => setState(() {}),
                      textInputAction: TextInputAction.search,
                      decoration: InputDecoration(
                        hintText: 'ابحث بالاسم أو الجهة أو الهاتف أو البريد',
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: _searchController.text.isEmpty
                            ? null
                            : IconButton(
                                tooltip: 'مسح البحث',
                                onPressed: () {
                                  _searchController.clear();
                                  setState(() {});
                                },
                                icon: const Icon(Icons.close),
                              ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (_error != null) _ErrorCard(message: _error!),
                    if (contacts.isEmpty && _error == null)
                      const _EmptyCard(message: 'لا توجد جهات اتصال مطابقة')
                    else
                      ...contacts.map((contact) {
                        final phone = _stringValue(contact['phone'], '');
                        final email = _stringValue(contact['email'], '');
                        final organization = _stringValue(
                          contact['organization'],
                          '',
                        );
                        return Card(
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundColor: Theme.of(context)
                                  .colorScheme
                                  .primaryContainer,
                              child: Icon(
                                Icons.contact_page_outlined,
                                color: Theme.of(context).colorScheme.primary,
                              ),
                            ),
                            title: Text(
                              _stringValue(contact['name']),
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (organization.isNotEmpty)
                                  Text('الجهة: $organization'),
                                if (phone.isNotEmpty)
                                  Text(
                                    phone,
                                    textDirection: TextDirection.ltr,
                                  ),
                                if (email.isNotEmpty)
                                  Text(
                                    email,
                                    textDirection: TextDirection.ltr,
                                  ),
                              ],
                            ),
                            trailing: PopupMenuButton<String>(
                              enabled: !_saving,
                              tooltip: 'إجراءات جهة الاتصال',
                              onSelected: (action) {
                                if (action == 'edit') {
                                  _editOrCreate(contact: contact);
                                } else if (action == 'delete') {
                                  _delete(contact);
                                }
                              },
                              itemBuilder: (context) => const [
                                PopupMenuItem(
                                  value: 'edit',
                                  child: Text('تعديل'),
                                ),
                                PopupMenuItem(
                                  value: 'delete',
                                  child: Text('حذف'),
                                ),
                              ],
                            ),
                          ),
                        );
                      }),
                  ],
                ),
              ),
      ),
    );
  }
}

class AuditLogPage extends StatefulWidget {
  const AuditLogPage({super.key, required this.api});

  final PoliceApi api;

  @override
  State<AuditLogPage> createState() => _AuditLogPageState();
}

class _AuditLogPageState extends State<AuditLogPage> {
  bool loading = true;
  String? error;
  List<dynamic> entries = const [];
  int total = 0;
  int page = 1;
  String search = '';
  String resourceId = '';
  String action = '';
  DateTime? from;
  DateTime? to;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    load();
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => load(showLoading: false),
    );
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> load({bool showLoading = true}) async {
    if (showLoading && mounted) setState(() => loading = true);
    try {
      final result = await widget.api.call(
        'auditLogs.search',
        allowOfflineCache: false,
        input: {
          'page': page,
          'pageSize': 50,
          if (search.trim().isNotEmpty) 'search': search.trim(),
          if (resourceId.trim().isNotEmpty) 'resourceId': resourceId.trim(),
          if (action.isNotEmpty) 'action': action,
          if (from != null) 'from': from!.toUtc().toIso8601String(),
          if (to != null)
            'to': DateTime(
              to!.year,
              to!.month,
              to!.day + 1,
            ).toUtc().toIso8601String(),
        },
      );
      if (!mounted) return;
      setState(() {
        entries = result is Map && result['items'] is List
            ? result['items'] as List
            : const [];
        total = result is Map && result['total'] is num
            ? (result['total'] as num).toInt()
            : entries.length;
        error = null;
      });
    } catch (exception) {
      if (mounted) setState(() => error = _errorMessage(exception));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  String _formatDate(dynamic value) {
    final date = DateTime.tryParse('$value');
    if (date == null) return '—';
    return DateFormat('yyyy/MM/dd HH:mm', 'en').format(date.toLocal());
  }

  List<Map<String, dynamic>> get _rows => entries
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList();

  bool get _hasFilters =>
      search.trim().isNotEmpty ||
      resourceId.trim().isNotEmpty ||
      action.isNotEmpty ||
      from != null ||
      to != null;

  Future<void> _pickDate({required bool isFrom}) async {
    final selected = await showDatePicker(
      context: context,
      initialDate: (isFrom ? from : to) ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      helpText: isFrom ? 'تاريخ بداية السجل' : 'تاريخ نهاية السجل',
    );
    if (selected == null || !mounted) return;
    setState(() {
      if (isFrom) {
        from = selected;
      } else {
        to = selected;
      }
      page = 1;
    });
    await load(showLoading: false);
  }

  void _applyFilters() {
    setState(() => page = 1);
    load(showLoading: false);
  }

  void _clearFilters() {
    setState(() {
      search = '';
      resourceId = '';
      action = '';
      from = null;
      to = null;
      page = 1;
    });
    load(showLoading: false);
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        title: const Text(
          'سجل الإجراءات',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(
            tooltip: 'تحديث السجل',
            onPressed: loading ? null : () => load(showLoading: false),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () => load(showLoading: false),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Row(
                        children: [
                          Icon(
                            Icons.history,
                            color: Theme.of(context).colorScheme.primary,
                            size: 28,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'سجل التدقيق المركزي',
                                  style: TextStyle(fontWeight: FontWeight.w900),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '$total نتيجة · قراءة فقط · يتحدث تلقائياً كل 5 ثوانٍ',
                                  style: TextStyle(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant,
                                    fontSize: 12,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'تُعرض الإجراءات والتفاصيل بالعربية؛ أما بيانات الشبكة والمعرّفات الفنية فهي اختيارية للمختصين.',
                                  style: TextStyle(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant,
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Column(
                      children: [
                        TextField(
                          onChanged: (value) => search = value,
                          onSubmitted: (_) => _applyFilters(),
                          decoration: InputDecoration(
                            prefixIcon: const Icon(Icons.search),
                            hintText: 'الموظف أو الإجراء أو رقم البرقية',
                            suffixIcon: IconButton(
                              tooltip: 'تطبيق البحث',
                              onPressed: _applyFilters,
                              icon: const Icon(Icons.search),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                onChanged: (value) => resourceId = value,
                                onSubmitted: (_) => _applyFilters(),
                                decoration: const InputDecoration(
                                  labelText: 'معرّف المورد أو رقم البرقية',
                                  prefixIcon: Icon(Icons.tag_outlined),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: DropdownButtonFormField<String>(
                                initialValue: action,
                                decoration: const InputDecoration(
                                  labelText: 'نوع الإجراء',
                                ),
                                items: [
                                  const DropdownMenuItem(
                                    value: '',
                                    child: Text('كل الإجراءات'),
                                  ),
                                  ...auditActionLabels.entries.map(
                                    (entry) => DropdownMenuItem(
                                      value: entry.key,
                                      child: Text(
                                        entry.value,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  ),
                                ],
                                onChanged: (value) {
                                  setState(() {
                                    action = value ?? '';
                                    page = 1;
                                  });
                                  load(showLoading: false);
                                },
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          children: [
                            TextButton.icon(
                              onPressed: () => _pickDate(isFrom: true),
                              icon: const Icon(Icons.calendar_today_outlined),
                              label: Text(
                                from == null
                                    ? 'من تاريخ'
                                    : '${from!.year}/${from!.month}/${from!.day}',
                              ),
                            ),
                            TextButton.icon(
                              onPressed: () => _pickDate(isFrom: false),
                              icon: const Icon(Icons.event_outlined),
                              label: Text(
                                to == null
                                    ? 'إلى تاريخ'
                                    : '${to!.year}/${to!.month}/${to!.day}',
                              ),
                            ),
                            if (_hasFilters)
                              TextButton.icon(
                                onPressed: _clearFilters,
                                icon: const Icon(Icons.filter_alt_off_outlined),
                                label: const Text('مسح الفلاتر'),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (error != null) _ErrorCard(message: error!),
                  if (error == null && _rows.isEmpty)
                    _EmptyCard(
                      message: !_hasFilters
                          ? 'لا توجد إجراءات مسجلة بعد'
                          : 'لا توجد نتائج مطابقة للبحث.',
                    ),
                  ..._rows.map((entry) {
                    final actionLabel = auditActionLabel(entry['action']);
                    final deviceLabel = auditDeviceLabel(entry['deviceType']);
                    final userAgent = auditUserAgentSummary(entry['userAgent']);
                    final metadataFields = readableAuditFields(
                      entry['metadata'],
                    );
                    final rawMetadata = rawAuditDetails(entry['metadata']);
                    final entitySummary = auditEntitySummary(
                      entry['entityType'],
                      entry['entityId'],
                    );
                    final ipAddress = _stringValue(
                      entry['ipAddress'],
                      'غير متاح',
                    );
                    final beforeFields = readableAuditFields(
                      entry['beforeState'],
                    );
                    final afterFields = readableAuditFields(
                      entry['afterState'],
                    );
                    final rawBeforeState = rawAuditDetails(
                      entry['beforeState'],
                    );
                    final rawAfterState = rawAuditDetails(entry['afterState']);
                    final reason = _stringValue(entry['reason'], '');
                    final actorSummary = [
                      _stringValue(entry['actorName'], 'مستخدم غير معروف'),
                      _stringValue(entry['actorRank'], 'الرتبة غير محددة'),
                      auditRoleLabel(entry['actorRole']),
                    ].join(' · ');
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                CircleAvatar(
                                  backgroundColor: Theme.of(context)
                                      .colorScheme
                                      .secondaryContainer,
                                  child: Icon(
                                    Icons.history,
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSecondaryContainer,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        actionLabel,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w900,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        'وقت تسجيل الإجراء:',
                                        style: TextStyle(
                                          fontSize: 11,
                                          color: Theme.of(context)
                                              .colorScheme
                                              .onSurfaceVariant,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Directionality(
                                        textDirection: TextDirection.ltr,
                                        child: Text(
                                          _formatDate(entry['createdAt']),
                                          style: TextStyle(
                                            fontSize: 11,
                                            fontFeatures: const [
                                              ui.FontFeature.tabularFigures(),
                                            ],
                                            color: Theme.of(context)
                                                .colorScheme
                                                .onSurfaceVariant,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Text(
                                  deviceLabel,
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                            const Divider(height: 24),
                            _AuditDetail(
                              label: 'منفّذ الإجراء',
                              value: actorSummary,
                            ),
                            const SizedBox(height: 8),
                            _AuditDetail(
                              label: 'السجل المعني',
                              value: entitySummary,
                            ),
                            const SizedBox(height: 8),
                            _AuditDetail(
                              label: 'الجهاز المستخدم',
                              value: '$deviceLabel · $userAgent',
                            ),
                            if (reason.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              _AuditDetail(label: 'سبب الإجراء', value: reason),
                            ],
                            if (metadataFields.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              ExpansionTile(
                                tilePadding: EdgeInsets.zero,
                                childrenPadding: const EdgeInsets.only(
                                  bottom: 8,
                                ),
                                title: const Text(
                                  'تفاصيل العملية بلغة واضحة',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                children: [
                                  ...metadataFields.map(
                                    (field) => Padding(
                                      padding: const EdgeInsets.only(bottom: 8),
                                      child: _AuditDetail(
                                        label: field.label,
                                        value: field.value,
                                      ),
                                    ),
                                  ),
                                  if (rawMetadata.isNotEmpty)
                                    ExpansionTile(
                                      tilePadding: EdgeInsets.zero,
                                      title: const Text(
                                        'البيانات الأصلية للمختصين',
                                        style: TextStyle(fontSize: 12),
                                      ),
                                      children: [
                                        SelectableText(
                                          rawMetadata,
                                          style: const TextStyle(
                                            fontFamily: 'monospace',
                                            fontSize: 10,
                                          ),
                                        ),
                                      ],
                                    ),
                                ],
                              ),
                            ],
                            if (beforeFields.isNotEmpty ||
                                afterFields.isNotEmpty)
                              ExpansionTile(
                                tilePadding: EdgeInsets.zero,
                                title: const Text(
                                  'التغييرات المسجلة قبل الإجراء وبعده',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                children: [
                                  if (beforeFields.isNotEmpty) ...[
                                    const Align(
                                      alignment: Alignment.centerRight,
                                      child: Text(
                                        'قبل التعديل',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    ),
                                    ...beforeFields.map(
                                      (field) => _AuditDetail(
                                        label: field.label,
                                        value: field.value,
                                      ),
                                    ),
                                    if (rawBeforeState.isNotEmpty)
                                      ExpansionTile(
                                        tilePadding: EdgeInsets.zero,
                                        title: const Text(
                                          'البيانات الأصلية للمختصين',
                                          style: TextStyle(fontSize: 12),
                                        ),
                                        children: [
                                          SelectableText(
                                            rawBeforeState,
                                            style: const TextStyle(
                                              fontFamily: 'monospace',
                                              fontSize: 10,
                                            ),
                                          ),
                                        ],
                                      ),
                                  ],
                                  if (afterFields.isNotEmpty) ...[
                                    Padding(
                                      padding: const EdgeInsets.only(top: 12),
                                      child: const Align(
                                        alignment: Alignment.centerRight,
                                        child: Text(
                                          'بعد التعديل',
                                          style: TextStyle(
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                      ),
                                    ),
                                    ...afterFields.map(
                                      (field) => _AuditDetail(
                                        label: field.label,
                                        value: field.value,
                                      ),
                                    ),
                                    if (rawAfterState.isNotEmpty)
                                      ExpansionTile(
                                        tilePadding: EdgeInsets.zero,
                                        title: const Text(
                                          'البيانات الأصلية للمختصين',
                                          style: TextStyle(fontSize: 12),
                                        ),
                                        children: [
                                          SelectableText(
                                            rawAfterState,
                                            style: const TextStyle(
                                              fontFamily: 'monospace',
                                              fontSize: 10,
                                            ),
                                          ),
                                        ],
                                      ),
                                  ],
                                ],
                              ),
                            ExpansionTile(
                              tilePadding: EdgeInsets.zero,
                              title: const Text(
                                'معلومات فنية للمختصين',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              children: [
                                _AuditDetail(
                                  label: 'عنوان الشبكة (IP)',
                                  value: ipAddress,
                                ),
                                _AuditDetail(
                                  label: 'المتصفح ونظام الجهاز',
                                  value: userAgent,
                                ),
                                _AuditDetail(
                                  label: 'بصمة نزاهة السجل',
                                  value: _stringValue(
                                    entry['entryHash'],
                                    'غير متاحة',
                                  ),
                                ),
                                _AuditDetail(
                                  label: 'معرّف منفّذ الإجراء',
                                  value: _stringValue(
                                    entry['actorUserId'],
                                    'غير متاح',
                                  ),
                                ),
                                if (_stringValue(
                                  entry['userAgent'],
                                  '',
                                ).isNotEmpty)
                                  ExpansionTile(
                                    tilePadding: EdgeInsets.zero,
                                    title: const Text(
                                      'بيانات المتصفح الأصلية',
                                      style: TextStyle(fontSize: 12),
                                    ),
                                    children: [
                                      SelectableText(
                                        _stringValue(entry['userAgent']),
                                        style: const TextStyle(fontSize: 10),
                                      ),
                                    ],
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
                  if (total > 50)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('الصفحة $page'),
                          Row(
                            children: [
                              TextButton(
                                onPressed: page <= 1
                                    ? null
                                    : () {
                                        setState(() => page -= 1);
                                        load(showLoading: false);
                                      },
                                child: const Text('الأحدث'),
                              ),
                              TextButton(
                                onPressed: page * 50 >= total
                                    ? null
                                    : () {
                                        setState(() => page += 1);
                                        load(showLoading: false);
                                      },
                                child: const Text('الأقدم'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
    ),
  );
}

class _AuditDetail extends StatelessWidget {
  const _AuditDetail({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: TextStyle(
          fontSize: 11,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
      const SizedBox(height: 2),
      SelectableText(value, style: const TextStyle(fontSize: 12)),
    ],
  );
}

class ProfileSettingsPage extends StatefulWidget {
  const ProfileSettingsPage({
    super.key,
    required this.api,
    required this.onLogout,
    required this.onProfileUpdated,
  });
  final PoliceApi api;
  final Future<void> Function() onLogout;
  final ValueChanged<Map<String, dynamic>> onProfileUpdated;

  @override
  State<ProfileSettingsPage> createState() => _ProfileSettingsPageState();
}

class _ProfileSettingsPageState extends State<ProfileSettingsPage> {
  final name = TextEditingController();
  final badge = TextEditingController();
  final phone = TextEditingController();
  final rank = TextEditingController();
  final unit = TextEditingController();
  final bio = TextEditingController();
  final currentPassword = TextEditingController();
  final newPassword = TextEditingController();
  final confirmPassword = TextEditingController();
  bool loading = true;
  bool saving = false;
  bool mustChangePassword = false;
  bool _profileLoadFailed = false;
  String? error;

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    for (final controller in [
      name,
      badge,
      phone,
      rank,
      unit,
      bio,
      currentPassword,
      newPassword,
      confirmPassword,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> load() async {
    if (mounted) {
      setState(() {
        loading = true;
        _profileLoadFailed = false;
        error = null;
      });
    }
    try {
      final result = await widget.api.call('profile.get');
      final profile = Map<String, dynamic>.from(result as Map);
      name.text = _stringValue(profile['name'], '');
      badge.text = _stringValue(profile['badgeNumber'], '');
      phone.text = _stringValue(profile['phone'], '');
      rank.text = _stringValue(profile['rank'], '');
      unit.text = _stringValue(profile['unit'], '');
      bio.text = _stringValue(profile['bio'], '');
      mustChangePassword = profile['mustChangePassword'] == true;
    } catch (exception) {
      if (mounted) {
        setState(() {
          _profileLoadFailed = true;
          error = _errorMessage(exception);
        });
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> saveProfile() async {
    if (name.text.trim().length < 2) {
      setState(() => error = 'الاسم الكامل يجب ألا يقل عن محرفين.');
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await widget.api.call(
        'profile.update',
        mutation: true,
        input: {
          'name': name.text.trim(),
          'badgeNumber': badge.text.trim().isEmpty ? null : badge.text.trim(),
          'phone': phone.text.trim().isEmpty ? null : phone.text.trim(),
          'rank': rank.text.trim().isEmpty ? null : rank.text.trim(),
          'unit': unit.text.trim().isEmpty ? null : unit.text.trim(),
          'bio': bio.text.trim().isEmpty ? null : bio.text.trim(),
        },
      );
      widget.onProfileUpdated({'name': name.text.trim()});
      if (mounted) {
        Toast.success(context, 'تم حفظ الملف الشخصي');
      }
    } catch (exception) {
      if (mounted) setState(() => error = _errorMessage(exception));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> changePassword() async {
    if (currentPassword.text.isEmpty || newPassword.text.length < 12) {
      setState(() => error = 'كلمة المرور الجديدة يجب ألا تقل عن 12 محرفًا.');
      return;
    }
    if (newPassword.text != confirmPassword.text) {
      setState(() => error = 'تأكيد كلمة المرور غير مطابق');
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await widget.api.call(
        'profile.changePassword',
        mutation: true,
        input: {
          'currentPassword': currentPassword.text,
          'newPassword': newPassword.text,
        },
      );
      currentPassword.clear();
      newPassword.clear();
      confirmPassword.clear();
      mustChangePassword = false;
      widget.onProfileUpdated({
        'name': name.text.trim(),
        'mustChangePassword': false,
      });
      if (mounted) {
        Toast.success(context, 'تم تغيير كلمة المرور');
      }
    } catch (exception) {
      if (mounted) setState(() => error = _errorMessage(exception));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        title: const Text(
          'الإعدادات والملف الشخصي',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : _profileLoadFailed
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.person_off_outlined,
                      size: 48,
                      color: Theme.of(context).colorScheme.error,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'تعذر تحميل بيانات الملف الشخصي',
                      style: Theme.of(context).textTheme.titleMedium,
                      textAlign: TextAlign.center,
                    ),
                    if (error != null) ...[
                      const SizedBox(height: 8),
                      Text(error!, textAlign: TextAlign.center),
                    ],
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: load,
                      icon: const Icon(Icons.refresh),
                      label: const Text('إعادة المحاولة'),
                    ),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (mustChangePassword)
                  Card(
                    color: Theme.of(context).colorScheme.tertiaryContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Text(
                        'هذه كلمة مرور مؤقتة للحساب الرئيسي للجهة. يجب تغييرها قبل متابعة العمل.',
                        style: TextStyle(
                          color: Theme.of(context)
                              .colorScheme
                              .onTertiaryContainer,
                          fontWeight: FontWeight.w700,
                          height: 1.5,
                        ),
                      ),
                    ),
                  ),
                if (mustChangePassword) const SizedBox(height: 14),
                if (error != null) _ErrorCard(message: error!),
                const AppLockSettingsSection(),
                const SizedBox(height: 14),
                _FormCard(
                  title: 'المعلومات الشخصية',
                  children: [
                    _input(name, 'الاسم الكامل', maxLength: 255),
                    _input(badge, 'الرقم الوظيفي', maxLength: 80),
                    _input(
                      phone,
                      'رقم الهاتف',
                      maxLength: 32,
                      keyboardType: TextInputType.phone,
                    ),
                    _input(rank, 'الرتبة', maxLength: 120),
                    _input(unit, 'القسم أو الوحدة', maxLength: 255),
                    _input(bio, 'نبذة تعريفية', maxLines: 4, maxLength: 1000),
                    const SizedBox(height: 8),
                    FilledButton.icon(
                      onPressed: saving || name.text.trim().length < 2
                          ? null
                          : saveProfile,
                      icon: const Icon(Icons.save_outlined),
                      label: const Text('حفظ البيانات'),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                _FormCard(
                  title: 'الأمان',
                  children: [
                    _input(
                      currentPassword,
                      'كلمة المرور الحالية',
                      obscure: true,
                      maxLength: 256,
                    ),
                    _input(
                      newPassword,
                      'كلمة المرور الجديدة',
                      obscure: true,
                      maxLength: 256,
                    ),
                    _input(
                      confirmPassword,
                      'تأكيد كلمة المرور',
                      obscure: true,
                      maxLength: 256,
                    ),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        '12 محرفًا على الأقل.',
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: saving ? null : changePassword,
                      icon: const Icon(Icons.lock_reset),
                      label: const Text('تغيير كلمة المرور'),
                    ),
                    const Divider(height: 28),
                    const ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        'إنهاء الجلسة',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        'يُسجّل خروجك من هذا الجهاز فورًا حتى قبل انتهاء مدة الشهر.',
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: saving ? null : widget.onLogout,
                      icon: Icon(
                        Icons.logout,
                        color: Theme.of(context).colorScheme.error,
                      ),
                      label: Text(
                        'تسجيل الخروج',
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
    ),
  );

  Widget _input(
    TextEditingController controller,
    String label, {
    bool obscure = false,
    int maxLines = 1,
    int? maxLength,
    TextInputType? keyboardType,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: TextField(
      controller: controller,
      obscureText: obscure,
      maxLines: obscure ? 1 : maxLines,
      maxLength: maxLength,
      keyboardType: keyboardType,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
    ),
  );
}

class _FormCard extends StatelessWidget {
  const _FormCard({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: TextStyle(
              color: Theme.of(context).colorScheme.primary,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    ),
  );
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Card(
    color: Theme.of(context).colorScheme.errorContainer,
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Text(
        message,
        style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer),
      ),
    ),
  );
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(22),
      child: Center(child: Text(message)),
    ),
  );
}

class DepartmentSettingsPage extends StatefulWidget {
  const DepartmentSettingsPage({super.key, required this.api});

  final PoliceApi api;

  @override
  State<DepartmentSettingsPage> createState() => _DepartmentSettingsPageState();
}

class _DepartmentSettingsPageState extends State<DepartmentSettingsPage> {
  final _departmentName = TextEditingController();
  final _unitName = TextEditingController();
  final _unitChiefRank = TextEditingController();
  final _unitChiefName = TextEditingController();
  final _serialPrefix = TextEditingController();
  final _incomingSerialPrefix = TextEditingController();
  final _serialStart = TextEditingController();
  final _incomingSerialStart = TextEditingController();

  static const _timeZones = <MapEntry<String, String>>[
    MapEntry('Asia/Riyadh', 'الرياض — Asia/Riyadh'),
    MapEntry('Asia/Damascus', 'دمشق — Asia/Damascus'),
    MapEntry('Europe/Istanbul', 'إسطنبول — Europe/Istanbul'),
    MapEntry('Asia/Amman', 'عمّان — Asia/Amman'),
    MapEntry('Asia/Baghdad', 'بغداد — Asia/Baghdad'),
    MapEntry('Africa/Cairo', 'القاهرة — Africa/Cairo'),
    MapEntry('UTC', 'التوقيت العالمي — UTC'),
  ];

  static const _dateFormats = <MapEntry<String, String>>[
    MapEntry('dd/MM/yyyy HH:mm:ss', 'يوم/شهر/سنة مع الثواني'),
    MapEntry('yyyy-MM-dd HH:mm:ss', 'سنة-شهر-يوم مع الثواني'),
    MapEntry('yyyy/MM/dd HH:mm:ss', 'سنة/شهر/يوم مع الثواني'),
    MapEntry('dd MMM yyyy HH:mm', 'يوم وشهر مختصر وسنة'),
  ];

  bool _loading = true;
  bool _saving = false;
  bool _uploadingLogo = false;
  String? _error;
  String? _logoUrl;
  Uint8List? _pendingLogoPreviewBytes;
  Uint8List? _savedLogoPreviewBytes;
  String _timezone = 'Asia/Riyadh';
  String _dateFormat = 'yyyy/MM/dd HH:mm:ss';
  String _timeFormat = '24';
  String _numberSystem = 'latin';
  Map<String, dynamic> _settings = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _departmentName.dispose();
    _unitName.dispose();
    _unitChiefRank.dispose();
    _unitChiefName.dispose();
    _serialPrefix.dispose();
    _incomingSerialPrefix.dispose();
    _serialStart.dispose();
    _incomingSerialStart.dispose();
    super.dispose();
  }

  String _text(dynamic value, [String fallback = '']) {
    if (value == null || '$value' == 'null') return fallback;
    return '$value';
  }

  List<MapEntry<String, String>> _withCurrent(
    List<MapEntry<String, String>> options,
    String current,
  ) {
    if (options.any((option) => option.key == current)) return options;
    return [MapEntry(current, current), ...options];
  }

  Future<Map<String, dynamic>> _withOrganizationLogo(
    Map<String, dynamic> settings,
  ) async {
    final resolved = Map<String, dynamic>.from(settings);
    final settingsOrganizationId = resolved['organizationId']
        ?.toString()
        .trim();
    final settingsLogo = resolved['logoUrl']?.toString().trim();
    // Keep the saved URL only as a fallback until the scoped endpoint resolves
    // the current organization's authorized logo URL.
    resolved['logoUrl'] = settingsLogo == null || settingsLogo.isEmpty
        ? null
        : settingsLogo;

    String? contextOrganizationId;
    try {
      final context = await widget.api.call('organizations.context');
      final candidate = context is Map
          ? context['organizationId']?.toString().trim()
          : null;
      if (candidate != null && candidate.isNotEmpty) {
        contextOrganizationId = candidate;
      }
    } catch (_) {
      // Platform owners may not have a membership-backed context. In that
      // case, fall back to the organization ID returned by settings.get.
    }

    // A null organizations.context is valid for a platform owner. Do not
    // return early: settings.get can still identify the selected workplace,
    // and organizations.logo authorizes access to that exact organization.
    final organizationId =
        contextOrganizationId ??
        (settingsOrganizationId != null && settingsOrganizationId.isNotEmpty
            ? settingsOrganizationId
            : null);
    if (organizationId == null) return resolved;

    resolved['organizationId'] = organizationId;
    if (contextOrganizationId != null &&
        settingsOrganizationId != null &&
        settingsOrganizationId.isNotEmpty &&
        settingsOrganizationId != contextOrganizationId) {
      // Never reuse a saved URL from a different organization.
      resolved['logoUrl'] = null;
    }

    try {
      final organization = await widget.api.call(
        'organizations.logo',
        input: {'organizationId': organizationId},
      );
      if (organization is Map &&
          organization['organizationId']?.toString() == organizationId) {
        final logo = organization['logoUrl']?.toString().trim();
        // An empty response should not discard a valid saved URL for this
        // same organization. A mismatched organization is cleared above.
        if (logo != null && logo.isNotEmpty) {
          resolved['logoUrl'] = logo;
        }
      }
    } catch (_) {
      // Keep only the same-organization saved URL as a fallback; the endpoint
      // enforces membership/owner authorization before returning a logo URL.
    }
    return resolved;
  }

  Future<void> _load() async {
    try {
      final context = await widget.api.call('organizations.context');
      final contextOrganizationId = context is Map
          ? context['organizationId']?.toString().trim()
          : null;
      if (contextOrganizationId == null || contextOrganizationId.isEmpty) {
        throw Exception('تعذر تحديد الجهة الثابتة لتحميل إعداداتها.');
      }
      final result = await widget.api.call(
        'organizations.settings.get',
        input: {'organizationId': contextOrganizationId},
      );
      final settings = await _withOrganizationLogo(
        Map<String, dynamic>.from(result as Map),
      );
      final logo = _text(settings['logoUrl']);
      final organizationId = _text(settings['organizationId']);
      final savedLogoBytes = logo.isEmpty || organizationId.isEmpty
          ? null
          : await widget.api.fetchOrganizationLogo(
              organizationId: organizationId,
              source: logo,
            );
      if (!mounted) return;
      setState(() {
        _settings = settings;
        _departmentName.text = _text(settings['departmentName']);
        _unitName.text = _text(settings['unitName'], 'وحدة العمليات');
        _unitChiefRank.text = _text(settings['unitChiefRank'], 'العقيد');
        _unitChiefName.text = _text(settings['unitChiefName'], 'رئيس الوحدة');
        _serialPrefix.text = _text(settings['serialPrefix'], 'POL');
        _incomingSerialPrefix.text = _text(
          settings['incomingSerialPrefix'],
          _text(settings['serialPrefix'], 'POL'),
        );
        _serialStart.text = _text(settings['serialStart'], '1');
        _incomingSerialStart.text = _text(settings['incomingSerialStart'], '1');
        _timezone = _text(settings['timezone'], 'Asia/Riyadh');
        _dateFormat = _text(settings['dateFormat'], 'yyyy/MM/dd HH:mm:ss');
        _timeFormat = _text(settings['timeFormat'], '24') == '12' ? '12' : '24';
        _numberSystem = _text(settings['numberSystem'], 'latin') == 'arabic'
            ? 'arabic'
            : 'latin';
        _logoUrl = logo.isEmpty ? null : logo;
        _pendingLogoPreviewBytes = null;
        _savedLogoPreviewBytes = savedLogoBytes;
        _error = null;
      });
    } catch (exception) {
      if (mounted) {
        setState(
          () => _error = exception.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    final departmentName = _departmentName.text.trim();
    final outgoingPrefix = _serialPrefix.text.trim().toUpperCase();
    final incomingPrefix = _incomingSerialPrefix.text.trim().toUpperCase();
    final outgoingStart = int.tryParse(_serialStart.text.trim());
    final incomingStart = int.tryParse(_incomingSerialStart.text.trim());

    if (departmentName.length < 2) {
      setState(() => _error = 'اسم الجهة يجب ألا يقل عن محرفين.');
      return;
    }
    final prefixPattern = RegExp(r'^[A-Z0-9-]{1,24}$');
    if (!prefixPattern.hasMatch(outgoingPrefix) ||
        !prefixPattern.hasMatch(incomingPrefix)) {
      setState(
        () => _error = 'بادئتا الصادر والوارد يجب أن تكونا أحرفًا لاتينية كبيرة أو أرقامًا أو شرطة.',
      );
      return;
    }
    if (outgoingStart == null ||
        incomingStart == null ||
        outgoingStart < 1 ||
        incomingStart < 1 ||
        outgoingStart > 999999999 ||
        incomingStart > 999999999) {
      setState(
        () => _error = 'أرقام بداية التسلسل يجب أن تكون بين 1 و999999999.',
      );
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final organizationId = _text(_settings['organizationId']).trim();
      if (organizationId.isEmpty) {
        throw Exception(
          'تعذر تحديد الجهة الثابتة؛ أعد تحميل الإعدادات ثم حاول مجددًا.',
        );
      }
      final payload = <String, dynamic>{
        'organizationId': organizationId,
        'departmentName': departmentName,
        'unitName': _unitName.text.trim(),
        'unitChiefRank': _unitChiefRank.text.trim(),
        'unitChiefName': _unitChiefName.text.trim(),
        'serialPrefix': outgoingPrefix,
        'incomingSerialPrefix': incomingPrefix,
        'serialStart': outgoingStart,
        'incomingSerialStart': incomingStart,
        'timezone': _timezone,
        'dateFormat': _dateFormat,
        'timeFormat': _timeFormat,
        'numberSystem': _numberSystem,
        'logoUrl': _logoUrl,
      };
      final result = await widget.api.call(
        'organizations.settings.update',
        mutation: true,
        input: payload,
      );
      if (!mounted) return;
      if (result is Map) {
        final saved = await _withOrganizationLogo(
          Map<String, dynamic>.from(result),
        );
        final savedLogo = _text(saved['logoUrl']);
        final savedOrganizationId = _text(saved['organizationId']);
        final previousLogo = _text(_settings['logoUrl']);
        final uploadedLogoBytes = _pendingLogoPreviewBytes;
        final uploadedLogoIsSafe =
            uploadedLogoBytes != null &&
            isSupportedOrganizationLogoPayload('', uploadedLogoBytes);
        if (uploadedLogoBytes != null ||
            widget.api.organizationLogoCacheIdentity(previousLogo) !=
                widget.api.organizationLogoCacheIdentity(savedLogo)) {
          await widget.api.clearOrganizationLogoCache();
        }

        Uint8List? savedLogoBytes;
        if (uploadedLogoIsSafe &&
            savedLogo.isNotEmpty &&
            savedOrganizationId.isNotEmpty) {
          // The settings mutation has succeeded. Persist exact supported
          // bytes under the server-confirmed organization/path identity so
          // reopening settings does not depend on an immediate network fetch.
          await widget.api.cacheOrganizationLogo(
            organizationId: savedOrganizationId,
            source: savedLogo,
            bytes: uploadedLogoBytes,
          );
          savedLogoBytes = Uint8List.fromList(uploadedLogoBytes);
        } else if (savedLogo.isNotEmpty && savedOrganizationId.isNotEmpty) {
          savedLogoBytes = await widget.api.fetchOrganizationLogo(
            organizationId: savedOrganizationId,
            source: savedLogo,
          );
        }
        if (!mounted) return;
        setState(() {
          _settings = saved;
          if (saved.containsKey('logoUrl')) {
            _logoUrl = savedLogo.isEmpty ? null : savedLogo;
            _savedLogoPreviewBytes = savedLogoBytes;
            // Keep the local image visible if the remote preview cannot yet
            // be fetched; a fresh signed URL is loaded when settings reopen.
            if (savedLogoBytes != null ||
                savedLogo.isEmpty ||
                (uploadedLogoBytes != null && !uploadedLogoIsSafe)) {
              _pendingLogoPreviewBytes = null;
            }
          }
        });
      }
      Toast.success(context, 'تم حفظ إعدادات الجهة.');
    } catch (exception) {
      if (mounted) {
        setState(
          () => _error = exception.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _uploadLogo() async {
    final selection = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['svg', 'png', 'jpg', 'jpeg'],
      withData: true,
    );
    if (selection == null || selection.files.isEmpty || !mounted) return;

    final file = selection.files.single;
    final bytes = file.bytes;
    if (bytes == null || bytes.isEmpty) {
      setState(() => _error = 'تعذر قراءة ملف الشعار.');
      return;
    }

    setState(() {
      _uploadingLogo = true;
      _error = null;
    });
    try {
      final organizationId = _text(_settings['organizationId']).trim();
      if (organizationId.isEmpty) {
        throw Exception(
          'تعذر تحديد الجهة الحالية؛ أعد تحميل الإعدادات ثم حاول مجددًا.',
        );
      }
      final prepared = await prepareOrganizationLogo(
        source: bytes,
        fileName: file.name,
      );
      final result = await widget.api.uploadOrganizationLogo(
        organizationId: organizationId,
        fileName: prepared.fileName,
        contentType: prepared.contentType,
        bytes: prepared.bytes,
      );
      if (!mounted) return;
      final uploaded = Map<String, dynamic>.from(result as Map);
      final logo = _text(uploaded['url']);
      if (logo.isEmpty) throw Exception('لم يُرجع الخادم رابط الشعار.');
      setState(() {
        _logoUrl = logo;
        // The upload endpoint returns an internal storage URL, not a public
        // image URL. Preview the selected bytes until settings are saved and
        // the server returns the authorized signed URL.
        _pendingLogoPreviewBytes = prepared.bytes;
      });
      Toast.success(context, 'تم رفع الشعار، اضغط حفظ لاعتماده');
    } catch (exception) {
      if (mounted) {
        setState(
          () => _error = exception.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingLogo = false);
    }
  }

  Widget _input(
    TextEditingController controller,
    String label, {
    bool numeric = false,
    int maxLength = 255,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: TextField(
      controller: controller,
      enabled: !_saving,
      maxLength: maxLength,
      keyboardType: numeric ? TextInputType.number : TextInputType.text,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
    ),
  );

  Widget _dropdown(
    String label,
    String value,
    List<MapEntry<String, String>> options,
    ValueChanged<String?> onChanged,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      items: options
          .map(
            (option) => DropdownMenuItem(
              value: option.key,
              child: Text(
                option.value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          )
          .toList(),
      onChanged: _saving ? null : onChanged,
    ),
  );

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        title: const Text(
          'إعدادات الجهة',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error != null) _ErrorCard(message: _error!),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'هوية الجهة وترويسة البرقية',
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.primary,
                            fontSize: 17,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Container(
                              width: 64,
                              height: 64,
                              alignment: Alignment.center,
                              padding: const EdgeInsets.all(3),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: context.appBorder),
                              ),
                              child:
                                  _pendingLogoPreviewBytes != null ||
                                      _savedLogoPreviewBytes != null
                                  ? ClipRRect(
                                      borderRadius: BorderRadius.circular(12),
                                      child: OrganizationLogoPreview(
                                        bytes:
                                            _pendingLogoPreviewBytes ??
                                            _savedLogoPreviewBytes!,
                                        width: 58,
                                        height: 58,
                                        fallback: Icon(
                                          Icons.broken_image_outlined,
                                          color: context.appMutedText,
                                          size: 30,
                                        ),
                                      ),
                                    )
                                  : Icon(
                                      Icons.image_not_supported_outlined,
                                      color: context.appMutedText,
                                      size: 30,
                                    ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: _saving || _uploadingLogo
                                    ? null
                                    : _uploadLogo,
                                icon: const Icon(Icons.upload_file_outlined),
                                label: Text(
                                  _uploadingLogo
                                      ? 'جارٍ رفع الشعار...'
                                      : 'رفع شعار SVG أو PNG أو JPG',
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (_logoUrl != null) ...[
                          const SizedBox(height: 6),
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton.icon(
                              onPressed: _saving || _uploadingLogo
                                  ? null
                                  : () => setState(() {
                                      _logoUrl = null;
                                      _pendingLogoPreviewBytes = null;
                                      _savedLogoPreviewBytes = null;
                                    }),
                              icon: const Icon(Icons.delete_outline),
                              label: const Text('إزالة الشعار عند الحفظ'),
                            ),
                          ),
                        ],
                        const SizedBox(height: 14),
                        _input(_departmentName, 'اسم الجهة الشرطية'),
                        _input(_unitName, 'اسم الوحدة التابعة'),
                        _input(_unitChiefRank, 'رتبة رئيس الوحدة'),
                        _input(_unitChiefName, 'اسم رئيس الوحدة'),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                _FormCard(
                  title: 'الترقيم والتوقيت',
                  children: [
                    _input(
                      _serialPrefix,
                      'بادئة البرقية الصادرة',
                      maxLength: 24,
                    ),
                    _input(
                      _incomingSerialPrefix,
                      'بادئة البرقية الواردة',
                      maxLength: 24,
                    ),
                    _input(
                      _serialStart,
                      'رقم بداية تسلسل الصادر',
                      numeric: true,
                      maxLength: 9,
                    ),
                    _input(
                      _incomingSerialStart,
                      'رقم بداية تسلسل الوارد',
                      numeric: true,
                      maxLength: 9,
                    ),
                    _dropdown(
                      'المنطقة الزمنية',
                      _timezone,
                      _withCurrent(_timeZones, _timezone),
                      (value) {
                        if (value != null) setState(() => _timezone = value);
                      },
                    ),
                    _dropdown(
                      'تنسيق التاريخ والوقت',
                      _dateFormat,
                      _withCurrent(_dateFormats, _dateFormat),
                      (value) {
                        if (value != null) setState(() => _dateFormat = value);
                      },
                    ),
                    _dropdown(
                      'تنسيق الوقت',
                      _timeFormat,
                      const [
                        MapEntry('24', '24 ساعة'),
                        MapEntry('12', '12 ساعة'),
                      ],
                      (value) {
                        if (value != null) setState(() => _timeFormat = value);
                      },
                    ),
                    _dropdown(
                      'نظام الأرقام',
                      _numberSystem,
                      const [
                        MapEntry('latin', 'لاتينية 123'),
                        MapEntry('arabic', 'عربية ١٢٣'),
                      ],
                      (value) {
                        if (value != null) {
                          setState(() => _numberSystem = value);
                        }
                      },
                    ),
                    if (_settings['nextOutgoingSerial'] != null ||
                        _settings['nextIncomingSerial'] != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          'الرقم التالي — صادر: ${_text(_settings['nextOutgoingSerial'], '—')}، وارد: ${_text(_settings['nextIncomingSerial'], '—')}',
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.primary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    FilledButton.icon(
                      onPressed: _saving || _uploadingLogo ? null : _save,
                      icon: const Icon(Icons.save_outlined),
                      label: Text(
                        _saving ? 'جارٍ حفظ الإعدادات...' : 'حفظ إعدادات الجهة',
                      ),
                    ),
                  ],
                ),
              ],
            ),
    ),
  );
}
