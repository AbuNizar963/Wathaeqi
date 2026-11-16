# وثائقي — تطبيق الهاتف

هذا الفرع مخصص لتطبيق Flutter الخاص بوثائقي فقط. واجهة الهاتف تتصل مباشرة بمشروع Appwrite، ولا تحتوي على خادم الويب أو قاعدة Supabase الخاصة بمصدر البرقيات.

## التشغيل

```bash
cd mobile
flutter pub get
flutter run
```

## Appwrite

- Endpoint: `https://fra.cloud.appwrite.io/v1`
- Project ID: `wathaeqi`
- Database ID: `wathaeqi-db`
- Tables: `documents`, `templates`, `contacts`
- Android application ID: `com.wathaeqi.documents`
- iOS bundle ID: `com.wathaeqi.documents`

تستخدم البيانات صلاحيات صفوف مرتبطة بالمستخدم، مع Row Security على الجداول. لا تضع مفاتيح API الإدارية أو أسراراً داخل التطبيق.

## الفحوص

```bash
cd mobile
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
flutter build apk --debug
```

فرع المصدر الكامل المنقول محفوظ في تاريخ هذا الفرع، كما أن نسخة المصدر الأصلية تبقى على فرع Wathaeqi `flutter-mobile-app` إلى حين اعتماد طلب الدمج. مستودع `police-telegrams-platform` لم يتلق أي تعديلات.
