import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'api.dart';
import 'app_theme.dart';

class HomeDashboardPage extends StatefulWidget {
  const HomeDashboardPage({
    super.key,
    required this.api,
    required this.isPlatformOwner,
    required this.onOpenDocuments,
  });

  final PoliceApi api;
  final bool isPlatformOwner;
  final VoidCallback onOpenDocuments;

  @override
  State<HomeDashboardPage> createState() => _HomeDashboardPageState();
}

class _HomeDashboardPageState extends State<HomeDashboardPage> {
  List<Map<String, dynamic>> _documents = const [];
  List<Map<String, dynamic>> _templates = const [];
  int? _userCount;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<dynamic> _readList(String procedure) async {
    try {
      return await widget.api.call(procedure);
    } on NetworkException {
      return widget.api.readCachedResponse(procedure);
    }
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final results = await Future.wait([
        _readList('documentStudio.listDocuments'),
        _readList('documentStudio.listTemplates'),
      ]);
      int? userCount;
      if (widget.isPlatformOwner) {
        try {
          final overview = await widget.api.call(
            'workspace.administration.overview',
            allowOfflineCache: false,
          );
          if (overview is Map && overview['totals'] is Map) {
            final totals = Map<String, dynamic>.from(overview['totals'] as Map);
            userCount = (totals['users'] as num?)?.toInt();
          }
        } catch (_) {
          // User totals are optional; document data remains available.
        }
      }

      final documents = results[0] is List
          ? (results[0] as List)
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .where((item) => item['status'] != 'deleted')
                .toList()
          : <Map<String, dynamic>>[];
      final templates = results[1] is List
          ? (results[1] as List)
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .where((item) => item['isActive'] != false)
                .toList()
          : <Map<String, dynamic>>[];

      if (!mounted) return;
      setState(() {
        _documents = documents;
        _templates = templates;
        _userCount = userCount;
        _error = null;
      });
    } catch (exception) {
      if (!mounted) return;
      setState(() {
        _error = exception.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _latestDocuments {
    final rows = [..._documents];
    rows.sort(
      (a, b) => _dateValue(b['createdAt']).compareTo(_dateValue(a['createdAt'])),
    );
    return rows.take(5).toList(growable: false);
  }

  DateTime _dateValue(dynamic value) =>
      DateTime.tryParse('$value') ?? DateTime.fromMillisecondsSinceEpoch(0);

  String _formatDate(dynamic value) {
    final date = DateTime.tryParse('$value');
    if (date == null) return '—';
    return DateFormat('yyyy/MM/dd').format(date.toLocal());
  }

  String _statusLabel(dynamic value) => switch ('$value') {
    'issued' => 'صادر',
    'archived' => 'مؤرشف',
    _ => 'مسودة',
  };

  Color _statusColor(dynamic value, BuildContext context) => switch ('$value') {
    'issued' => Theme.of(context).brightness == Brightness.dark
        ? AppPalette.darkSuccess
        : AppPalette.success,
    'archived' => Theme.of(context).brightness == Brightness.dark
        ? AppPalette.darkInfo
        : AppPalette.info,
    _ => Theme.of(context).brightness == Brightness.dark
        ? AppPalette.darkWarning
        : AppPalette.warning,
  };

  @override
  Widget build(BuildContext context) {
    final latest = _latestDocuments;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'لوحة العمل',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'ملخص الوثائق والنشاط في جهة العمل',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'تحديث البيانات',
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh_rounded),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (_error != null)
            Card(
              color: Theme.of(context).colorScheme.errorContainer,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  _error!,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.onErrorContainer,
                  ),
                ),
              ),
            ),
          LayoutBuilder(
            builder: (context, constraints) {
              final columns = constraints.maxWidth >= 680 ? 3 : 2;
              return GridView.count(
                crossAxisCount: columns,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 1.55,
                children: [
                  _MetricCard(
                    label: 'إجمالي الوثائق',
                    value: _loading ? '…' : _documents.length.toString(),
                    icon: Icons.description_outlined,
                    color: const Color(0xFF0EA5E9),
                  ),
                  _MetricCard(
                    label: 'مسودات',
                    value: _loading
                        ? '…'
                        : _documents
                              .where((item) => item['status'] == 'draft')
                              .length
                              .toString(),
                    icon: Icons.edit_note_rounded,
                    color: const Color(0xFFF59E0B),
                  ),
                  _MetricCard(
                    label: 'وثائق صادرة',
                    value: _loading
                        ? '…'
                        : _documents
                              .where((item) => item['status'] == 'issued')
                              .length
                              .toString(),
                    icon: Icons.verified_outlined,
                    color: const Color(0xFF10B981),
                  ),
                  _MetricCard(
                    label: 'وثائق مؤرشفة',
                    value: _loading
                        ? '…'
                        : _documents
                              .where((item) => item['status'] == 'archived')
                              .length
                              .toString(),
                    icon: Icons.archive_outlined,
                    color: const Color(0xFF6366F1),
                  ),
                  _MetricCard(
                    label: 'القوالب والنماذج',
                    value: _loading ? '…' : _templates.length.toString(),
                    icon: Icons.dashboard_customize_outlined,
                    color: const Color(0xFF8B5CF6),
                  ),
                  _MetricCard(
                    label: 'المستخدمون',
                    value: _loading ? '…' : (_userCount?.toString() ?? '—'),
                    icon: Icons.people_alt_outlined,
                    color: const Color(0xFF06B6D4),
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 18),
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'أحدث الوثائق',
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w900),
                        ),
                      ),
                      TextButton.icon(
                        onPressed: widget.onOpenDocuments,
                        icon: const Icon(Icons.arrow_back_rounded, size: 16),
                        label: const Text('عرض الكل'),
                      ),
                    ],
                  ),
                  if (_loading && _documents.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 28),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (latest.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 24),
                      child: Column(
                        children: [
                          Icon(
                            Icons.folder_open_outlined,
                            size: 34,
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'لا توجد وثائق بعد',
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    ...latest.asMap().entries.map((entry) {
                      final document = entry.value;
                      final status = document['status'];
                      final serial = document['serialCode']?.toString().trim();
                      final serialLabel = serial == null || serial.isEmpty
                          ? 'مسودة'
                          : serial;
                      final title = document['title']?.toString().trim();
                      return Column(
                        children: [
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: CircleAvatar(
                              backgroundColor: _statusColor(status, context)
                                  .withValues(alpha: 0.12),
                              child: Icon(
                                Icons.description_outlined,
                                color: _statusColor(status, context),
                              ),
                            ),
                            title: Text(
                              title == null || title.isEmpty
                                  ? 'وثيقة بدون اسم'
                                  : title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w800),
                            ),
                            subtitle: Text(
                              '$serialLabel · ${_statusLabel(status)}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            trailing: Text(
                              _formatDate(
                                document['documentDate'] ?? document['createdAt'],
                              ),
                              textDirection: ui.TextDirection.ltr,
                              style: Theme.of(context).textTheme.labelSmall
                                  ?.copyWith(
                                    fontFeatures: const [
                                      ui.FontFeature.tabularFigures(),
                                    ],
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant,
                                  ),
                            ),
                          ),
                          if (entry.key < latest.length - 1)
                            Divider(
                              height: 1,
                              color: Theme.of(context).colorScheme.outlineVariant,
                            ),
                        ],
                      );
                    }),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(icon, size: 19, color: color),
          ),
          const Spacer(),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w900,
              fontFeatures: const [ui.FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    ),
  );
}
