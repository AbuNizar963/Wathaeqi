import 'package:flutter/material.dart';

import 'api.dart';
import 'document_studio_outbox.dart';
import 'telegram_outbox.dart';

const _outboxGold = Color(0xFFD8C38E);

class TelegramOutboxPage extends StatefulWidget {
  const TelegramOutboxPage({
    super.key,
    required this.api,
    required this.outbox,
    this.documentOutbox,
  });

  final PoliceApi api;
  final TelegramOutbox outbox;
  final DocumentStudioOutbox? documentOutbox;

  @override
  State<TelegramOutboxPage> createState() => _TelegramOutboxPageState();
}

class _TelegramOutboxPageState extends State<TelegramOutboxPage> {
  late final DocumentStudioOutbox _documentOutbox;
  List<TelegramOutboxEntry> _legacyEntries = const [];
  int _pendingDocuments = 0;
  bool _loading = true;
  bool _syncing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _documentOutbox = widget.documentOutbox ??
        DocumentStudioOutbox(api: widget.api);
    _load();
  }

  Future<void> _load() async {
    try {
      final entries = await widget.outbox.list();
      final pendingDocuments = await _documentOutbox.pendingCount();
      if (!mounted) return;
      setState(() {
        _legacyEntries = entries;
        _pendingDocuments = pendingDocuments;
        _error = null;
      });
    } catch (exception) {
      if (mounted) setState(() => _error = _message(exception));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _sync() async {
    if (_syncing) return;
    setState(() {
      _syncing = true;
      _error = null;
    });
    try {
      final legacyResult = await widget.outbox.sync(widget.api);
      final documentResult = await _documentOutbox.sync();
      await _load();
      if (!mounted) return;
      if (legacyResult.permanentFailures > 0) {
        final details = legacyResult.permanentErrorMessages.isEmpty
            ? 'تحقق من الصلاحيات'
            : legacyResult.permanentErrorMessages.join('، ');
        setState(() {
          _error =
              'توجد ${legacyResult.permanentFailures} عملية محفوظة من إصدار سابق تحتاج إلى مراجعة: $details';
        });
      } else if (documentResult.lastError != null) {
        setState(() {
          _error = 'تعذرت مزامنة بعض الوثائق: ${documentResult.lastError}';
        });
      } else {
        final total = legacyResult.synced + documentResult.synced;
        _showMessage(
          total > 0
              ? 'تمت مزامنة $total عملية بنجاح'
              : 'لا توجد تغييرات محلية معلقة',
        );
      }
    } catch (exception) {
      if (mounted) setState(() => _error = _message(exception));
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Future<void> _remove(TelegramOutboxEntry entry) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('حذف سجل محلي قديم؟'),
        content: const Text(
          'سيُحذف هذا التغيير المحفوظ من إصدار سابق ولن تتم مزامنته. لا يؤثر ذلك في الوثائق الحالية.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('حذف'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await widget.outbox.remove(entry.id);
    await _load();
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  String _message(Object exception) =>
      exception.toString().replaceFirst('Exception: ', '');

  String _date(DateTime value) {
    final local = value.toLocal();
    return '${local.year}/${local.month.toString().padLeft(2, '0')}/'
        '${local.day.toString().padLeft(2, '0')} '
        '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final totalPending = _pendingDocuments + _legacyEntries.length;
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('المزامنة المحلية'),
          actions: [
            IconButton(
              tooltip: 'مزامنة الآن',
              onPressed: _syncing || totalPending == 0 ? null : _sync,
              icon: const Icon(Icons.sync_outlined),
            ),
          ],
        ),
        body: _loading
            ? Center(
                child: CircularProgressIndicator(
                  color: Theme.of(context).colorScheme.primary,
                ),
              )
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.description_outlined,
                              color: _outboxGold,
                              size: 30,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                _pendingDocuments == 0
                                    ? 'لا توجد تغييرات وثائق بانتظار المزامنة.'
                                    : '$_pendingDocuments وثيقة أو نموذج محفوظ محلياً بانتظار المزامنة.',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (_legacyEntries.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Row(
                            children: [
                              const Icon(Icons.history_outlined),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  '${_legacyEntries.length} تغييرات محفوظة من إصدار سابق. ستبقى محفوظة حتى مزامنتها أو حذفها يدوياً.',
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      ..._legacyEntries.map(_legacyEntryCard),
                    ],
                    if (_error != null) _errorCard(_error!),
                    if (totalPending == 0 && _error == null)
                      _emptyState(),
                  ],
                ),
              ),
        bottomNavigationBar: _syncing
            ? const LinearProgressIndicator(minHeight: 3)
            : null,
      ),
    );
  }

  Widget _legacyEntryCard(TelegramOutboxEntry entry) => Card(
    child: ListTile(
      leading: const Icon(Icons.history_outlined, color: _outboxGold),
      title: const Text('تغيير محفوظ من إصدار سابق'),
      subtitle: Text(
        'حُفظ في ${_date(entry.createdAt)} · محاولات المزامنة: ${entry.attempts}',
      ),
      trailing: IconButton(
        tooltip: 'حذف السجل المحلي',
        onPressed: _syncing ? null : () => _remove(entry),
        icon: Icon(
          Icons.delete_outline,
          color: Theme.of(context).colorScheme.error,
        ),
      ),
    ),
  );

  Widget _emptyState() => Padding(
    padding: const EdgeInsets.symmetric(vertical: 36),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.cloud_done_outlined, size: 54, color: _outboxGold),
        const SizedBox(height: 12),
        const Text(
          'المزامنة المحلية محدثة',
          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
        ),
        const SizedBox(height: 6),
        const Text(
          'كل الوثائق والتغييرات المحلية متزامنة مع الخادم.',
          textAlign: TextAlign.center,
        ),
      ],
    ),
  );

  Widget _errorCard(String text) => Card(
    color: Theme.of(context).colorScheme.errorContainer,
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Text(
        text,
        style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer),
      ),
    ),
  );
}
