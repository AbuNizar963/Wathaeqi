# تطبيق وثائقي للهاتف

تطبيق Flutter لإعداد الكتب الرسمية وإدارة المستندات والقوالب وجهات الاتصال، متصل مباشرة بمشروع Appwrite الخاص بوثائقي.

## المتطلبات والتشغيل

- Flutter 3.47.2 وDart الموافق له.
- Android Studio أو محاكي Android.

من مجلد التطبيق:

```bash
cd mobile
flutter pub get
flutter run
```

## Appwrite

- Endpoint: `https://fra.cloud.appwrite.io/v1`
- Project ID: `wathaeqi`
- Database: `wathaeqi-db`
- Tables: `documents`, `templates`, `contacts`

يسجل التطبيق الدخول عبر Appwrite Account، ويستخدم TablesDB لحفظ بيانات المستخدم. صلاحيات الصفوف مرتبطة بمعرف المستخدم، مع تفعيل Row Security على الجداول. لا تضع Appwrite API keys أو أسراراً داخل تطبيق الهاتف.

## الفحوص والبناء

```bash
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
flutter build apk --debug
```

## الفروع

- `flutter-mobile-app`: الفرع المستهدف لتطبيق وثائقي بعد المراجعة.
- `feat/wathaeqi-appwrite-mobile`: فرع التحويل والمعاينة.
- `migration/police-source-main` ونسخة فرع التطبيق الأصلية: محفوظتان في Wathaeqi كمرجع كامل قبل التنظيف.

المستودع الأصلي `AbuNizar963/police-telegrams-platform` لم يُعدّل.
