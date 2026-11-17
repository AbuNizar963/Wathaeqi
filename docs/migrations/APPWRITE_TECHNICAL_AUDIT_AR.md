# تقرير التدقيق الفني قبل تنفيذ ترحيل Appwrite

> الحالة: تدقيق قراءة فقط للمصدر والهدف. لا يحتوي هذا التقرير على ترحيل بيانات أو تغيير مخطط حي أو تعديل صلاحيات Appwrite.
> المستودع: `AbuNizar963/Wathaeqi`
> الفرع الذي جرى فحصه: `main`، مع تنفيذ إصلاح workflow منفصل على `migration/appwrite-phase-1`.

## 1. تصحيح مهم في بنية النشر

أظهر فحص الملفات أن هناك مسارين مختلفين للنشر، ويجب عدم الخلط بينهما:

- **Vercel:** يحتوي المستودع على `api/[...].ts`، وهو catch-all يحمّل `dist/server/app.js` عبر `createApp({ productionStatic: false })`. كما يحتوي `vercel.json` على rewrites توجه `/api` و`/api/*` إلى هذا المسار.
- **Netlify:** الموجود حالياً هو `netlify/functions/api-health.mts` فقط، ومساره `/api/health`. لم يظهر ملف `netlify.toml` في جذر المستودع، ولا توجد وظيفة catch-all حالية لـ `/api/trpc` أو بقية مسارات Express.
- واجهة React ترسل tRPC إلى المسار النسبي `/api/trpc` مع `credentials: include`. لذلك لا يكفي نجاح صفحة Netlify أو نقطة `/api/health` لإثبات أن واجهة API الفعلية تعمل على Netlify.
- `server/app.ts` ما زال يستدعي Supabase مباشرة، ويفرض في بيئة الإنتاج وجود إعدادات Supabase عبر `assertProductionEnvironment()`. أما وظيفة Netlify الصحية فتفحص وجود إعدادات Appwrite فقط وتصرّح صراحة بأن المصادقة والبيانات والتخزين لم تُرحّل بعد.

**القرار:** لا نضيف Express catch-all إلى Netlify قبل حسم مكان تشغيل API فعلياً وتصميم توافقه مع حدود Netlify. توثيق Netlify الرسمي يذكر حدّاً أقصى قدره 6 MB للطلب/الاستجابة المخزنين مؤقتاً في الوظائف. في المقابل، يعرّف التطبيق حالياً حدوداً تصل إلى 16 MB للمرفقات، و22 MB لمعاينة ملف Excel، و50 MB لاستيراد الصفوف. تمرير هذه المسارات كما هي عبر وظيفة Netlify سيكسر بعض الميزات؛ يجب نقل الملفات الكبيرة مباشرة إلى Appwrite Storage أو تصميم رفع مرحلي/دفعات قبل تحويل API إلى Netlify.

مرجع Netlify: https://docs.netlify.com/build/frameworks/framework-setup-guides/express/

## 2. نقاط اتصال Supabase التي تم تحديدها

### الخادم

- `server/_core/supabase.ts`: ينشئ عميل Supabase إداري بمفتاح خادمي.
- `server/db.ts`: طبقة البيانات الرئيسية؛ تستعمل جداول المستخدمين والمؤسسات والإعدادات والبرقيات والمسارات والإصدارات والمرفقات والإشعارات والتدقيق والاشتراكات.
- `server/features/organizations/organization.ts`: عمليات المؤسسات والعضويات والإحالات والموافقات والحذف الآمن.
- `server/features/platform-settings/platformDocumentSettingsRepository.ts`: إعدادات المستندات والعلامة المائية.
- `server/_core/loginRateLimit.ts`: حدّ محاولات الدخول المستمر.
- `server/features/organizations/organizationScope.ts` و`server/ownerAccess.ts`: قراءات خادمية مباشرة للمؤسسات والمستخدمين.
- `server/features/users/userManagementRouter.ts`: عمليات إدارة المستخدمين والجهات، ويتضمن استدعاء purge إضافياً.
- `server/telegramExport.ts`: يعتمد على إعداد مخزن Supabase الحالي في مسارات التصدير.
- `server/_core/storageProvider.ts`: مزود تخزين Supabase الحالي خلف واجهة provider.
- `server/features/storage/storage.ts` و`storageRoutes.ts`: مفاتيح الملفات والرفع الموقّع والتحقق والتنزيل والتنظيف.
- `server/app.ts`: تحقق البرقيات العام، health، وتهيئة Express.
- `server/_core/env.ts`: متغيرات Supabase وبيئة المصادقة.

