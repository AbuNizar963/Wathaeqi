import { useEffect, useState } from "react";
import { Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ownerTrpc as trpc } from "@/lib/ownerTrpc";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  HEX_COLOR_PATTERN,
  MAX_WATERMARK_OPACITY_PERCENT,
  type PlatformDocumentSettings,
} from "@shared/features/platform-settings/platformDocumentSettings";

type SettingsForm = Omit<PlatformDocumentSettings, "updatedAt">;

function toFormSettings(settings: PlatformDocumentSettings): SettingsForm {
  return {
    showMinistryWatermarkText: settings.showMinistryWatermarkText,
    watermarkText: settings.watermarkText,
    watermarkOpacityPercent: settings.watermarkOpacityPercent,
    headerDividerColor: settings.headerDividerColor,
    headerTitle: settings.headerTitle,
    headerSubtitle: settings.headerSubtitle,
    headerChiefRank: settings.headerChiefRank,
    headerChiefName: settings.headerChiefName,
    headerShowLogo: settings.headerShowLogo,
    headerLogoSize: settings.headerLogoSize,
    headerTopPaddingMm: settings.headerTopPaddingMm,
    headerHorizontalPaddingMm: settings.headerHorizontalPaddingMm,
    headerBottomPaddingMm: settings.headerBottomPaddingMm,
    headerAlignment: settings.headerAlignment,
    showVerificationQr: settings.showVerificationQr,
  };
}

