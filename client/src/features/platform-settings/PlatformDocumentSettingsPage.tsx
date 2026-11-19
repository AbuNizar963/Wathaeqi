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
    watermarkOpacityPercent: settings.watermarkOpacityPercent,
    headerDividerColor: settings.headerDividerColor,
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
          <p className="text-sm text-muted-foreground">{settingsQuery.error.message}</p>
          <Button
            variant="outline"
            onClick={() => void settingsQuery.refetch()}
            disabled={settingsQuery.isFetching}
          >
            {settingsQuery.isFetching ? "جارٍ إعادة المحاولة..." : "إعادة المحاولة"}
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <Card className="space-y-6 p-5">
            <section className="space-y-2">
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span className="block font-semibold">العلامة المائية النصية</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    إظهار اسم الجهة الرسمي بشكل متكرر خلف محتوى الوثيقة
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary"
                  checked={values.showMinistryWatermarkText}
                  onChange={event =>
                    updateValue("showMinistryWatermarkText", event.target.checked)
                  }
                />
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
                  updateValue("watermarkOpacityPercent", Number(event.target.value))
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
                <p className="text-xs text-destructive">أدخل لوناً صالحاً بصيغة HEX.</p>
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
                <p className="text-base font-bold">وثائقي</p>
                <p className="mt-1 text-xs text-slate-600">الوثائق الرسمية</p>
              </div>
              {values.showMinistryWatermarkText ? (
                <div
                  className="pointer-events-none absolute inset-0 grid place-items-center"
                  style={{ opacity: values.watermarkOpacityPercent / 100 }}
                  aria-hidden="true"
                >
                  <span className="rotate-[-28deg] whitespace-nowrap text-2xl font-bold text-slate-500">
                    وزارة الداخلية
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
                آخر تحديث: {new Date(settingsQuery.data.updatedAt).toLocaleString("ar")}
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
