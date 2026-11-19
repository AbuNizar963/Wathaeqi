import 'package:flutter/material.dart';

import 'api.dart';
import './features/notifications/toast.dart';

const _navy = Color(0xFF0F2742);

String _routeStatusLabel(String value) {
  switch (value) {
    case 'sent':
      return 'مرسلة';
    case 'received':
      return 'مستلمة';
    case 'accepted':
      return 'مقبولة';
    case 'completed':
      return 'مكتملة';
    case 'rejected':
      return 'مرفوضة';
    case 'cancelled':
      return 'ملغاة';
    default:
      return value;
  }
}

String _approvalLabel(String value) {
  switch (value) {
    case 'pending':
      return 'بانتظار اعتماد السلطة الأعلى';
    case 'approved':
      return 'معتمدة';
    case 'rejected':
      return 'مرفوضة';
    default:
      return 'لا تحتاج اعتماداً';
  }
}

/// Routing, higher-authority approval and receiver decisions for one telegram.
class TelegramRoutesPanel extends StatefulWidget {
  const TelegramRoutesPanel({
    super.key,
    required this.api,
    required this.telegramId,
    required this.canOperate,
    required this.onChanged,
  });

  final PoliceApi api;
  final int telegramId;
  final bool canOperate;
  final VoidCallback onChanged;

  @override
  State<TelegramRoutesPanel> createState() => _TelegramRoutesPanelState();
}

class _TelegramRoutesPanelState extends State<TelegramRoutesPanel> {
  bool loading = true;
  String? error;
  String? busyRouteId;
  String organizationId = '';
  List<Map<String, dynamic>> routes = const [];

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final results = await Future.wait<dynamic>([
        widget.api.call(
          'telegrams.routes',
          input: {'telegramId': widget.telegramId},
        ),
        widget.api.call('organizations.context').catchError(
          (_) => <String, dynamic>{},
        ),
      ]);
      if (!mounted) return;
      final rawRoutes = results[0];
      final context = results[1];
      setState(() {
        routes = rawRoutes is List
            ? rawRoutes
                  .whereType<Map>()
                  .map((row) => Map<String, dynamic>.from(row))
                  .toList()
            : const [];
        organizationId = context is Map
            ? '${context['organizationId'] ?? ''}'
            : '';
        loading = false;
      });
    } catch (exception) {
      if (!mounted) return;
      setState(() {
        error = exception.toString().replaceFirst('Exception: ', '');
        loading = false;
      });
    }
  }

  Future<void> _run(String procedure, Map<String, dynamic> input) async {
    setState(() => busyRouteId = '${input['routeId']}');
    try {
      await widget.api.call(procedure, mutation: true, input: input);
      if (!mounted) return;
      Toast.success(context, 'تم تحديث مسار الإحالة');
      await load();
      widget.onChanged();
    } catch (exception) {
      if (!mounted) return;
      Toast.error(
        context,
        exception.toString().replaceFirst('Exception: ', ''),
      );
    } finally {
      if (mounted) setState(() => busyRouteId = null);
    }
  }

  Future<String?> _askReason(String title) async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          maxLines: 3,
          decoration: const InputDecoration(labelText: 'السبب'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () {
              final value = controller.text.trim();
              if (value.length < 3) return;
              Navigator.pop(dialogContext, value);
            },
            child: const Text('تأكيد'),
          ),
        ],
      ),
    );
    controller.dispose();
    return reason;
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'الإحالات وسير الاعتماد',
              style: TextStyle(
                color: _navy,
                fontSize: 17,
                fontWeight: FontWeight.w900,
              ),
            ),
            if (loading)
              const Padding(
                padding: EdgeInsets.all(12),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (error != null)
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text(
                      'تعذر تحميل الإحالات: $error',
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      onPressed: load,
                      icon: const Icon(Icons.refresh),
                      label: const Text('إعادة المحاولة'),
                    ),
                  ),
                ],
              )
            else if (routes.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text('لا توجد إحالات مسجلة لهذه البرقية.'),
              )
            else
              ...routes.map(_routeTile),
          ],
        ),
      ),
    );
  }

  Widget _routeTile(Map<String, dynamic> route) {
    final routeId = '${route['id'] ?? ''}';
    final isReceiver =
        organizationId.isNotEmpty &&
        '${route['toOrganizationId'] ?? ''}' == organizationId;
    final approvalStatus = '${route['approvalStatus'] ?? 'not_required'}';
    final status = '${route['status'] ?? 'sent'}';
    final decision = '${route['receiverDecisionStatus'] ?? 'pending'}';
    final busy = busyRouteId == routeId;

    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${route['routeSerialCode'] ?? routeId} ← ${route['toOrganizationName'] ?? route['toOrganizationId'] ?? ''}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              Chip(
                label: Text(_routeStatusLabel(status)),
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            _approvalLabel(approvalStatus),
            style: TextStyle(
              fontSize: 12,
              color: approvalStatus == 'pending'
                  ? Colors.orange.shade800
                  : Colors.black54,
            ),
          ),
          if ((route['note'] ?? '').toString().trim().isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('${route['note']}'),
            ),
          if ((route['incomingSerialCode'] ?? '').toString().isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'رقم الوارد: ${route['incomingSerialCode']}',
                style: const TextStyle(fontSize: 12),
              ),
            ),
          if (widget.canOperate)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (approvalStatus == 'pending') ...[
                    FilledButton(
                      onPressed: busy
                          ? null
                          : () => _run('telegrams.approveRoute', {
                              'routeId': routeId,
                              'decision': 'approved',
                            }),
                      child: const Text('اعتماد الإحالة'),
                    ),
                    OutlinedButton(
                      onPressed: busy
                          ? null
                          : () async {
                              final reason = await _askReason('رفض الإحالة');
                              if (reason == null) return;
                              await _run('telegrams.approveRoute', {
                                'routeId': routeId,
                                'decision': 'rejected',
                                'reason': reason,
                              });
                            },
                      child: const Text('رفض'),
                    ),
                  ],
                  if (isReceiver && status == 'sent')
                    OutlinedButton(
                      onPressed: busy
                          ? null
                          : () =>
                                _run('telegrams.receiveRoute', {
                                  'routeId': routeId,
                                }),
                      child: const Text('تسجيل الاستلام'),
                    ),
                  if (isReceiver &&
                      (status == 'sent' || status == 'received') &&
                      decision == 'pending') ...[
                    FilledButton(
                      onPressed: busy
                          ? null
                          : () => _run('telegrams.decideRouteAsReceiver', {
                              'routeId': routeId,
                              'decision': 'accepted',
                            }),
                      child: const Text('قبول وتنفيذ'),
                    ),
                    OutlinedButton(
                      onPressed: busy
                          ? null
                          : () async {
                              final reason = await _askReason('رفض الاستلام');
                              if (reason == null) return;
                              await _run('telegrams.decideRouteAsReceiver', {
                                'routeId': routeId,
                                'decision': 'rejected',
                                'reason': reason,
                              });
                            },
                      child: const Text('رفض وإعادة'),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}
