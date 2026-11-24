import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  MAX_WATERMARK_OPACITY_PERCENT,
  type PlatformDocumentSettings,
} from "@shared/features/platform-settings/platformDocumentSettings";

type SettingsForm = Omit<PlatformDocumentSettings, "updatedAt">;

function toFormSettings(settings: PlatformDocumentSettings): SettingsForm {
  const { updatedAt: _updatedAt, ...values } = settings;
  return values;
}

export default function PlatformDocumentSettings() {
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const isPlatformOwner = me.data?.isPlatformOwner === true;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<SettingsForm>({
    ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  });
  const utils = trpc.useUtils();
  const settings = trpc.platformDocumentSettings.get.useQuery(undefined, {
    enabled: open && isPlatformOwner,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const update = trpc.platformDocumentSettings.update.useMutation({
    onSuccess: async saved => {
      setValues(toFormSettings(saved));
      await utils.platformDocumentSettings.get.invalidate();
      toast.success("تم حفظ إعدادات وثائق النظام");
      setOpen(false);
    },
    onError: error => toast.error(error.message || "تعذر حفظ إعدادات النظام"),
  });

  useEffect(() => {
    const handler = () => {
      if (isPlatformOwner) setOpen(true);
    };
    window.addEventListener("open-platform-document-settings", handler);
    return () =>
      window.removeEventListener("open-platform-document-settings", handler);
  }, [isPlatformOwner]);

  useEffect(() => {
    if (!open || !settings.data) return;
    setValues(toFormSettings(settings.data));
  }, [open, settings.data]);

  const updateValue = <K extends keyof SettingsForm>(
    key: K,
    value: SettingsForm[K]
  ) => setValues(current => ({ ...current, [key]: value }));

  if (!open || !isPlatformOwner) return null;

  return (
    <div className="document-print-modal fixed inset-0 z-[90] overflow-y-auto bg-black/55 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="platform-document-settings-title"
        dir="rtl"
        className="mx-auto my-4 w-full max-w-2xl rounded-2xl border bg-background p-4 shadow-2xl sm:my-10 sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" />
              إعدادات المالك
            </p>
            <h2
              id="platform-document-settings-title"
              className="mt-1 text-xl font-black"
            >
              إعدادات وثائق النظام
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              تُطبّق هذه الخيارات على وثائق جميع الجهات الجديدة.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="إغلاق إعدادات النظام"
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {settings.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            جارٍ تحميل الإعدادات…
          </p>
        ) : settings.error ? (
          <div className="mt-5 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p>تعذر تحميل إعدادات النظام.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => void settings.refetch()}
            >
              إعادة المحاولة
            </Button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <label className="flex items-start gap-3 rounded-xl border p-4">
              <input
                type="checkbox"
                checked={values.showMinistryWatermarkText}
                onChange={event =>
                  updateValue("showMinistryWatermarkText", event.target.checked)
                }
                className="mt-1 h-4 w-4 accent-[#10233f]"
              />
              <span className="text-sm font-bold">
                إظهار العلامة الأمنية النصية خلف صفحات الوثيقة
              </span>
            </label>

            <label className="block rounded-xl border p-4">
              <span className="mb-2 block text-sm font-bold">
                نص العلامة الأمنية
              </span>
              <input
                type="text"
                maxLength={255}
                value={values.watermarkText}
                onChange={event =>
                  updateValue("watermarkText", event.target.value)
                }
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </label>

            <label className="block rounded-xl border p-4">
              <span className="flex items-center justify-between gap-3 text-sm font-bold">
                <span>شفافية العلامة الأمنية</span>
                <span className="tabular-nums">
                  {values.watermarkOpacityPercent}%
                </span>
              </span>
              <input
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
                aria-label="نسبة شفافية العلامة الأمنية"
                className="mt-3 w-full accent-[#10233f]"
              />
            </label>

            <div className="rounded-xl border p-4">
              <h3 className="font-bold">بيانات أسفل الوثيقة</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                تظهر هذه البيانات بعد آخر سطر من الوثيقة.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  العنوان الرئيسي
                  <input
                    value={values.headerTitle}
                    maxLength={255}
                    onChange={event =>
                      updateValue("headerTitle", event.target.value)
                    }
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  العنوان الفرعي / اسم الوحدة
                  <input
                    value={values.headerSubtitle}
                    maxLength={255}
                    onChange={event =>
                      updateValue("headerSubtitle", event.target.value)
                    }
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  رتبة / صفة المسؤول
                  <input
                    value={values.headerChiefRank}
                    maxLength={120}
                    onChange={event =>
                      updateValue("headerChiefRank", event.target.value)
                    }
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  اسم المسؤول
                  <input
                    value={values.headerChiefName}
                    maxLength={255}
                    onChange={event =>
                      updateValue("headerChiefName", event.target.value)
                    }
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  />
                </label>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={values.headerShowLogo}
                    onChange={event =>
                      updateValue("headerShowLogo", event.target.checked)
                    }
                  />
                  إظهار شعار الجهة
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-sm">
                    محاذاة بيانات أسفل الوثيقة
                  </span>
                  <select
                    value={values.headerAlignment}
                    onChange={event =>
                      updateValue(
                        "headerAlignment",
                        event.target.value as SettingsForm["headerAlignment"]
                      )
                    }
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  >
                    <option value="spread">توزيع متوازن</option>
                    <option value="center">توسيط</option>
                    <option value="right">إلى اليمين</option>
                  </select>
                </label>
              </div>
              <label className="mt-4 block space-y-1 text-sm">
                <span className="flex justify-between">
                  حجم الشعار <output>{values.headerLogoSize}px</output>
                </span>
                <input
                  type="range"
                  min={32}
                  max={128}
                  step={4}
                  value={values.headerLogoSize}
                  onChange={event =>
                    updateValue("headerLogoSize", Number(event.target.value))
                  }
                  className="w-full accent-[#10233f]"
                />
              </label>
              {(
                [
                  ["headerTopPaddingMm", "الهامش العلوي"],
                  ["headerHorizontalPaddingMm", "الهامش الأفقي"],
                  ["headerBottomPaddingMm", "الهامش السفلي"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="mt-3 block space-y-1 text-sm">
                  <span className="flex justify-between">
                    {label} <output>{values[key]} مم</output>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={1}
                    value={values[key]}
                    onChange={event =>
                      updateValue(key, Number(event.target.value))
                    }
                    className="w-full accent-[#10233f]"
                  />
                </label>
              ))}
              <label className="mt-4 flex items-center justify-between gap-4 text-sm">
                لون الخط الفاصل
                <input
                  type="color"
                  value={values.headerDividerColor}
                  onChange={event =>
                    updateValue("headerDividerColor", event.target.value)
                  }
                  className="h-10 w-12 cursor-pointer rounded-md border bg-background p-1"
                />
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-xl border p-4">
              <input
                type="checkbox"
                checked={values.showVerificationQr}
                onChange={event =>
                  updateValue("showVerificationQr", event.target.checked)
                }
                className="mt-1 h-4 w-4 accent-[#10233f]"
              />
              <span className="text-sm font-bold">
                إظهار QR للتحقق في وثائق جميع الجهات
              </span>
            </label>

            <p className="rounded-lg bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
              تُطبّق التغييرات على معاينات ومخرجات الوثائق عند فتحها بعد الحفظ؛
              أما النسخ التي سبق تنزيلها فلا تتغير.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                إلغاء
              </Button>
              <Button
                type="button"
                disabled={
                  !settings.data ||
                  update.isPending ||
                  !values.watermarkText.trim()
                }
                onClick={() => update.mutate(values)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {update.isPending ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