### المتصفح

يوجد `client/src/lib/supabase.ts` لإنشاء عميل متصفح باستخدام متغيرات `VITE_SUPABASE_*`. يجب التحقق من جميع الاستيرادات والاستخدامات الفعلية لهذا الملف قبل حذفه؛ وجوده وحده لا يثبت أنه مستخدم حالياً.

## 3. وظائف PostgreSQL التي يجب إعادة تصميم سلوكها

تم تحديد الاستدعاءات التالية من طبقات الخادم:

- `set_owner_workplace`
- `save_department_settings_atomic`
- `allocate_serial_number`
- `allocate_organization_serial`
- `preview_organization_outgoing_serial`
- `reserve_organization_outgoing_serial`
- `transition_telegram`
- `owner_dashboard_summary`
- `archive_organization_safely`
- `purge_archived_organization_safely`
- `route_telegram`
- `route_telegram_broadcast_atomic`
- `approve_telegram_route`
- `receive_telegram_route`
- `decide_telegram_route_receiver`
- `consume_auth_login_rate_limit`
- `purge_inactive_user_safely`

كما تحتوي migrations على سلوك إضافي لا يجوز إسقاطه عند استبدال PostgreSQL:

- تخصيص أرقام البرقيات وأرقام المؤسسات مع قفل يمنع التكرار.
- انتقالات حالة البرقية مع فحص العضوية وسبب الإرجاع/الرفض وتعارض revision.
- الإحالة والموافقة والاستلام وقرارات الجهة المستلمة.
- إنشاء نسخ البث الجماعي ومساراتها في عملية ذرية واحدة.
- حفظ إعدادات المؤسسة ذرياً وحماية هوية المؤسسة الرئيسية.
- حد محاولات الدخول المستمر.
- سلسلة تجزئة لسجل التدقيق مع منع UPDATE وDELETE وTRUNCATE.
- حذف/أرشفة المؤسسة والمستخدم بصورة آمنة مع الاحتفاظ بالمراجع التاريخية.

لا يجوز استبدال هذه العمليات بسلسلة عمليات CRUD مستقلة من العميل. يلزم تنفيذها على الخادم، مع معاملات/آليات تنافس آمنة واختبارات فشل وتزامن.

## 4. المصادقة الحالية والمسار الملائم لأسماء المستخدمين

التنفيذ الحالي ليس اعتماداً مباشراً على Supabase Auth لتسجيل الدخول بكلمة المرور:

- يتحقق الخادم من كلمة المرور محلياً باستخدام `scrypt`.
- التجزئة مخزنة في عمود `password_hash` بجدول `users`.
- الجلسة الحالية JWT موقّعة من الخادم في cookie باسم `police_telegrams_session`.
- يتحقق الخادم من `sessionVersion` وحالة الحساب في كل طلب.

هذا مهم لأن بعض حسابات النظام تعتمد اسم المستخدم وقد لا تملك بريداً إلكترونياً. وثائق Appwrite تدعم **Custom Token Login** لبناء مصادقة اسم مستخدم/كلمة مرور مخصصة: يتحقق الخادم أولاً من بيانات الدخول، ثم ينشئ custom token لمستخدم Appwrite ويُستبدل الرمز بجلسة. يجب أن تبقى عملية التحقق من كلمة المرور وتوليد الرمز على الخادم، ولا يصدر الرمز إلا بعد نجاح التحقق.

مراجع Appwrite:
- https://appwrite.io/docs/products/auth/custom-token
- https://appwrite.io/docs/advanced/security/authentication

