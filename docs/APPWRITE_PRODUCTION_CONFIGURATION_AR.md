# إعدادات Appwrite الإنتاجية — وثائقي

هذه الوثيقة مرجع إعدادات الإنتاج المرتبطة بمستودع `AbuNizar963/Wathaeqi`. مصدر النشر الحي هو تكامل Appwrite VCS مع GitHub؛ لا تستخدم GitHub Actions لإنشاء نشر Appwrite موازٍ.

## المشروع والربط

- Appwrite Project ID: `wathaeqi`
- المنطقة: `fra`
- API endpoint: `https://fra.cloud.appwrite.io/v1`
- مستودع GitHub: `AbuNizar963/Wathaeqi`
- فرع الويب والإنتاج: `main`
- Web platform hostname: `wathaeqi.appwrite.network`
- Appwrite Function API: `https://wathaeqi-api.fra.appwrite.run`

## موقع الويب الإنتاجي

- Site ID: `6afe175b001ec2bc89f0`
- الفرع: `main` فقط.
- Root directory: `./`
- Build runtime: Node.js 24.
- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm build`
- Output directory: `dist/public`
- SPA fallback: `index.html`
- Logging: enabled.
- Deployment retention: 30 يومًا.
- Appwrite VCS هو المسؤول عن النشر التلقائي عند تحديث `main`.

## وظيفة API الإنتاجية

- Function ID: `wathaeqi-api`
- Runtime: Node.js 24.
- VCS branch: `main` فقط.
- Provider root: `.`
- Entrypoint: `appwrite/functions/wathaeqi-api/build/main.cjs`
- Build command:
  `npm install --prefix appwrite/functions/wathaeqi-api --include=dev --no-audit --no-fund && npm run build --prefix appwrite/functions/wathaeqi-api && node scripts/verify-appwrite-api-bundle.mjs && rm -rf appwrite/functions/wathaeqi-api/node_modules appwrite/functions/wathaeqi-api/package-lock.json`
- Timeout: 60 ثانية.
- Deployment retention: 30 يومًا.
- Execution permission: `any` لأن تسجيل الدخول يبدأ قبل وجود جلسة؛ الحماية الفعلية داخل API عبر Appwrite Auth والتحقق من الجلسة وتحديد CORS وتحديد معدل المحاولات.
- Required execution scopes: `databases.read`, `tables.read`, `tables.write`, `rows.read`, `rows.write`, `sessions.write`, `users.read`, `users.write`, `files.read`, `files.write`, `tokens.write`.

## متغيرات البيئة

### على Appwrite Site

- `VITE_APPWRITE_API_URL=https://wathaeqi-api.fra.appwrite.run`

هذا عنوان عام وليس سرًا.

### على Appwrite Function

- `APPWRITE_DATABASE_ID=wathaeqi-db`
- `APPWRITE_BUCKET_ID=document-attachments`
- `APPWRITE_WEB_ORIGINS=https://wathaeqi.appwrite.network`
- `NODE_ENV=production`
- `AUTH_SESSION_SECRET`: سر عشوائي طويل محفوظ كمتغير Secret داخل Function فقط. لا يُحفظ في GitHub أو ملفات الواجهة أو المستودع.
- `OWNER_SETUP_SECRET`: مسار إعداد المالك لمرة واحدة؛ سجل استهلاكه موجود بالفعل، فلا يُعاد تفعيله أو تدويره ضمن النشر المعتاد.

لا تضف مفاتيح Appwrite أو أسرار الجلسات إلى متغيرات `VITE_` أو إلى Git.

المصادقة لا تستخدم ملفات تعريف الارتباط: تُرسل الواجهة رمز Bearer مشفّراً ومتحققاً من سلامته في `Authorization` عبر HTTPS، ويُحفظ مؤقتاً في `sessionStorage` لمدة لا تتجاوز 12 ساعة. لا يحتوي الرمز على سر جلسة Appwrite بصيغة قابلة للقراءة. يجب أن يسمح إعداد Function بطلبات `OPTIONS` وترويسة `Authorization` من أصل الموقع المحدد في `APPWRITE_WEB_ORIGINS`.

## التخزين

