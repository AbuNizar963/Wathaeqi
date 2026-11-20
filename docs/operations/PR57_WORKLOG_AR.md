# سجل تنفيذ استعادة ميزات البرقيات (PR 57)

## النطاق

- المستودع المستهدف: `AbuNizar963/Wathaeqi` فقط، على الفرع `feat/restore-missing-wathaeqi-features` (PR 57).
- مستودع `police-telegrams-platform` مرجع قراءة فقط، ولم يُعدّل.
- لا Supabase: كل الوصول إلى البيانات عبر Appwrite TablesDB وAppwrite Storage وAppwrite Auth.
- لا حذف لأي جدول أو عمود أو صف قائم: كل تغييرات المخطط إضافية (Additive) وينفّذها سكربت قابل للتكرار.

## قرارات معمارية

1. **مصدر واحد للنطاق:** `shared/telegrams.ts` يحوي الحالات والانتقالات والتسميات العربية ودوال الإحصاء والبحث، ويستورده الخادم والويب والاختبارات.
2. **هوية رقمية متوافقة:** كل برقية تحمل عمود `id` رقميًا (كما يتوقعه تطبيق Flutter والعقود الحالية) مع `$id` نصيًا من Appwrite؛ يتم تخصيص الأرقام من جدول `counters` بعملية `Operator.increment` الذرية.
3. **التسلسل الرسمي:** `PREFIX-YYYY-MM-DD-00001` يُبنى في المنطقة الزمنية للجهة، ويُخصّص داخل `department_settings.nextOutgoingSerial` / `nextIncomingSerial`.
4. **سير العمل:** مصفوفة انتقالات مطابقة للمرجع (مسودة → مراجعة → اعتماد/إعادة/رفض → إحالة → استلام → إنجاز → أرشفة) وتُفرض على الخادم في `transitionTelegram`.
5. **الإحالات:** الإحالة إلى جهة تابعة مباشرة تُنفّذ فورًا (`not_required`)، والإحالة خارج ذلك تتطلب اعتماد السلطة الأعلى (`pending`) مع قرار مستقل للجهة المستلمة (قبول/رفض).
6. **المرفقات:** تُخزّن في Appwrite Storage بمفتاح `telegrams/{id}/{uuid}-{name}` مع SHA-256 وحجم ونوع، والتنزيل يمر عبر الخادم بعد التحقق من نطاق الجهة.
7. **Excel:** نفس قالب المرجع `server/assets/telegram-register-template.xlsx`، مع تصدير محمي بكلمة مرور واستيراد يدعم الملفات المشفرة.
8. **الصلاحيات:** مالك المنصة يرى كل الجهات؛ مدير الجهة/المدير الإقليمي يرى جهته والفروع التابعة؛ بقية الأدوار ترى جهتها فقط، والإجراءات تتطلب أن تكون البرقية في جهة المستخدم الحالية.

## ما تم إنجازه في هذا الفرع

- `shared/telegrams.ts`: النطاق الكامل (حالات، انتقالات، تسميات، إحصاء، بحث، تسلسل).
- `shared/appwriteSchema.ts` + `scripts/appwrite-schema.ts`: تعريف وإ provisioning لـ 11 جدولًا (telegrams, telegram_versions, telegram_actions, telegram_attachments, telegram_routes, department_settings, notifications, mobile_push_tokens, organizations, contacts, counters) مع فحص انحراف `pnpm appwrite:schema:check`.
- `server/features/telegrams/*`: مستودع Appwrite + نطاق الصلاحيات + راوتر كامل (إنشاء، تعديل، انتقالات، حذف، إصدارات، إجراءات، مرفقات، إحالات، اعتماد، استلام، تصدير/استيراد Excel، إعادة إصدار، تسجيل إخراج المستندات).
- `server/features/organizations/organizationService.ts`: شجرة الجهات، الفروع، أهداف الإحالة، الشعار.
- `server/features/users/userService.ts`: إدارة الحسابات عبر Appwrite Auth + الملف التعريفي + العضوية.
- `server/features/notifications/notificationService.ts`: صندوق الإشعارات ورموز الدفع للجوال.
- `server/telegramWorkbook.ts` و`server/telegramImportWorkbook.ts` و`server/importedDate.ts` و`server/assets/telegram-register-template.xlsx`: منقولة من المرجع مع تكييف الاستيراد.

## الخطوات المتبقية

- [ ] راوترات: إعدادات القسم، الجهات، المستخدمون، الإشعارات، بحث التدقيق، لوحة المعلومات والتقارير.
- [ ] ربط الراوترات في `ownerApiRouter` وتحديث عقد API للجوال.
- [ ] واجهة الويب: صفحة البرقيات (قائمة/إنشاء/تفاصيل/سير عمل/مرفقات/Excel)، لوحة المعلومات، سجل التدقيق، إعدادات القسم، إدارة الجهات والمستخدمين.
- [ ] اختبارات وحدات وتكامل للمستودع والراوتر والواجهة.
- [ ] مزامنة فرع `flutter-mobile-app` مع العقود الجديدة.
- [ ] تشغيل الفحوص والبناء وGitHub Actions، ثم رابط معاينة حقيقي قبل الدمج.