لا يحتوي جدول Appwrite الحالي `users` على `passwordHash`. قبل تنفيذ المصادقة يجب اعتماد مكان خادمي آمن لتخزين تجزئات كلمات المرور الحالية، مثل جدول بيانات اعتماد منفصل أو حقل محمي مخصص، مع ترحيل قابل للتحقق. لا تُرسل التجزئات إلى المتصفح ولا تُسجّل في السجلات. كما يجب الحفاظ على إبطال الجلسات وتدوير `sessionVersion` وسياسة الحسابات المعطلة.

## 5. مقارنة مخطط Drizzle وAppwrite بعد قراءة جميع الأعمدة

تمت قراءة جميع أعمدة الجداول الأربعة عشر باستخدام استعلام يرفع حد النتائج إلى 100 عمود؛ لم نعتمد على أول 25 عموداً فقط. جميع الجداول الأربعة عشر المقابلة موجودة في قاعدة Appwrite، ولم يظهر عمود بيانات مفقود سوى `password_hash` في جدول `users`. توجد أيضاً أعمدة علاقات إضافية في Appwrite لبعض الجداول.

| الجدول | أعمدة المصدر في Drizzle | أعمدة Appwrite | النتيجة الأساسية |
|---|---:|---:|---|
| `organizations` | 10 | 10 | الأسماء متطابقة؛ `id` لا يملك مولداً افتراضياً، وحقلا `type` و`isActive` اختياريان في Appwrite رغم إلزامهما في المصدر |
| `users` | 22 | 22 بما فيها علاقة المؤسسة | `password_hash` غير موجود؛ أعمدة الدور والحالة وبعض بيانات الحساب اختيارية في Appwrite |
| `department_settings` | 23 | 25 بما فيها علاقتان | الحقول موجودة؛ `configKey` وبعض حقول الإعدادات المطلوبة في المصدر اختيارية في Appwrite، ولا يوجد فهرس فريد مطابق لـ `configKey` |
| `platform_document_settings` | 7 | 8 بما فيها علاقة | `id` في المصدر smallint افتراضيه 1، وفي Appwrite integer بلا default؛ بعض الحقول الإلزامية أصبحت اختيارية |
| `organization_memberships` | 7 | 9 بما فيها علاقتان | الحقول موجودة؛ `role` و`isActive` اختياريان في Appwrite رغم NOT NULL في المصدر |
| `telegrams` | 35 | 37 بما فيها علاقتان | جميع حقول البيانات موجودة؛ توجد فروق في إلزامية revision وحقول الحالة، وفي تمثيل creatorEmail |
| `telegram_versions` | 7 | 9 بما فيها علاقتان | تطابق حقول البيانات؛ تمثيل snapshot في Appwrite longtext مقابل text في المصدر |
| `telegram_attachments` | 11 | 13 بما فيها علاقتان | `storageKey` محدود إلى 512 في Appwrite مقابل text غير محدود في المصدر؛ scanStatus اختياري هناك |
| `telegram_actions` | 9 | 11 بما فيها علاقتان | حقول البيانات والقيم المقيدة للحالات موجودة |
| `telegram_routes` | 22 | 22 | الحقول موجودة؛ status وحقلا حالة الموافقة/قرار المستلم اختياريان في Appwrite، ولا تظهر علاقات Appwrite مقابلة لمفاتيح المصدر الأجنبية |
| `notifications` | 10 | 10 | الحقول موجودة، لكن علاقات المستخدم والمؤسسة والبرقية والمسار لا تظهر كعلاقات Appwrite |
| `push_subscriptions` | 10 | 10 | `p256dh` و`auth` محدودان في Appwrite إلى 512 و256 حرفاً، بينما هما text في المصدر |
| `mobile_push_tokens` | 8 | 8 | حقول البيانات موجودة، لكن علاقات المستخدم والمؤسسة غير معرفة كعلاقات Appwrite |
| `audit_logs` | 19 | 19 | الحقول موجودة؛ deviceType اختياري في Appwrite رغم NOT NULL في المصدر، وسلوك append-only لا ينشأ تلقائياً من المخطط |

