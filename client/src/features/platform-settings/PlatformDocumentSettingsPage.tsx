import { useEffect, useState } from "react";
import { ImagePlus, Save, Settings2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ownerTrpc as ownerTrpc } from "@/lib/ownerTrpc";
import { trpc } from "@/lib/trpc";
import {
  prepareOrganizationLogoUpload,
  uploadOrganizationLogoDirect,
} from "@/features/organizations/organizationLogoUpload";
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
  const settingsQuery = ownerTrpc.platformDocumentSettings.get.useQuery();
  const organizationsQuery = trpc.organizations.all.useQuery();
  const organizationContext = trpc.organizations.context.useQuery();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const organizationLogoQuery = trpc.organizations.logo.useQuery(
    { id: selectedOrganizationId || "00000000-0000-0000-0000-000000000000" },
    {
      enabled: Boolean(selectedOrganizationId),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    }
  );
  const [logoUrl, setLogoUrl] = useState("");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [values, setValues] = useState<SettingsForm>({
    ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  });

  useEffect(() => {
    if (settingsQuery.data) setValues(toFormSettings(settingsQuery.data));
  }, [settingsQuery.data]);

  useEffect(() => {
    if (selectedOrganizationId || !organizationsQuery.data?.length) return;
    const currentId = organizationContext.data?.organizationId;
    const currentOrganization = organizationsQuery.data.find(
      organization => organization.id === currentId
    );
    setSelectedOrganizationId(
      currentOrganization?.id ?? organizationsQuery.data[0].id
    );
  }, [
    selectedOrganizationId,
    organizationsQuery.data,
    organizationContext.data?.organizationId,
  ]);

  useEffect(() => {
    setLogoUrl(organizationLogoQuery.data?.dataUrl ?? "");
  }, [organizationLogoQuery.data?.dataUrl]);

  const saveMutation = ownerTrpc.platformDocumentSettings.update.useMutation({
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

  const handleLogoFile = async (file: File | undefined) => {
    if (!file || !selectedOrganizationId) return;
    setIsUploadingLogo(true);
    try {
      const prepared = await prepareOrganizationLogoUpload(file);
      await uploadOrganizationLogoDirect({
        organizationId: selectedOrganizationId,
        fileName: file.name,
        blob: prepared.blob,
        contentType: prepared.contentType,
      });
      const refreshedLogo = await organizationLogoQuery.refetch();
      setLogoUrl(refreshedLogo.data?.dataUrl ?? "");
      toast.success("تم حفظ شعار الجهة في مساحة التخزين وربطه بترويسة الوثائق");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفع الشعار");
    } finally {
      setIsUploadingLogo(false);
    }
  };

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
            <section className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
              <div className="flex items-center gap-2">
                <ImagePlus className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="font-semibold">هوية الجهة وشعارها</h2>
                  <p className="text-xs text-muted-foreground">
                    اختر الجهة وارفع شعارها ليظهر في منتصف رأس الوثيقة الرسمية.
                  </p>
                </div>
              </div>
              {organizationsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">جارٍ تحميل الجهات...</p>
              ) : organizationsQuery.isError || !organizationsQuery.data?.length ? (
                <p className="text-sm text-destructive">
                  تعذر تحميل الجهات. تحقق من صلاحية مالك المنصة ثم أعد المحاولة.
                </p>
              ) : (
                <>
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">الجهة</span>
                    <select
                      value={selectedOrganizationId}
                      onChange={event => setSelectedOrganizationId(event.target.value)}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                    >
                      {organizationsQuery.data.map(organization => (
                        <option key={organization.id} value={organization.id}>
                          {organization.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {organizationLogoQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">جارٍ تحميل شعار الجهة...</p>
                  ) : organizationLogoQuery.isError ? (
                    <p className="text-sm text-destructive">
                      {organizationLogoQuery.error.message}
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border bg-background">
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt="شعار الجهة"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <div className="text-center text-xs text-muted-foreground">
                            <ImagePlus className="mx-auto mb-1 h-6 w-6" />
                            لا يوجد شعار
                          </div>
                        )}
                      </div>
                      <div className="min-w-[180px] flex-1 space-y-2">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">
                          <Upload className="h-4 w-4" />
                          {isUploadingLogo ? "جارٍ رفع الشعار..." : "اختيار صورة الشعار"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            className="sr-only"
                            disabled={isUploadingLogo}
                            onChange={event => {
                              void handleLogoFile(event.target.files?.[0]);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                        <p className="text-xs text-muted-foreground">
                          PNG أو JPG، بحد أقصى 5 ميغابايت. احتفظ بخلفية شفافة عند الحاجة.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          يُحفظ الشعار مباشرة بعد اكتمال الرفع، ويُعاد تحميل النسخة المحفوظة للتحقق منها.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            <div className="h-px bg-border" />

            <section className="space-y-2">
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span className="block font-semibold">
                    العلامة الأمنية النصية
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
              <label
                htmlFor="document-watermark-text"
                className="font-semibold"
              >
                نص العلامة الأمنية
              </label>
              <input
                id="document-watermark-text"
                type="text"
                maxLength={255}
                value={values.watermarkText}
                onChange={event =>
                  updateValue("watermarkText", event.target.value)
                }
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="اكتب العبارة التي ستتكرر خلف صفحات الوثيقة"
              />
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
                <input
                  value={values.headerTitle}
                  maxLength={255}
                  onChange={event =>
                    updateValue("headerTitle", event.target.value)
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  العنوان الفرعي / اسم الوحدة
                </span>
                <input
                  value={values.headerSubtitle}
                  maxLength={255}
                  onChange={event =>
                    updateValue("headerSubtitle", event.target.value)
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">رتبة / صفة المسؤول</span>
                <input
                  value={values.headerChiefRank}
                  maxLength={120}
                  onChange={event =>
                    updateValue("headerChiefRank", event.target.value)
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">اسم المسؤول</span>
                <input
                  value={values.headerChiefName}
                  maxLength={255}
                  onChange={event =>
                    updateValue("headerChiefName", event.target.value)
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  إظهار شعار الجهة في الرأس
                </span>
                <input
                  type="checkbox"
                  checked={values.headerShowLogo}
                  onChange={event =>
                    updateValue("headerShowLogo", event.target.checked)
                  }
                  className="h-5 w-5 accent-primary"
                />
              </label>
              <label className="block space-y-1">
                <span className="flex justify-between text-sm font-medium">
                  <span>حجم الشعار</span>
                  <output>{values.headerLogoSize}px</output>
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
                  className="w-full accent-primary"
                />
              </label>
              <label className="block space-y-1">
                <span className="flex justify-between text-sm font-medium">
                  <span>الهامش العلوي للرأس</span>
                  <output>{values.headerTopPaddingMm} مم</output>
                </span>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={values.headerTopPaddingMm}
                  onChange={event =>
                    updateValue(
                      "headerTopPaddingMm",
                      Number(event.target.value)
                    )
                  }
                  className="w-full accent-primary"
                />
              </label>
              <label className="block space-y-1">
                <span className="flex justify-between text-sm font-medium">
                  <span>الهامش الأفقي للرأس</span>
                  <output>{values.headerHorizontalPaddingMm} مم</output>
                </span>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={values.headerHorizontalPaddingMm}
                  onChange={event =>
                    updateValue(
                      "headerHorizontalPaddingMm",
                      Number(event.target.value)
                    )
                  }
                  className="w-full accent-primary"
                />
              </label>
              <label className="block space-y-1">
                <span className="flex justify-between text-sm font-medium">
                  <span>الهامش السفلي للرأس</span>
                  <output>{values.headerBottomPaddingMm} مم</output>
                </span>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={values.headerBottomPaddingMm}
                  onChange={event =>
                    updateValue(
                      "headerBottomPaddingMm",
                      Number(event.target.value)
                    )
                  }
                  className="w-full accent-primary"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">محاذاة عناصر الرأس</span>
                <select
                  value={values.headerAlignment}
                  onChange={event =>
                    updateValue(
                      "headerAlignment",
                      event.target.value as SettingsForm["headerAlignment"]
                    )
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                >
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
            <div
              className="relative min-h-[360px] overflow-hidden rounded-xl border bg-white text-slate-900 shadow-sm"
              style={{ padding: "10mm" }}
            >
              <div
                className="relative z-10 grid items-start gap-[2px] border-b-[3px] pb-3"
                style={{
                  borderColor: values.headerDividerColor,
                  paddingTop: `${values.headerTopPaddingMm}mm`,
                  paddingInline: `${values.headerHorizontalPaddingMm}mm`,
                  paddingBottom: `${values.headerBottomPaddingMm}mm`,
                  gridTemplateColumns: `minmax(0,1fr) ${Math.max(24, values.headerLogoSize * 0.55)}px minmax(0,1fr)`,
                }}
                dir="rtl"
              >
                <div className="min-w-0 text-right">
                  <p className="truncate text-sm font-bold">
                    {values.headerTitle || "وثائقي"}
                  </p>
                  <p className="truncate text-xs font-bold">
                    {values.headerSubtitle || "الوثائق الرسمية"}
                  </p>
                </div>
                <div className="flex items-center justify-center">
                  {values.headerShowLogo ? (
                    logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="شعار الجهة"
                        style={{
                          width: values.headerLogoSize,
                          height: values.headerLogoSize,
                          objectFit: "contain",
                        }}
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded border border-dashed text-[9px] text-slate-500">
                        أضف الشعار
                      </div>
                    )
                  ) : null}
                </div>
                <div className="min-w-0 text-left text-xs font-bold">
                  <p>الرقم: —</p>
                  <p>التاريخ: —</p>
                  {values.headerChiefRank ? (
                    <p>{values.headerChiefRank}</p>
                  ) : null}
                  {values.headerChiefName ? (
                    <p>{values.headerChiefName}</p>
                  ) : null}
                </div>
              </div>
              {values.showMinistryWatermarkText ? (
                <div
                  className="pointer-events-none absolute inset-[2.4mm_3.2mm_3mm] flex flex-col items-center justify-between overflow-hidden"
                  style={{ opacity: values.watermarkOpacityPercent / 100 }}
                  aria-hidden="true"
                >
                  {Array.from({ length: 33 }, (_, row) => (
                    <div
                      key={row}
                      className={`flex w-max flex-none whitespace-nowrap ${row % 2 ? "-translate-x-[10.3mm]" : ""}`}
                      style={{ gap: "6.16mm" }}
                    >
                      {Array.from({ length: 13 }, (_, column) => (
                        <span
                          key={column}
                          className="text-[5pt] font-normal leading-none text-slate-500"
                          style={{ fontFamily: '"Aref Ruqaa", serif' }}
                        >
                          {values.watermarkText || "وزارة الداخلية"}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="relative z-10 space-y-4 pt-8 text-sm leading-8">
                <p className="text-left">الرقم: —</p>
                <p className="font-semibold">الموضوع: نموذج معاينة الوثيقة</p>
                <p>
                  يظهر محتوى الوثيقة هنا، وتبقى العلامة الأمنية خلف النص دون
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
