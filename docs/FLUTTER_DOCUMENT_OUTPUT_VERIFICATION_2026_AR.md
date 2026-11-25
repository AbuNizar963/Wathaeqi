# نتيجة مساحة الوثائق وإخراج Flutter — 25 نوفمبر 2026

نفذت التغييرات على فرع `flutter-mobile-app` داخل `/home/ubuntu/wathaeqi-work/mobile/mobile`، مع توثيق في docs وإضافة تقدم إلى TODO دون إزالة القديم. لم يحدث نشر Appwrite إنتاجي أو اتصال كتابي ببيانات الإنتاج. طُبقت التغييرات على فرع Flutter فقط، دون دمجه مع فرع الويب أو تعديل المستودع المرجعي.

## التغييرات

أصبحت المكتبة والاستوديو مساحة واحدة بأربعة تبويبات: الوثائق، القوالب، الأرشيف، الملفات، وأيقونات Lucide المطابقة FileText وLayoutTemplate وArchive وFolderOpen. تتوجه قائمة الغلاف إلى «مساحة الوثائق» فقط. يستهدف زر الإنشاء نسخة المحرر الموجودة، ولا يفتح صفحة استوديو مستقلة ثانية. تبقى المكتبة مكوّناً داخلياً في الملفات؛ يحتفظ البحث والفرز والتصنيف والحالات بحالتها عند التنقل. لا يمسح الانتقال للأرشيف أو القوالب مدخلات المحرر غير المحفوظة. بقيت عمليات القوالب والحقول والإصدارات والإصدار والأرشفة والمزامنة، ولم تتغير هندسة A4.

تجمع `app_theme.dart` primary وaccent `#0f766e` والخلفية `#f4f7f8` والبطاقة `#ffffff` والنص `#172b36` والشريط والقائمة الجانبية `#102e3c` والحدود `#dbe5e8` والذهبي `#c9964d`. يحافظ الداكن على mint `#0f9f9a` وخط Cairo. حُدث غلاف الدخول والعنوان والوصف ولوحة الترحيب وشكل شريط أدوات المحرر دون تعديل الشعار الحالي.

أصبحت `document_native_output.dart` نقطة الطباعة من PDF bytes المحققة عبر `Printing.layoutPdf` مع A4 و`dynamicLayout: false`؛ لا browser أو URL خارجي. تُحترم false كإلغاء. [4] تُنزّل وتُشارك الملفات الأصلية دون إعادة بناء أو تغيير الصيغة. تُلف الصور الموثقة محلياً في PDF للطباعة، خارج UI isolate، دون افتراض endpoint تحويل جديد، ويبقى الأصل كما هو.

يقدم `document_transfer.dart` تقدم receivedBytes/Content-Length فقط، ومرحلة غير محددة حين يكون العمل الخادمي/المحلي أو حجم النقل غير معلوم. يُعرض عد البايتات دون نسبة إذا لم يتوفر طول موثوق أو كان المحتوى مضغوطاً. يحافظ الإلغاء والفشل على حالات UI صادقة؛ فشل الوثيقة يعرض رسالة آمنة وإعادة المحاولة/الإغلاق، ومربع النظام مسؤول عن إلغاء الحفظ/المشاركة/الطباعة بعد تسليمه الإجراء. لا يعرض الإلغاء نجاحاً أو نسبة معالجة تخمينية.

## حدود الثقة والأمن

الممثل هو مستخدم الهاتف بجلسة Appwrite؛ الموارد هي الوثيقة والملف الخاص وإعدادات الترويسة. الحدود هي الهاتف، API Appwrite الحالي، وصلاحية المورد الخادمية. تهديدات المدخلات تشمل الجلسة المفقودة/المنتهية، معرّف وثيقة من جهة أخرى، مسار تلاعب، redirect يسرّب Authorization، ملف كبير/مبتور/غير مطابق، وإلغاء يتبعه إخراج متأخر.

تستخدم طلبات الإخراج نفس bearer session في secure storage وواجهات API القائمة، ولا تستخدم credentials امتياز أو fallback إلى رابط عام أو cache لإخراج ملف محمي. يرفض العميل HTTP خارج localhost ومقاطع المعرف `.` و`..` والمعرفات غير الصالحة وlocal_ غير المزامنة وredirects. الاستقبال محدود إلى 25MiB قبل اكتمال التجميع، ويقارن الطول الفعلي بالمعلن عند الثقة فيه ثم يتحقق من MIME والتوقيع. الإلغاء يستخدم `http.AbortableRequest` وإلغاء اشتراك الاستجابة دون إغلاق HTTP client المشترك. [3] لا تُسجل بيانات الاستجابة الحساسة أو روابط التخزين في أخطاء الإخراج.

إخراج وثيقة محلية محررة يجلب السجل المصرح به وإعدادات الترويسة والمنصة حديثاً، دون إخراج سجل cache بعد رفض التفويض أو استخدام defaults عند فشل هذه القراءة. لم يُنقل audit أو Supabase من المرجع؛ بقي Appwrite وإجراء سجل البرقية الحالي، ولا تُضاف كتابة جديدة إلى الإنتاج. سجل طلب إخراج البرقية ليس دليلاً على اكتمال الطباعة الفعلية، ويمكن أن يسبق إلغاء المستخدم.

## نتائج الأوامر المستقلة