### 5.1 توليد المعرّفات والتواريخ

هذه من أهم نقاط الترحيل، ولا يجوز تجاوزها:

- المصدر ينشئ `organizations.id` كـ UUID افتراضياً. عمود Appwrite المقابل varchar بطول 36 ومطلوب، لكن لا يظهر له default.
- المصدر يستخدم `serial` لتوليد المعرّفات الرقمية في 12 جدولاً: `users`, `department_settings`, `organization_memberships`, `telegrams`, `telegram_versions`, `telegram_attachments`, `telegram_actions`, `telegram_routes`, `notifications`, `push_subscriptions`, `mobile_push_tokens`, `audit_logs`. أعمدة Appwrite الرقمية المطلوبة لا تعرض مولداً تلقائياً.
- `platform_document_settings.id` في المصدر smallint مع default يساوي 1؛ عمود Appwrite integer مطلوب بلا default.
- حقول `createdAt` و`updatedAt` تعتمد `defaultNow()` في المصدر. Appwrite يطلب قيمها صراحة ولا يعرض default لها. وينطبق ذلك أيضاً على `users.lastSignedIn`.
- لا يجوز الاعتماد على معرفات صفوف Appwrite الداخلية `$id` كبديل مباشر قبل تصميم طبقة تحويل؛ التطبيق الحالي يعتمد معرّفات رقمية في الروابط والعلاقات وواجهات API.

**قرار التنفيذ المطلوب:** تصميم مولّد معرفات خادمي ذري لكل جدول رقمي، مع اختبار ضغط وتزامن وإعادة محاولة عند تعارض المعاملة، أو اعتماد إعادة تصميم شاملة للمعرّفات بعد تحليل كل المستهلكين. لا تُنشأ جداول عدادات على قاعدة الإنتاج في مرحلة التدقيق.

### 5.2 الفروق في أنواع الحقول والقيود

- عمودا `users.email` و`telegrams.creatorEmail` في المصدر varchar بطول 320، بينما Appwrite يستخدم string بصيغة email. يجب فرض حد الطول نفسه في التحقق الخادمي.
- `telegram_attachments.storageKey` في المصدر text، بينما Appwrite varchar بطول 512. يلزم فحص أطوال المفاتيح الفعلية قبل اعتماد الترحيل.
- `push_subscriptions.p256dh` و`auth` في المصدر text، بينما Appwrite يحدهما إلى 512 و256. يلزم التحقق من أطوال القيم الحالية.
- `telegram_versions.snapshot` وحقول النصوص الطويلة ممثلة كـ longtext في Appwrite؛ هذا توسيع سعة في العادة، لكن يلزم اختبار round-trip للمحتوى العربي وJSON حرفياً.
- أعمدة enum في Appwrite ليست نصوصاً مفتوحة كما ورد في التقييم الأولي. فحص المخطط الكامل أظهر حقول string بصيغة enum وقوائم عناصر في `organizations.type`, `users.role`, `department_settings.numberSystem`, `organization_memberships.role`, `telegrams.classification/priority/category/status`, `telegram_actions.fromStatus/toStatus`, و`telegram_routes.status`. القيم المقروءة تطابق قوائم enum في Drizzle حالياً. يجب مع ذلك إبقاء تحقق الخادم واختبارات رفض القيم غير المسموحة.
- توجد حقول لها default مطابق تقريباً لكنها اختيارية في Appwrite مقابل NOT NULL في المصدر؛ يجب عدم تمرير null إليها، وإضافة تحقق خادمي صريح بدلاً من اعتبار وجود default تكافؤاً كاملاً.

### 5.3 اختلافات الفهارس والتفرّد

الفهارس التي تمت قراءتها في Appwrite وعددها لكل جدول: organizations (5)، users (4)، department_settings (2)، platform_document_settings (1)، organization_memberships (3)، telegrams (10)، telegram_versions (3)، telegram_attachments (5)، telegram_actions (3)، telegram_routes (5)، notifications (3)، push_subscriptions (4)، mobile_push_tokens (4)، audit_logs (7).

