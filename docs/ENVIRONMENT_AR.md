# متغيرات بيئة وثائقي

تعمل النسخة الحالية عبر Appwrite. لا تضع أسراراً فعلية في Git أو في متغيرات الواجهة العامة.

| المتغير                                                                | النطاق              | الاستخدام                                                                |
| ---------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------ |
| `APPWRITE_ENDPOINT`                                                    | خادمي               | نقطة Appwrite API المنتهية بـ `/v1`                                      |
| `APPWRITE_PROJECT_ID`                                                  | خادمي               | معرّف مشروع Appwrite                                                     |
| `APPWRITE_DATABASE_ID`                                                 | خادمي               | قاعدة TablesDB المستخدمة للتطبيق                                         |
| `APPWRITE_API_KEY`                                                     | سري خادمي           | مفتاح خدمة Appwrite؛ لا يرسل إلى المتصفح                                 |
| `APPWRITE_BUCKET_ID`                                                   | خادمي               | معرّف حاوية الملفات الخاصة                                               |
| `VITE_APPWRITE_API_URL`                                                | عام للواجهة         | عنوان Appwrite Function الذي تستدعيه الواجهة                             |
| `APPWRITE_WEB_ORIGINS`                                                 | خادمي               | قائمة النطاقات المسموح لها بطلب Function                                 |
| `APPWRITE_SESSION_COOKIE_SAMESITE`                                     | خادمي               | `Lax` أو `None` عند الحاجة لطلبات HTTPS العابرة للنطاقات                 |
| `AUTH_SESSION_SECRET`                                                  | سري خادمي           | توقيع جلسات المالك؛ 32 محرفاً عشوائياً على الأقل                         |
| `OWNER_SETUP_SECRET`                                                   | سري خادمي مؤقت      | رمز إعداد المالك لمرة واحدة؛ يزال بعد إتمام الإعداد                      |
| `OWNER_USERNAME`                                                       | خادمي               | اسم حساب المالك الحالي                                                   |
| `OWNER_INITIAL_PASSWORD` أو `OWNER_PASSWORD_HASH`                      | سري خادمي           | إعداد أولي اختياري لحساب جديد فقط؛ لا يستبدل آلية استرداد المالك الحالية |
| `ADMIN_EMAILS`                                                         | خادمي               | قائمة عناوين إدارية اختيارية                                             |
| `VITE_GOOGLE_MAPS_API_KEY`                                             | عام مقيد بالنطاق    | خرائط Google عند تفعيلها                                                 |
| `OWNER_NOTIFICATION_WEBHOOK_URL`                                       | سري خادمي           | قناة إشعار اختيارية                                                      |
| `VAPID_PUBLIC_KEY` و`VAPID_PRIVATE_KEY` و`VAPID_SUBJECT`               | عام/سري حسب المفتاح | إشعارات Web Push                                                         |
| `FIREBASE_PROJECT_ID` و`FIREBASE_CLIENT_EMAIL` و`FIREBASE_PRIVATE_KEY` | سري خادمي           | إشعارات Firebase للأجهزة                                                 |
| `RELEASE_NOTIFICATION_SECRET`                                          | سري خادمي           | تحقق إشعارات إصدار التطبيق                                               |
| `VITE_ANALYTICS_ENDPOINT` و`VITE_ANALYTICS_WEBSITE_ID`                 | عام                 | تحليلات اختيارية                                                         |
| `COHERE_API_KEY` و`PADDLEOCR_VL_URL` و`AI_INPUT_SERVICE_TOKEN`         | سري/خادمي           | خدمات إدخال ذكي اختيارية                                                 |

## قواعد الأمان

- لا تستخدم بادئة `VITE_` لأي مفتاح سري.
- لا ترسل `APPWRITE_API_KEY` أو أسرار الجلسات إلى المتصفح أو تطبيق الهاتف.
- اضبط النطاقات المسموح بها بدقة، واستخدم HTTPS.
- لا تطلب من المستخدم إرسال كلمات المرور أو الرموز السرية عبر المحادثات أو البلاغات.
- ملف `.env.example` هو المرجع المعتمد للأسماء والقيم الافتراضية.
