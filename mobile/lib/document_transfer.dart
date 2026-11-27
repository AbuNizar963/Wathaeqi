import 'dart:async';

import 'package:flutter/material.dart';

import 'api.dart' show ApiException, NetworkException;

class DocumentTransferCancelled implements Exception {
  const DocumentTransferCancelled();
}

/// Percentages describe bytes received, never estimated server work.
class DocumentTransfer extends ChangeNotifier {
  final _cancelled = Completer<void>();
  String message = 'جارٍ التحقق من الجلسة وتجهيز الطلب';
  int receivedBytes = 0;
  int? totalBytes;
  bool receiving = false;
  bool cancellable = true;
  bool _disposed = false;
  DateTime? _lastNotification;

  Future<void> get cancelled => _cancelled.future;
  bool get isCancelled => _cancelled.isCompleted;
  double? get fraction => receiving && totalBytes != null && totalBytes! > 0
      ? (receivedBytes / totalBytes!).clamp(0.0, 1.0)
      : null;

  void checkCancelled() {
    if (isCancelled) throw const DocumentTransferCancelled();
  }

  void cancel() {
    if (!cancellable || isCancelled) return;
    _cancelled.complete();
    message = 'جارٍ إلغاء العملية…';
    _notify();
  }

  void stage(String value, {bool canCancel = true}) {
    checkCancelled();
    message = value;
    receiving = false;
    totalBytes = null;
    cancellable = canCancel;
    _notify();
  }

  void bytes(int received, int? total) {
    checkCancelled();
    receiving = true;
    receivedBytes = received;
    totalBytes = total != null && total > 0 ? total : null;
    message = 'جارٍ استقبال بايتات الملف';
    final now = DateTime.now();
    if (_lastNotification == null ||
        now.difference(_lastNotification!) >=
            const Duration(milliseconds: 80) ||
        received == 0 ||
        received == total) {
      _lastNotification = now;
      _notify();
    }
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

String documentOutputError(Object error) {
  if (error is ApiException) {
    if (error.statusCode == 401) return 'انتهت الجلسة؛ سجّل الدخول مجددًا.';
    if (error.statusCode == 403 || error.statusCode == 404) {
      return 'الوثيقة غير متاحة أو لا تملك صلاحية الوصول إليها.';
    }
  }
  if (error is NetworkException) return error.message;
  return 'تعذر إخراج الوثيقة. تحقق من الاتصال وصلاحياتك ثم أعد المحاولة.';
}

/// The platform print/save/share UI decides success or dismissal.
Future<bool?> showDocumentOutputDialog({
  required BuildContext context,
  required String title,
  required Future<bool> Function(DocumentTransfer transfer) action,
}) => showDialog<bool>(
  context: context,
  barrierDismissible: false,
  builder: (_) => _DocumentOutputDialog(title: title, action: action),
);

class MeasuredDocumentProgress extends StatelessWidget {
  const MeasuredDocumentProgress({super.key, required this.value});
  final double? value;

  @override
  Widget build(BuildContext context) {
    if (value == null) return const LinearProgressIndicator(minHeight: 6);
    final measured = value!.clamp(0.0, 1.0);
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0, end: measured),
      duration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : const Duration(milliseconds: 240),
      curve: Curves.easeOutCubic,
      builder: (context, animated, _) => LinearProgressIndicator(
        value: animated.clamp(0.0, measured),
        minHeight: 6,
        semanticsValue: '${(measured * 100).floor()}%',
      ),
    );
  }
}

class _DocumentOutputDialog extends StatefulWidget {
  const _DocumentOutputDialog({required this.title, required this.action});
  final String title;
  final Future<bool> Function(DocumentTransfer) action;

  @override
  State<_DocumentOutputDialog> createState() => _DocumentOutputDialogState();
}

class _DocumentOutputDialogState extends State<_DocumentOutputDialog> {
  DocumentTransfer _transfer = DocumentTransfer();
  String? _error;
  bool _running = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _run());
  }

  Future<void> _run() async {
    if (!mounted || _running) return;
    setState(() {
      _running = true;
      _error = null;
    });
    try {
      final success = await widget.action(_transfer);
      _transfer.checkCancelled();
      if (mounted) Navigator.of(context).pop(success);
    } on DocumentTransferCancelled {
      if (mounted) Navigator.of(context).pop(false);
    } catch (error) {
      if (mounted) setState(() => _error = documentOutputError(error));
    } finally {
      if (mounted) setState(() => _running = false);
    }
  }

  @override
  void dispose() {
    _transfer.cancel();
    _transfer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: _transfer,
    builder: (context, _) => PopScope(
      canPop: !_running,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _transfer.cancel();
      },
      child: AlertDialog(
               scrollable: true,
        title: Text(widget.title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_error != null) ...[
              Icon(
                Icons.error_outline,
                color: Theme.of(context).colorScheme.error,
              ),
              const SizedBox(height: 12),
              Text(_error!),
            ] else ...[
              Text(_transfer.message, semanticsLabel: _transfer.message),
              const SizedBox(height: 16),
              MeasuredDocumentProgress(value: _transfer.fraction),
              if (_transfer.receiving) ...[
                const SizedBox(height: 10),
                Text(
                  _transfer.fraction == null
                      ? '${_transfer.receivedBytes} بايت مستلمة · الحجم الكلي غير معلوم'
                      : '${(_transfer.fraction! * 100).floor()}% · ${_transfer.receivedBytes} / ${_transfer.totalBytes} بايت',
                ),
                const Text(
                  'النسبة تخص تنزيل البايتات فقط، وليس وقت المعالجة أو الحفظ.',
                ),
              ],
            ],
          ],
        ),
        actions: [
          if (_error != null) ...[
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('إغلاق'),
            ),
            FilledButton(
              onPressed: () {
                _transfer.dispose();
                _transfer = DocumentTransfer();
                _run();
              },
              child: const Text('إعادة المحاولة'),
            ),
          ] else
            TextButton(
              onPressed: _transfer.cancellable && !_transfer.isCancelled
                  ? _transfer.cancel
                  : null,
              child: const Text('إلغاء'),
            ),
        ],
      ),
    ),
  );
}
