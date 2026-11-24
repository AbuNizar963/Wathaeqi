import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/app_theme.dart';
import 'package:police_telegrams/features/admin/admin_page_intro.dart';

void main() {
  testWidgets('administrative page intro renders title and description', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: const Scaffold(
          body: Padding(
            padding: EdgeInsets.all(16),
            child: AdminPageIntro(
              title: 'إدارة الجهات',
              description: 'تنظيم الهيكل الإداري ومتابعة الجهات والفروع',
              icon: Icons.account_tree_outlined,
            ),
          ),
        ),
      ),
    );

    expect(find.text('إدارة الجهات'), findsOneWidget);
    expect(
      find.text('تنظيم الهيكل الإداري ومتابعة الجهات والفروع'),
      findsOneWidget,
    );
    expect(find.byIcon(Icons.account_tree_outlined), findsOneWidget);
  });
}
