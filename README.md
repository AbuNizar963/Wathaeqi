# وثائقي | Wathaeqi

منصة عربية لإعداد الكتب الرسمية وإدارة المستندات والقوالب وجهات الاتصال والمرفقات، بواجهة RTL متجاوبة وقابلة للتثبيت على الهاتف.

## حدود التحويل

الفرع النشط لا يشغّل خادم البرقيات أو Supabase أو وظائف البرقيات القديمة؛ تم الاحتفاظ بنسخة المصدر الكاملة على فرع الترحيل المنفصل للرجوع إليها. الويب يتصل مباشرة بمشروع Appwrite الخاص بوثائقي.

## التقنية

- Web: React, TypeScript, Vite, Tailwind CSS, TipTap.
- Mobile: Flutter على الفرع المستقل `flutter-mobile-app` (قيد تحويل طبقة البيانات إلى Appwrite).
- Backend: Appwrite Cloud — Authentication, TablesDB, Storage.
- Hosting: Netlify.

## Appwrite

يستخدم التطبيق مشروع Appwrite التالي:

- Endpoint: `https://fra.cloud.appwrite.io/v1`
- Project: `wathaeqi`
- Database: `wathaeqi-db`
- Tables: `documents`, `templates`, `contacts`, `attachments`
- Storage bucket: `document-attachments`

متغيرات البيئة الخاصة بالواجهة موثقة في `.env.example`. معرفات المشروع عامة وليست مفاتيح سرية؛ لا تضع Appwrite API key في تطبيق المتصفح أو الهاتف. يعتمد عزل بيانات المستخدم على صلاحيات الصفوف والمخزن في Appwrite.

## التطوير

يتطلب Node.js 24 وpnpm 12.14.0:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

فحوص الويب:

```bash
pnpm check
pnpm build
```

## فروع المستودع

- `main`: الفرع الإنتاجي الحالي، ولا يتغير إلا بعد مراجعة المعاينة والموافقة على الدمج.
- `migration/police-source-main`: نسخة المصدر الكاملة للويب المحفوظة للمراجعة، لا تُعدّل أثناء التحويل.
- `feat/wathaeqi-appwrite-web`: فرع تحويل واجهة الويب إلى وثائقي وAppwrite.
- `flutter-mobile-app`: نسخة المصدر الكاملة لتطبيق Flutter؛ يجري تحويلها بصورة مستقلة.

المستودع الأصلي `AbuNizar963/police-telegrams-platform` مصدر قراءة فقط لهذه العملية، ولا تُرسل إليه أي تغييرات.