export default function PlatformDocumentSettingsPage() {
  const utils = trpc.useUtils();
  const settingsQuery = trpc.platformDocumentSettings.get.useQuery();
  const [values, setValues] = useState<SettingsForm>({
    ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  });

  useEffect(() => {
    if (settingsQuery.data) setValues(toFormSettings(settingsQuery.data));
  }, [settingsQuery.data]);

  const saveMutation = trpc.platformDocumentSettings.update.useMutation({
    onSuccess: async saved => {
      setValues(toFormSettings(saved));
      await utils.platformDocumentSettings.get.invalidate();
      toast.success("تم حفظ إعدادات الوثائق");
    },
    onError: error => toast.error(error.message),
  });

  const updateValue = <K extends keyof SettingsForm>(
    key: K,
    value: SettingsForm[K]
  ) => setValues(current => ({ ...current, [key]: value }));

  const colorIsValid = HEX_COLOR_PATTERN.test(values.headerDividerColor);

  return (
    <div className="mx-auto max-w-5xl space-y-5" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Settings2 className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">إعدادات الوثائق</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              التحكم في العلامة المائية وتنسيق ترويسة الوثيقة الرسمية
            </p>
          </div>
        </div>
        <Button
          onClick={() => saveMutation.mutate(values)}
          disabled={
            settingsQuery.isLoading ||
            !settingsQuery.data ||
            saveMutation.isPending ||
            !colorIsValid
          }
        >
          <Save className="ml-2 h-4 w-4" />
          {saveMutation.isPending ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
        </Button>
      </header>

      {settingsQuery.isLoading ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          جارٍ تحميل إعدادات الوثائق...
        </Card>
      ) : settingsQuery.isError ? (
        <Card className="space-y-3 p-6" role="alert">
          <p className="font-semibold">تعذّر تحميل إعدادات الوثائق</p>
          <p className="text-sm text-muted-foreground">
            {settingsQuery.error.message}
          </p>
          <Button
            variant="outline"
            onClick={() => void settingsQuery.refetch()}
            disabled={settingsQuery.isFetching}
          >
            {settingsQuery.isFetching
              ? "جارٍ إعادة المحاولة..."
              : "إعادة المحاولة"}
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <Card className="space-y-6 p-5">
            <section className="space-y-2">
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span className="block font-semibold">
                    العلامة المائية النصية
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    إظهار اسم الجهة الرسمي بشكل متكرر خلف محتوى الوثيقة
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary"
                  checked={values.showMinistryWatermarkText}
                  onChange={event =>
                    updateValue(
                      "showMinistryWatermarkText",
                      event.target.checked
                    )
                  }
                />
              </label>
            </section>

            <div className="h-px bg-border" />

            <section className="space-y-2">
              <label htmlFor="document-watermark-text" className="font-semibold">
                نص العلامة الأمنية
              </label>
              <input id="document-watermark-text" type="text" maxLength={255}
                value={values.watermarkText}
                onChange={event => updateValue("watermarkText", event.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="اكتب العبارة التي ستتكرر خلف صفحات الوثيقة" />
              <p className="text-xs text-muted-foreground">
                يظهر النص وفق نمط A4 المتكرر، ويمكن تغييره من إعدادات الوثائق.
              </p>
            </section>

            <div className="h-px bg-border" />

            <section className="space-y-4">
              <h2 className="font-semibold">تحرير رأس الصفحة</h2>
              <p className="text-xs text-muted-foreground">
                اترك الحقول النصية فارغة لاستخدام بيانات الجهة المسجلة.
              </p>
              <label className="block space-y-1">
                <span className="text-sm font-medium">العنوان الرئيسي</span>
                <input value={values.headerTitle} maxLength={255}
                  onChange={event => updateValue("headerTitle", event.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">العنوان الفرعي / اسم الوحدة</span>
                <input value={values.headerSubtitle} maxLength={255}
                  onChange={event => updateValue("headerSubtitle", event.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">رتبة / صفة المسؤول</span>
                <input value={values.headerChiefRank} maxLength={120}
                  onChange={event => updateValue("headerChiefRank", event.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">اسم المسؤول</span>
                <input value={values.headerChiefName} maxLength={255}
                  onChange={event => updateValue("headerChiefName", event.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">إظهار شعار الجهة في الرأس</span>
                <input type="checkbox" checked={values.headerShowLogo}
                  onChange={event => updateValue("headerShowLogo", event.target.checked)}
                  className="h-5 w-5 accent-primary" />
              </label>
              <label className="block space-y-1">
                <span className="flex justify-between text-sm font-medium">
                  <span>حجم الشعار</span><output>{values.headerLogoSize}px</output>
                </span>
                <input type="range" min={32} max={128} step={4}
                  value={values.headerLogoSize}
                  onChange={event => updateValue("headerLogoSize", Number(event.target.value))}
                  className="w-full accent-primary" />
              </label>
              <label className="block space-y-1">
                <span className="flex justify-between text-sm font-medium">
                  <span>الهامش العلوي للرأس</span><output>{values.headerTopPaddingMm} مم</output>
                </span>
                <input type="range" min={0} max={30} step={1}
                  value={values.headerTopPaddingMm}
                  onChange={event => updateValue("headerTopPaddingMm", Number(event.target.value))}
                  className="w-full accent-primary" />
              </label>
              <label className="block space-y-1">
                <span className="flex justify-between text-sm font-medium">
                  <span>الهامش الأفقي للرأس</span><output>{values.headerHorizontalPaddingMm} مم</output>
                </span>
                <input type="range" min={0} max={30} step={1}
                  value={values.headerHorizontalPaddingMm}
                  onChange={event => updateValue("headerHorizontalPaddingMm", Number(event.target.value))}
                  className="w-full accent-primary" />
              </label>
              <label className="block space-y-1">
                <span className="flex justify-between text-sm font-medium">
                  <span>الهامش السفلي للرأس</span><output>{values.headerBottomPaddingMm} مم</output>
                </span>
                <input type="range" min={0} max={30} step={1}
                  value={values.headerBottomPaddingMm}
                  onChange={event => updateValue("headerBottomPaddingMm", Number(event.target.value))}
                  className="w-full accent-primary" />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">محاذاة عناصر الرأس</span>
                <select value={values.headerAlignment}
                  onChange={event => updateValue("headerAlignment", event.target.value as SettingsForm["headerAlignment"])}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
                  <option value="spread">توزيع متوازن</option>
                  <option value="center">توسيط</option>
                  <option value="right">محاذاة إلى اليمين</option>
                </select>
              </label>
            </section>

            <div className="h-px bg-border" />

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="watermark-opacity" className="font-semibold">
                  شفافية العلامة المائية
                </label>
                <output
                  htmlFor="watermark-opacity"
                  className="rounded-lg bg-muted px-3 py-1 text-sm font-semibold tabular-nums"
                >
                  {values.watermarkOpacityPercent}%
                </output>
              </div>
              <input
                id="watermark-opacity"
                type="range"
                min={0}
                max={MAX_WATERMARK_OPACITY_PERCENT}
                step={1}
                value={values.watermarkOpacityPercent}
                onChange={event =>
                  updateValue(
                    "watermarkOpacityPercent",
                    Number(event.target.value)
                  )
                }
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>شفاف تماماً</span>
                <span>{MAX_WATERMARK_OPACITY_PERCENT}%</span>
              </div>
            </section>

            <div className="h-px bg-border" />

            <section className="space-y-2">
              <label htmlFor="document-divider-color" className="font-semibold">
                لون خط ترويسة الوثيقة
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="document-divider-color"
                  type="color"
                  value={values.headerDividerColor}
                  onChange={event =>
                    updateValue("headerDividerColor", event.target.value)
                  }
                  className="h-11 w-16 cursor-pointer rounded-lg border bg-background p-1"
                />
                <span className="font-mono text-sm" dir="ltr">
                  {values.headerDividerColor}
                </span>
              </div>
              {!colorIsValid ? (
                <p className="text-xs text-destructive">
                  أدخل لوناً صالحاً بصيغة HEX.
                </p>
              ) : null}
              {!values.watermarkText.trim() ? (
                <p className="text-xs text-destructive">
                  لا يمكن ترك نص العلامة الأمنية فارغاً.
                </p>
              ) : null}
            </section>

            <div className="h-px bg-border" />

            <section className="space-y-2">
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span className="block font-semibold">رمز التحقق</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    حفظ تفضيل إظهار رمز التحقق في مخرجات الوثائق المدعومة
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary"
                  checked={values.showVerificationQr}
                  onChange={event =>
                    updateValue("showVerificationQr", event.target.checked)
                  }
                />
              </label>
            </section>
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">معاينة التنسيق</h2>
            <p className="text-xs text-muted-foreground">
              معاينة مباشرة للون الترويسة ودرجة ظهور العلامة المائية.
            </p>
            <div className="relative min-h-[360px] overflow-hidden rounded-xl border bg-white p-5 text-slate-900 shadow-sm">
              <div
                className="relative z-10 border-b-2 pb-4 text-center"
                style={{ borderColor: values.headerDividerColor }}
              >
                <p className="text-base font-bold">{values.headerTitle || "وثائقي"}</p>
                <p className="mt-1 text-xs text-slate-600">{values.headerSubtitle || "الوثائق الرسمية"}</p>
                {values.headerChiefRank || values.headerChiefName ? (
                  <p className="mt-2 text-xs text-slate-600">
                    {values.headerChiefRank} {values.headerChiefName}
                  </p>
                ) : null}
              </div>
              {values.showMinistryWatermarkText ? (
                <div
                  className="pointer-events-none absolute inset-0 grid place-items-center"
                  style={{ opacity: values.watermarkOpacityPercent / 100 }}
                  aria-hidden="true"
                >
                  <span className="whitespace-nowrap text-sm font-normal text-slate-500">
                    {values.watermarkText || "وثائقي"}
                  </span>
                </div>
              ) : null}
              <div className="relative z-10 space-y-4 pt-8 text-sm leading-8">
                <p className="text-left">الرقم: —</p>
                <p className="font-semibold">الموضوع: نموذج معاينة الوثيقة</p>
                <p>
                  يظهر محتوى الوثيقة هنا، وتبقى العلامة المائية خلف النص دون
                  التأثير على وضوح القراءة.
                </p>
              </div>
            </div>
            {settingsQuery.data?.updatedAt ? (
              <p className="text-xs text-muted-foreground">
                آخر تحديث:{" "}
                {new Date(settingsQuery.data.updatedAt).toLocaleString("ar")}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                لم تُحفظ إعدادات مخصصة بعد؛ تُستخدم القيم الافتراضية.
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