الفروق المؤثرة التي ظهرت عند مقارنتها بفهرسة المصدر وملفات SQL migrations:

- `organizations_single_central_root_idx`: فهرس فريد جزئي في المصدر يضمن وجود جذر مركزي واحد؛ غير موجود في Appwrite.
- `organizations_parent_name_unique_idx`: يمنع تكرار اسم الجهة بعد trim/lower داخل الجهة الأم؛ غير موجود في Appwrite.
- `users_username_lower_unique_idx`: يضمن username فريداً دون حساسية لحالة الأحرف؛ Appwrite يملك فهرساً عادياً غير فريد على username.
- `users_single_platform_owner_idx`: يمنع وجود أكثر من مالك منصة؛ غير موجود في Appwrite.
- `department_settings.configKey`: فريد في المصدر، بما في ذلك قواعد المفتاح القديم الجزئية التي أضافتها migrations؛ Appwrite يملك فهرساً فريداً على organizationId فقط ولا يظهر فهرس فريد لـ configKey.
- فهارس المسارات `telegram_routes_route_serial_idx` وفهارس الأرقام الواردة/الصادرة، وفهرس `telegram_routes_receiver_decision_by_user_fk_idx` غير ظاهرة في Appwrite.
- فهرسا المفاتيح الأجنبية `notifications_route_id_fk_idx` و`notifications_telegram_id_fk_idx` غير ظاهرين في Appwrite.
- فهرس `push_subscriptions` الفريد على endpoint موجود في Appwrite كما هو في المصدر. فهرس المصدر الإضافي المركب (userId, endpoint) غير ظاهر، لكنه لا يضيف قيد فرادة جديداً ما دام endpoint نفسه فريداً عالمياً؛ لذلك لا يصنف كاختلاف سلوكي مثبت.
- فهارس الجداول الأخرى التي تمت قراءتها متقاربة في الأعمدة والغرض، لكن يلزم اختبار أداء الاستعلامات الفعلية بعد بناء المستودعات.

لا يمكن استبدال الفهارس الجزئية أو الفريدة الحساسة لحالة الأحرف بمجرد تحقق واجهة المستخدم؛ يجب فرضها على الخادم ضمن معاملات متزامنة، واختبار طلبين متزامنين يحاولان إنشاء قيم متعارضة.

### 5.4 العلاقات والمفاتيح الأجنبية

توجد أعمدة علاقات Appwrite لبعض الجداول، لكن لا يوجد تماثل كامل مع مفاتيح PostgreSQL الأجنبية. من الفروق الواضحة:

- `telegrams.currentOrganizationId` يحتاج علاقة منفصلة إلى organizations؛ علاقة `organization` الحالية لا تغطي تلقائياً هذا الحقل.
- `telegram_routes` يحتوي مفاتيح مصدرية إلى telegrams والمؤسستين والمستخدم المحيل، لكن لم تظهر أعمدة علاقة Appwrite مقابلة.
- `notifications` يحتوي مفاتيح مصدرية إلى users وorganizations وtelegrams وtelegram_routes، ولا تظهر علاقات Appwrite مقابلة.
- `push_subscriptions` و`mobile_push_tokens` يحتويان مفاتيح مصدرية إلى users وorganizations، ولا تظهر علاقات Appwrite مقابلة.
- `audit_logs.organizationId` متروك بلا FK في المصدر عمداً حتى تبقى الأحداث التاريخية بعد تغيّر دورة حياة المؤسسة؛ يجب الحفاظ على هذا القرار وعدم إضافة حذف متسلسل له.

يجب توثيق سلوك onDelete لكل علاقة قبل اعتماد schema النهائي. لا نضيف علاقات Appwrite عشوائياً، لأن cascade أو restrict الخاطئ قد يحذف سجلات تاريخية أو يمنع عمليات أرشفة صحيحة.

## 6. جداول المصدر الإضافية والصلاحيات