- Bucket ID: `document-attachments`
- الحد الأقصى: 25 MiB، متوافق مع حد الرفع في عميل الويب والهاتف.
- الامتدادات: PDF وPNG وJPG وJPEG وWEBP وDOC وDOCX.
- File security: enabled.
- Encryption: enabled.
- Antivirus: enabled.
- Metadata stripping: enabled.
- صلاحية إنشاء الملفات للمستخدمين، مع بقاء الملفات خاصة والتحكم الفردي بالملفات مفعّلًا.

**ملاحظة منصة:** Appwrite لا يشغّل فحص مضاد الفيروسات ولا إزالة بيانات الصور الوصفية للملفات التي تتجاوز 20 MiB حتى مع تفعيل الخيارين. لذلك يجب إبقاء التحقق من نوع الملف وحجمه في التطبيق والخادم، والنظر في فحص إضافي للملفات الكبيرة إذا أصبحت الحاجة إليه قائمة.

## المصادقة والجلسات

- الحد الأدنى لكلمة المرور في Appwrite: 12 محرفًا، مطابق لحد التطبيق.
- فحص كلمات المرور المخترقة: enabled.
- إبطال الجلسات عند تغيير كلمة المرور: enabled.
- حد الجلسات: 10.
- مدة الجلسة القصوى الحالية: سنة واحدة.
- ملفات تعريف الارتباط عبر النطاقات: `SameSite=None; Secure; HttpOnly`.

## المعاينة

الموقع `wathaeqi-preview` مرتبط بفرع ترحيل قديم، وليس بيئة خلفية معزولة. لا تستخدمه لاختبار الكتابة أو تعديل بيانات الإنتاج. لا يُسمح لنطاق المعاينة باستدعاء API الإنتاج عبر قائمة CORS. يجب إنشاء API وقاعدة بيانات وتخزين منفصلين قبل اعتماد معاينة تكاملية كاملة.

## مخطط جداول Appwrite

نشر Site/Function عبر Appwrite VCS لا يطبّق تغييرات مخطط TablesDB تلقائيًا. عند ظهور خطأ مثل `Unknown attribute: "headerDividerStyle"`، فهذا يعني أن قاعدة بيانات Appwrite المستهدفة لا تحتوي العمود الذي يعرفه `shared/appwriteSchema.ts`. شغّل الفحص والتطبيق على مشروع Staging معزول فقط، مستخدمًا معرّفات ومفتاح API الخاصين به:

```sh
pnpm exec tsx scripts/appwrite-schema.ts --check --table platform_document_settings
pnpm exec tsx scripts/appwrite-schema.ts --apply --table platform_document_settings
pnpm exec tsx scripts/appwrite-schema.ts --check --table platform_document_settings
```

الخيار `--apply` يضيف الأعمدة والفهارس الناقصة فقط ولا يحذف أو يعيد تسمية أو يكتب فوق أعمدة أو صفوف موجودة. يجب أن ينتهي الفحص الأخير بلا انجراف قبل اختبار حفظ الإعدادات والشعار على Staging. لا تستخدم `wathaeqi-preview` أو بيانات اعتماد الإنتاج لهذا الغرض؛ لا توجد بيئة Staging معزولة متاحة لهذه الجلسة.

## GitHub Actions

- Actions مسؤولة عن الفحص والاختبارات والبناء الأمني.
- Appwrite VCS مسؤول عن نشر Site وFunction.
- لا حاجة إلى أسرار نشر Appwrite في GitHub ما دام تكامل Appwrite VCS يعمل.
- يجب أن تنجح CI وPlaywright وCodeQL وفحوص الأسرار وسلسلة التوريد قبل اعتماد تغييرات الويب.

## حالة فرع الهاتف

فرع `flutter-mobile-app` فرع ترحيل مستقل وقديم، ولا يدخل ضمن نشر الويب الإنتاجي. لا يُعد هذا الفرع متوافقًا بالكامل مع عقد API الإنتاجي الحالي حتى تُستكمل مواءمة طبقة الخادم وCI عليه بصورة مستقلة. لا تحذف إعدادات مزودي الخدمة القديمة أو تغيّرها في هذا الفرع قبل ترحيل كل الاستدعاءات واختبارها؛ حذف متغيرات البيئة وحده قد يعطّل أجزاء من الكود القديم.
