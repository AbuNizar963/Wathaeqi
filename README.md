# تطبيق وثائقي للهاتف

هذا الفرع (`flutter-mobile-app`) هو تطبيق Flutter للهاتف لنظام وثائقي. يتصل التطبيق مباشرة بواجهة Appwrite Function المنشورة، ولا يحتوي على نسخة ويب أو خادم أو قاعدة بيانات بديلة.

## المتطلبات والتشغيل

- Flutter وDart بالإصدار المثبت في `mobile/.fvmrc`.
- Android Studio أو Xcode بحسب المنصة.
- محاكي أو جهاز اختبار.

```bash
cd mobile
flutter pub get --enforce-lockfile
flutter run
```

عنوان Appwrite Function الافتراضي:

```text
https://wathaeqi-api.fra.appwrite.run
```

يمكن تغييره أثناء التطوير دون وضع أسرار داخل التطبيق:

```bash
flutter run --dart-define=API_BASE_URL=https://your-appwrite-function.example
```

## الفحوص

من مجلد `mobile`:

```bash
./tool/format_dart.sh --check
flutter analyze
flutter test --concurrency=1 --reporter expanded
flutter build apk --debug
```

## GitHub Actions والإصدار

يشغّل `.github/workflows/flutter-mobile.yml` فحوص التنسيق والتحليل والاختبارات وبناء APK تجريبي عند تغييرات `mobile/`. بناء APK الموقّع ونشر الإصدار العام متاحان يدوياً فقط عبر `workflow_dispatch` وعلى فرع `flutter-mobile-app`. لا توجد في هذا الفرع مهام نشر تلقائي أو إشعارات تلقائية عند الدفع المباشر.

لا تضع مفاتيح Appwrite أو Firebase أو أي أسرار إدارية في Git أو داخل حزمة التطبيق. تُفرض المصادقة والصلاحيات وعزل بيانات الجهات في Appwrite API، بينما يحتفظ التطبيق برمز الجلسة في التخزين الآمن.