### 6.1 جداول SQL الموجودة خارج مخطط Drizzle

كشفت migrations عن ثلاثة جداول تشغيلية إضافية لا تظهر في جرد Appwrite الحالي:

- `auth_login_rate_limits`: تخزين مستمر لحد محاولات تسجيل الدخول.
- `audit_purge_receipts`: إيصالات مرتبطة بعمليات تنظيف/حذف سجل التدقيق المصرح بها.
- `user_purge_receipts`: إيصالات مرتبطة بعمليات حذف المستخدم الآمنة.

لا توجد جداول مطابقة لهذه الأسماء ضمن قاعدة Appwrite الحالية. يجب تصميم بدائلها قبل نقل ميزات الحماية أو purge، وعدم إسقاط هذه الوظائف أو اعتبارها سجلات اختيارية.

### 6.2 Triggers ووظائف قاعدة البيانات

من migrations تم تحديد سلوك triggers التالي، ويجب إعادة بنائه واختباره على الخادم أو ضمن معاملات Appwrite:

- تحديث `updatedAt` تلقائياً في users وdepartment_settings وtelegrams وorganizations وorganization_memberships.
- منع دورات شجرة المؤسسات عبر `organizations_parent_acyclic_guard`.
- حماية عضوية مالك المنصة عبر `guard_owner_membership_change`.
- رفع revision للبرقية ومنع الكتابة فوق نسخة أحدث عبر `telegrams_revision_update`.
- إعادة تخصيص/استرداد أرقام المؤسسة عند حذف البرقية أو المسار عبر `telegrams_reclaim_organization_serial` و`telegram_routes_reclaim_organization_serial`.
- إنشاء hash chain لسجل التدقيق ومنع تعديل الصفوف أو حذفها أو truncate عبر `audit_logs_assign_integrity_hash`, `audit_logs_prevent_row_mutation`, و`audit_logs_prevent_truncate`.

وتتضمن وظائف PostgreSQL التي تحتاج مقابلاً خادمياً مكافئاً: `allocate_serial_number`, `allocate_organization_serial`, `preview_organization_outgoing_serial`, `reserve_organization_outgoing_serial`, `save_department_settings_atomic`, `set_owner_workplace`, `route_telegram`, `route_telegram_broadcast_atomic`, `transition_telegram`, `approve_telegram_route`, `receive_telegram_route`, `decide_telegram_route_receiver`, `consume_auth_login_rate_limit`, `owner_dashboard_summary`, `archive_organization_safely`, `purge_archived_organization_safely`, و`purge_inactive_user_safely`. كما توجد وظائف مساعدة خاصة بالتحقق من شجرة المؤسسات وسجل التدقيق واسترداد الأرقام.

لا يجوز استبدال هذه الوظائف بعمليات CRUD متفرقة أو من المتصفح. كل عملية يجب أن تتحقق من المستخدم الفعلي والعضوية والصلاحية ونطاق المؤسسة، وأن تنفذ التغييرات المرتبطة كوحدة ذرية أو بتصميم تعويض موثق عند تعذر ذلك.

### 6.3 صلاحيات Appwrite الحالية

- قاعدة Appwrite تحتوي 19 جدولاً: 14 جدولاً تقابل أسماء جداول المصدر، وخمسة جداول إضافية هي `documents`, `templates`, `contacts`, `attachments`, `app_records`. لا تُحذف الجداول الإضافية ولا يعاد استخدامها دون معرفة غرضها وموافقة منفصلة.
- Row Security مفعّل في أربعة جداول فقط من أصل 19: `documents`, `templates`, `contacts`, `attachments`. جميع جداول الأعمال الأربعة عشر المقابلة للمصدر لديها rowSecurity=false وصلاحيات الجدول الظاهرة فارغة؛ وكذلك `app_records`.
- هذا لا يثبت أن البيانات مكشوفة للعامة، لكنه يعني أن ربط التطبيق بهذه الجداول يتطلب سياسة وصول مصممة ومختبرة قبل أول كتابة.
- عند استعمال API key خادمي، لا يكفي الاعتماد على صلاحيات الصفوف في Appwrite؛ يجب أن يفرض الخادم عزل المؤسسات والتحقق من الملكية في كل قراءة وكتابة.
- يجب أن تبقى مفاتيح الخادم خارج `VITE_*` وألا تصل إلى bundle المتصفح أو ملفات السجل.

