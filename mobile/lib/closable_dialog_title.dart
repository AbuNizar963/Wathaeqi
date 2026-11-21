import 'package:flutter/material.dart';

/// A consistent, accessible close control for modal dialog title bars.
Widget closableDialogTitle(
  BuildContext context,
  Widget title, {
  String tooltip = 'إغلاق النافذة',
}) {
  return Directionality(
    textDirection: TextDirection.rtl,
    child: Row(
      children: [
        Expanded(child: title),
        IconButton(
          tooltip: tooltip,
          visualDensity: VisualDensity.compact,
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ],
    ),
  );
}
