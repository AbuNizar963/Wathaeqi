# فجوة عقد تطبيق الهاتف مع Appwrite

## الحالة

يعتمد تطبيق `flutter-mobile-app` على Appwrite Function في:

```text
https://wathaeqi-api.fra.appwrite.run
```

لكن تطبيق الهاتف الحالي لا يقتصر على إجراءات مكتبة الوثائق؛ فهو يستدعي أيضاً إجراءات البرقيات والإشعارات والتقارير وإدارة الجهات القديمة. لذلك لا يجوز حذف نسخة الخادم القديمة من فرع الهاتف قبل نقل هذه الإجراءات إلى Appwrite واختبارها.

## الإجراءات التي يحتاجها الهاتف

من `mobile/lib/api.dart`، تشمل المجموعة الحالية:

- المصادقة: `auth.login`, `auth.logout`, `auth.me`.
- الوثائق: `documentStudio.*`.
- الجهات: `organizations.*`.
- الإعدادات: `settings.*` و`platformDocumentSettings.*`.
- الإشعارات والتقارير: `notifications.inbox` و`reports.telegrams`.
- البرقيات: `telegrams.create`, `list`, `get`, `update`, `transition`, `actions`, `attachments`, `versions`, `incomingRoutes`, `uploadAttachment`, و`importWorkbookPreview`.

## ما يوفره Appwrite API الحالي

عقد `shared/mobile-api-contract.json` في فرع `main` يغطي إجراءات المصادقة والوثائق والجهات وإدارة المستخدمين وإشعارات مساحة العمل، ومنها:

- `auth.*`
- `documentStudio.*`
- `organizations.*`
- `platformDocumentSettings.*`
- `profile.*`
- `userManagement.*`
- `workspace.notifications.*`

ولا يثبت العقد الحالي توافق إجراءات `telegrams.*` و`notifications.inbox` و`reports.telegrams` التي يستعملها عميل Flutter القديم.

## قرار الترحيل الآمن

لا يُحذف `server/` أو `supabase/` من فرع الهاتف في هذه المرحلة. الحذف قبل تنفيذ البديل سيؤدي إلى تعطل دورة البرقية، المرفقات، الإشعارات، والتقارير حتى لو نجح `flutter analyze` و`flutter build`.

الترتيب المطلوب قبل الحذف:

1. نقل إجراءات `telegrams.*` إلى Router يعمل فوق TablesDB وStorage في Appwrite.
2. نقل إجراءات الإشعارات والتقارير وتسجيل رموز الأجهزة إلى Appwrite.
3. إضافة إجراءات النقل إلى `shared/mobile-api-contract.json` مع تحقق من الأسماء والمدخلات والمخرجات والصلاحيات.
4. تشغيل اختبارات سلبية لعزل بيانات الجهات، واختبارات المرفقات والانتقالات والتعارضات.
5. تحديث `mobile/lib/api.dart` عند اختلاف أسماء الإجراءات أو شكل النتائج.
6. تشغيل اختبارات Flutter وبناء Android فعلياً في GitHub Actions.
7. بعد إثبات التكافؤ فقط، إزالة خادم Supabase القديم من فرع الهاتف في commit مستقل.

هذا التقرير ليس دليلاً على اكتمال الترحيل؛ بل يمنع دفع حذف غير آمن قبل اكتمال عقد Appwrite.