مرجع Appwrite للصلاحيات وسلوك API key: https://appwrite.io/docs/advanced/security/authentication


### 6.4 مخزن المرفقات في Appwrite

تمت قراءة إعدادات bucket `document-attachments` مباشرة:

- المخزن مفعّل، و`fileSecurity=true`، وصلاحياته الظاهرة تتضمن `create("users")` دون قراءة عامة.
- `maximumFileSize=10,485,760` بايت (10 MiB)، وهو مطابق لحد حجم الملف الفعلي في `server/routers.ts` و`server/features/storage/storageRoutes.ts`. حد 16 MiB في Express هو حد جسم طلب Base64 وليس حد الملف الأصلي.
- التشفير ومكافحة الفيروسات مفعّلان، و`stripMetadata=true`.
- الامتدادات المسموحة حالياً: pdf, png, jpg, jpeg, webp, doc, docx.
- الخادم الحالي يقبل أيضاً `audio/mpeg`, `audio/wav`, و`audio/webm` بعد التحقق من توقيع الملف الثنائي. هذه الصيغ غير موجودة في قائمة امتدادات bucket، ولذلك يجب إضافتها في إعدادات المخزن أو إثبات مسار تخزين بديل قبل التحويل حتى لا تتعطل مرفقات الصوت.
- الحجم الإجمالي الحالي للمخزن صفر وقت الفحص؛ لا يعني ذلك أن مخزن Supabase الحالي خالٍ من ملفات يجب ترحيلها.

لا تُعدّل bucket أو صلاحياته الحية في هذه المرحلة. أي تغيير في الامتدادات أو الحدود يتطلب موافقة منفصلة، ثم اختبار رفع/قراءة/حذف لكل نوع ملف مع صلاحيات المستخدم والمؤسسة.

### 6.5 فحص سلسلة التوريد

أظهر فحص OSV في GitHub Actions اعتماداً عالي الخطورة واحداً: `picomatch@4.0.7`، ضمن سلسلة أدوات البناء `vite -> tinyglobby/fdir -> picomatch`؛ وهو اعتماد تطوير/بناء وليس استدعاءً مباشراً من مسارات تشغيل التطبيق. التحذير يتعلق بـ ReDoS في أنماط repeated extglob، CVE-2026-112366 / GHSA-fc5q-39xc-vjpf. لم يكن هناك إصدار رسمي مصحح متاح وقت التدقيق.

المعالجة في فرع الترحيل هي backport محدود من التغيير المقترح في upstream PR #238، مع اختبار انحدار محلي، واستثناء OSV دقيق للإصدار 4.0.7 فقط ينتهي في 2026-12-17. يجب تعريف `patchedDependencies` في `pnpm-workspace.yaml` لأن pnpm 12 لا يقرأ هذا الإعداد من `package.json`. تم نقل الإعداد إلى ملف workspace والتحقق من تطبيقه عبر تجديد lockfile؛ لا نعتبره إصلاحاً نهائياً قبل نجاح اختبار الانحدار وSupply Chain على commit النهائي. هذا ليس ادعاءً بأن upstream أصدر نسخة مصححة؛ يجب إزالة الاستثناء والـ patch فور توفر إصدار رسمي مصحح والتحقق منه.

كشف فحص OSV اللاحق أربع ثغرات متوسطة في الاعتماديات التالية:
- `esbuild@0.18.20` عبر `@esbuild-kit/core-utils`، ضمن أدوات Drizzle التطويرية.
- `glob@10.5.0` و`minimatch@9.0.9` عبر `rimraf@5.0.10` الاختياري في سلسلة Google Cloud الاختيارية.
- `postcss-selector-parser@6.0.10` عبر إضافة Tailwind التطويرية.