SDK من tag Flutter الرسمي `3.47.9` على GitHub، مثبت خارج المستودع في `/home/ubuntu/flutter-sdk-3.47.9`، revision `c197ca5199e9ee5661e865596c9c07294dfab51c`، على Linux aarch64، ويشمل Dart `3.13.7`. يوافق هذا قيد `^3.13.2`، ولم تتغير pubspec أو lock أو `.fvmrc`. [1] [2] استخدمت الأوامر أدناه مسارات bin المطلقة لهذه النسخة.

- `flutter pub get`: خروج 0. استخدم lock الحالي ولم تُرقَّ الاعتمادات. تنبيه وجود 57 حزمة أحدث ليس تغييراً في المتطلبات.
- `dart format --output=none --set-exit-if-changed lib test`: خروج 0؛ 79 ملفاً، دون تغييرات مطلوبة.
- `flutter analyze --no-pub`: خروج 0؛ `No issues found!`.
- `flutter test --no-pub --reporter expanded`: خروج 0؛ `209: All tests passed!`، بما فيها اختبار طباعة Word بعد إصلاح فاحص زر الواجهة.
- `flutter build apk --debug --no-pub`: خروج 0 على snapshot حديث من مصدر Flutter النهائي؛ جرى التحقق من ZIP وتوقيع APK عبر `apksigner`، ومن اسم الحزمة والإصدار وSDK عبر `aapt`. بصمة APK هي `f46a2e5b7ca692aa23b0c91c861e2203131aa0c83d9255b2394a74919e8b3e94`.
- `git diff --check`: خروج 0.

الأدلة النهائية خارج Git في `/home/ubuntu/wathaeqi-work/evidence/mobile/`: `acceptance-final-after-fix.log`، `document-studio-word-test.log`، `android-sdk-build.log`، `android-build-source-manifest.json`، `android-build-source-changes.json` و`android-build-exit-code.txt`. تغيّر `android/local.properties` داخل snapshot بفعل Flutter عند إضافة مسارات SDK/بناء محلية؛ هذا الملف مستثنى من Git، ومصدر Flutter نفسه لم يتغير أثناء البناء.

تغطي regression القناة الأصلية للطباعة وA4 وثبات PDF bytes والإلغاء والخطأ، ولف صورة في PDF بلا تغيير الأصل، والمصادقة و403 ومعرّفات المسارات وredirects والحجم والتوقيع والتنزيل المبتور وإلغاء stream الخامل، ورسالة فشل آمنة وإعادة المحاولة، وتبويبات Lucide الأربعة وحفظ البحث والتعديل غير المحفوظ وعدم overflow عند 320 و390 و768 و1440. اختبارات 403 تثبت رفض العميل لرد الخادم، ولا تدعي فحص ACL فعلياً بين جهتين.

## الملفات

الملفات التنفيذية المعدلة هي `mobile/lib/api.dart` و`mobile/lib/app_theme.dart` و`mobile/lib/main.dart` و`mobile/lib/document_library_page.dart` و`mobile/lib/document_studio_page.dart` و`mobile/lib/document_output_security.dart` و`mobile/lib/features/telegrams/documents/official_telegram_document.dart`. الملفان الجديدان هما `mobile/lib/document_transfer.dart` و`mobile/lib/document_native_output.dart`.

الاختبار الجديد هو `mobile/test/document_transfer_test.dart`. حُدثت `mobile/test/document_studio_page_test.dart` و`mobile/test/api_test.dart` و`mobile/test/app_theme_test.dart` و`mobile/test/widget_test.dart` دون تعطيل اختبارات قديمة. التوثيق هو `docs/UNIFIED_DOCUMENT_WORKSPACE_2026_AR.md` وهذا التقرير، مع تحديث `TODO.md` إضافي.

## ما لا يزال غير متحقق

لم تُختبر طابعة أو أجهزة Android/iOS فعلية. يلزم اختبار مربع الطباعة والحفظ والمشاركة على الأجهزة وACL Appwrite بجهتين في staging؛ لا يستخدم الإنتاج بديلاً عن ذلك. يتطلب endpoint تحويل DOCX الذي يستدعيه Flutter تحديث Appwrite Function ونشره، ولم يحدث ذلك هنا. تحتاج صور PDF عالية الدقة متعددة الصفحات إلى قياس ذاكرة على الأجهزة الضعيفة. الإلغاء أثناء compute أو raster يتوقف عند اكتمال الوحدة الحالية/checkpoint، ولا يدعي قتل العمل الخادمي الجاري؛ يمنع متابعة الإخراج بعد الإلغاء.

الفحوص محلية وليست شهادة OWASP أو اختبار اختراق. يجب التحقق لاحقاً من حالة GitHub Actions للالتزام المنشور. اختلاف نسخة Flutter في CI عن `.fvmrc` يحتاج متابعة منفصلة، ولم يُعدل workflow خارج النطاق.

## References

[1]: https://docs.flutter.dev/install/archive "Flutter SDK official archive"
[2]: https://github.com/flutter/flutter/tree/3.47.9 "Official Flutter 3.47.9 tag"
[3]: https://pub.dev/documentation/http/latest/http/AbortableRequest-class.html "HTTP abortable request contract"
[4]: https://pub.dev/documentation/printing/latest/printing/Printing/layoutPdf.html "Native Printing layoutPdf contract"
