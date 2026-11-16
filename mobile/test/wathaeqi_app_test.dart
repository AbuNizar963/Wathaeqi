import 'package:flutter_test/flutter_test.dart';
import 'package:wathaeqi_mobile/wathaeqi_app.dart';

void main() {
  testWidgets('shows the Wathaeqi sign-in screen', (tester) async {
    await tester.pumpWidget(const WathaeqiMobileApp());
    await tester.pumpAndSettle();
    expect(find.text('وثائقي'), findsOneWidget);
    expect(find.text('تسجيل الدخول'), findsOneWidget);
  });
}