أُضيفت overrides محددة للإصدارات المتأثرة فقط: esbuild إلى 0.25.12، وrimraf إلى 6.1.4 (ليستخدم glob 14.0.3 وminimatch 11.0.2)، وpostcss-selector-parser إلى 6.1.6. لا تُستخدم استثناءات OSV لهذه الحزم؛ يجب أن يثبت lockfile وSupply Chain زوال التنبيهات وأن تجتاز اختبارات المشروع قبل اعتماد التحديث. أعاد workflow توليد `pnpm-lock.yaml`، وأصبحت هذه الإصدارات مثبتة فعلياً في شجرة الاعتماديات؛ نتيجة Supply Chain بعد هذا التحديث ما زالت بانتظار Actions. احتُفظ أيضاً بإعدادات workspace الأصلية كاملة: قائمة الحزم، patch الخاص بـ `wouter@3.7.1`، وكل overrides وallowBuilds السابقة؛ أضيفت إعدادات Appwrite وpicomatch فوقها دون حذفها. يؤكد lockfile وجود patch لكل من wouter وpicomatch.

## 7. معاملات Appwrite والعمليات الذرية

يوفر Appwrite TablesDB معاملات للصفوف يمكنها جمع عمليات كتابة عبر جداول وقواعد بيانات متعددة ثم اعتمادها كوحدة ذرية واحدة. توثيق Appwrite يوضح دورة `createTransaction` ثم تمرير `transactionId` إلى عمليات الصفوف أو `createOperations` ثم `updateTransaction` للاعتماد أو التراجع. يكتشف Appwrite التعارض إذا تغير صف متأثر خارج المعاملة قبل الاعتماد.

هذا يوفر أساساً عملياً لإعادة بناء أجزاء من RPCs الحالية، لكنه لا يحوّل دوال PostgreSQL تلقائياً ولا يغني عن منطق التحقق من العضوية والصلاحيات في الخادم. يجب اختبار:
- التنافس على عدادات الأرقام التسلسلية مع إعادة المحاولة عند conflict.
- اعتماد البرقية والمسار والإجراءات والإشعارات المرتبطة بها كوحدة واحدة حيث يلزم.
- فشل أي خطوة والتأكد من عدم بقاء نصف عملية.
- حد العمليات لكل معاملة وفق خطة Appwrite الفعلية، وانتهاء صلاحية المعاملة، وعدم تضمين تغييرات المخطط داخل المعاملة.

مرجع Appwrite: https://appwrite.io/docs/products/databases/tablesdb/transactions

## 8. خطوات التنفيذ التالية

1. إنهاء جرد جميع استدعاءات Supabase في ملفات المصدر، بما فيها الاستيرادات غير المباشرة واستخدامات عميل المتصفح.
2. استكمال مقارنة الأعمدة والفهارس والعلاقات والقيود لكل جدول، والتحقق من كل دالة SQL/trigger وسلوكها.
3. حسم هدف تشغيل API (Vercel أو Netlify) قبل بناء adapter؛ لا يجوز افتراض أن Netlify health function هي API التطبيق.
4. تصميم اختبارات Appwrite معزولة لا تكتب إلى جداول الإنتاج.
5. بناء عميل Appwrite خادمي واختباراته أولاً، ثم مستودع واحد في كل مرة مع عدم إزالة Supabase حتى اكتمال التحقق.
6. إعادة تصميم رفع الملفات الكبيرة والاستيراد على دفعات/رفع مباشر قبل اعتماد Netlify Functions، حفاظاً على ميزات التطبيق وحدود حجمها.

## 9. ما لم يحدث

- لم تُنقل أي بيانات.
- لم تُنشأ أو تُحذف أو تُعدّل جداول Appwrite أو صلاحياتها.
- لم تتغير مفاتيح Appwrite أو متغيرات Netlify أو إعدادات Vercel.
- لم يُوقف Supabase ولم تُحذف أي بيانات منه.
- لم يتغير الفرع `main` ولم يُدمج PR.
