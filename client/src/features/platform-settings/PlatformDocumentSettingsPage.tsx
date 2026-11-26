import { useEffect, useRef, useState } from "react";
import { FolderOpen, ImagePlus, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ownerTrpc } from "@/lib/ownerTrpc";
import {
  prepareOrganizationLogoUpload,
  uploadOrganizationLogoDirect,
} from "@/features/organizations/organizationLogoUpload";
import { normalizePlatformDocumentSettings } from "./normalizePlatformDocumentSettings";
import PlatformDocumentPreview from "./PlatformDocumentPreview";
import DocumentFramePicker from "./DocumentFramePicker";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  DOCUMENT_DATE_FORMATS,
  DOCUMENT_DATE_FORMAT_LABELS,
  HEX_COLOR_PATTERN,
  MAX_WATERMARK_OPACITY_PERCENT,
  MIN_WATERMARK_SCALE_PERCENT,
  MAX_WATERMARK_SCALE_PERCENT,
  MAX_PAGE_MARGIN_MM,
  MIN_HEADER_LOGO_SIZE,
  MAX_HEADER_LOGO_SIZE,
  MIN_DIVIDER_WIDTH_PT,
  MAX_DIVIDER_WIDTH_PT,
  type PlatformDocumentSettings,
} from "@shared/features/platform-settings/platformDocumentSettings";

type SettingsForm = Omit<PlatformDocumentSettings, "updatedAt">;

export default function PlatformDocumentSettingsPage() {
  const utils = trpc.useUtils();
  const ownerUtils = ownerTrpc.useUtils();
  const settingsQuery = trpc.platformDocumentSettings.get.useQuery();
  const organizationContext = trpc.organizations.context.useQuery();
  const organizationId = organizationContext.data?.organizationId;
  const [organizationName, setOrganizationName] = useState("");
  const organizationLogoQuery = trpc.organizations.logo.useQuery(
    { id: organizationId ?? "unavailable", includeDataUrl: false },
    {
      enabled: Boolean(organizationId),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    }
  );
  const [logoUrl, setLogoUrl] = useState("");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const galleryLogoInputRef = useRef<HTMLInputElement>(null);
  const filesLogoInputRef = useRef<HTMLInputElement>(null);

  const openGalleryLogoPicker = () => galleryLogoInputRef.current?.click();
  const openFilesLogoPicker = () => filesLogoInputRef.current?.click();
  const [values, setValues] = useState<SettingsForm>({
    ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setValues(normalizePlatformDocumentSettings(settingsQuery.data));
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (organizationContext.data?.organizationName) {
      setOrganizationName(organizationContext.data.organizationName);
    }
  }, [organizationContext.data?.organizationName]);

  useEffect(() => {
    setLogoUrl(organizationLogoQuery.data?.logoUrl ?? "");
  }, [organizationLogoQuery.data?.logoUrl]);

  const saveMutation = trpc.platformDocumentSettings.update.useMutation({
    onSuccess: async saved => {
      setValues(normalizePlatformDocumentSettings(saved));
      await Promise.all([
        utils.platformDocumentSettings.get.invalidate(),
        ownerUtils.platformDocumentSettings.get.invalidate(),
      ]);
      toast.success("تم حفظ إعدادات الوثائق");
    },
    onError: error => toast.error(error.message),
  });

  const renameOrganizationMutation =
    trpc.organizations.renameCurrent.useMutation({
      onSuccess: async saved => {
        setOrganizationName(saved.organizationName);
        await Promise.all([
          utils.organizations.context.invalidate(),
          utils.organizations.all.invalidate(),
        ]);
        toast.success("تم حفظ اسم الجهة");
      },
      onError: error => toast.error(error.message),
    });

  const updateValue = <K extends keyof SettingsForm>(
    key: K,
    value: SettingsForm[K]
  ) => setValues(current => ({ ...current, [key]: value }));

  const updateTextRow = (
    kind: "pageHeaderRows" | "pageFooterRows",
    index: number,
    side: "right" | "left",
    value: string
  ) =>
    setValues(current => ({
      ...current,
      [kind]: current[kind].map((row, rowIndex) =>
        rowIndex === index ? { ...row, [side]: value } : row
      ),
    }));

  const resizeTextRows = (
    kind: "pageHeaderRows" | "pageFooterRows",
    count: number
  ) =>
    setValues(current => ({
      ...current,
      [kind]: Array.from(
        { length: count },
        (_, index) => current[kind][index] ?? { right: "", left: "" }
      ),
    }));

  const handleLogoFile = async (file: File | undefined) => {
    if (!file || !organizationId) return;
    setIsUploadingLogo(true);
    try {
      const prepared = await prepareOrganizationLogoUpload(file);
      const uploadedLogo = await uploadOrganizationLogoDirect({
        organizationId,
        fileName: file.name,
        blob: prepared.blob,
        contentType: prepared.contentType,
      });
      // Upload success is authoritative; a separate preview refresh must not
      // misreport a successfully stored logo as a failed upload.
      setLogoUrl(uploadedLogo.url ?? "");
      void organizationLogoQuery
        .refetch()
        .then(refreshedLogo => {
          if (refreshedLogo.data?.logoUrl) {
            setLogoUrl(refreshedLogo.data.logoUrl);
          }
        })
        .catch(() => undefined);
      toast.success(
        uploadedLogo.url
          ? "تم رفع شعار الجهة بنجاح، وتُحدّث المعاينة الآن"
          : "تم حفظ الشعار بنجاح؛ جارٍ تجهيز المعاينة"
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفع الشعار");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const colorIsValid =
    HEX_COLOR_PATTERN.test(values.headerDividerColor) &&
    HEX_COLOR_PATTERN.test(values.frameColor);

  // prettier-ignore
  return (
    <div className="mx-auto max-w-5xl space-y-5" dir="rtl">
      <header className="document-page-header document-admin-header">
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
            !colorIsValid ||
            !values.watermarkText.trim()
          }
        >
          <Save className="ml-2 h-4 w-4" />
          {saveMutation.isPending ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
        </Button>
      </header>

      <nav
        aria-label="أقسام إعدادات الوثائق"
        className="flex flex-wrap gap-2"
      >
        {[
          { id: "organization-identity-settings", label: "هوية الجهة" },
          { id: "watermark-settings", label: "العلامة المائية" },
          { id: "page-layout-settings", label: "الصفحة والإطار" },
          { id: "header-divider-settings", label: "فاصل الترويسة" },
          { id: "header-content-settings", label: "بيانات المسؤول" },
          { id: "page-rows-settings", label: "سطور الصفحة" },
          { id: "verification-settings", label: "رمز التحقق" },
        ].map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {label}
          </a>
        ))}
      </nav>

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
            <section
              id="organization-identity-settings"
              aria-labelledby="organization-identity-title"
              className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-4"
            >
              <div className="flex items-center gap-2">
                <ImagePlus className="h-5 w-5 text-primary" />
                <div>
                  <h2
                    id="organization-identity-title"
                    className="font-semibold"
                  >
                    هوية الجهة وشعارها
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    تُطبّق التغييرات تلقائياً على جهة عملك الحالية والوثائق
                    الرسمية.
                  </p>
                </div>
              </div>
              {organizationContext.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  جارٍ تحميل بيانات الجهة الحالية...
                </p>
              ) : organizationContext.isError || !organizationId ? (
                <p className="text-sm text-destructive">
                  تعذر تحميل الجهة الحالية. تحقق من صلاحيات الحساب ثم أعد
                  المحاولة.
                </p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <label
                      htmlFor="current-organization-name"
                      className="block space-y-1"
                    >
                      <span className="text-sm font-medium">اسم الجهة</span>
                      <input
                        id="current-organization-name"
                        value={organizationName}
                        maxLength={255}
                        disabled={!organizationContext.data?.canAdministrate}
                        onChange={event =>
                          setOrganizationName(event.target.value)
                        }
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                        autoComplete="organization"
                      />
                    </label>
                    <Button
                      variant="outline"
                      onClick={() =>
                        renameOrganizationMutation.mutate({
                          name: organizationName.trim(),
                        })
                      }
                      disabled={
                        !organizationContext.data?.canAdministrate ||
                        renameOrganizationMutation.isPending ||
                        organizationName.trim().length < 2 ||
                        organizationName.trim().length > 255 ||
                        organizationName.trim() ===
                          organizationContext.data.organizationName
                      }
                    >
                      <Save className="ml-2 h-4 w-4" />
                      {renameOrganizationMutation.isPending
                        ? "جارٍ حفظ الاسم..."
                        : "حفظ اسم الجهة"}
                    </Button>
                  </div>
                  {!organizationContext.data?.canAdministrate ? (
                    <p className="text-xs text-muted-foreground">
                      تغيير الاسم ورفع الشعار متاحان لمدير الجهة أو مالك المنصة.
                    </p>
                  ) : null}
                  {organizationLogoQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">
                      جارٍ تحميل شعار الجهة...
                    </p>
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
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={
                              isUploadingLogo ||
                              !organizationContext.data?.canAdministrate
                            }
                            onClick={openGalleryLogoPicker}
                          >
                            <ImagePlus className="ml-2 h-4 w-4" />
                            من الاستديو
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={
                              isUploadingLogo ||
                              !organizationContext.data?.canAdministrate
                            }
                            onClick={openFilesLogoPicker}
                          >
                            <FolderOpen className="ml-2 h-4 w-4" />
                            من ملفاتي
                          </Button>
                        </div>
                        <input
                          ref={galleryLogoInputRef}
                          id="organization-logo-gallery"
                          type="file"
                          accept="image/png,image/jpeg"
                          className="sr-only"
                          aria-label="اختيار شعار PNG أو JPG من الاستديو"
                          disabled={
                            isUploadingLogo ||
                            !organizationContext.data?.canAdministrate
                          }
                          onChange={event => {
                            const file = event.currentTarget.files?.[0];
                            event.currentTarget.value = "";
                            if (file) void handleLogoFile(file);
                          }}
                        />
                        <input
                          ref={filesLogoInputRef}
                          id="organization-logo-files"
                          type="file"
                          accept="*/*"
                          className="sr-only"
                          aria-label="اختيار شعار SVG أو PNG أو JPG من ملفاتي"
                          disabled={
                            isUploadingLogo ||
                            !organizationContext.data?.canAdministrate
                          }
                          onChange={event => {
                            const file = event.currentTarget.files?.[0];
                            event.currentTarget.value = "";
                            if (file) void handleLogoFile(file);
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          SVG أو PNG أو JPG، بحد أقصى 2.5 ميغابايت بعد التجهيز.
                          تُفحص ملفات SVG على الخادم قبل حفظها.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          يُحفظ الشعار مباشرة بعد اكتمال الرفع، ويُعاد تحميل
                          النسخة المحفوظة للتحقق منها.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            <div className="h-px bg-border" />

            <section
              id="watermark-settings"
              aria-labelledby="watermark-settings-title"
              className="space-y-4 rounded-xl border p-4"
            >
              <div>
                <h2 id="watermark-settings-title" className="font-semibold">
                  العلامة المائية والأمان
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  تحكم في ظهور العلامة الأمنية ونصها ودرجة شفافيتها.
                </p>
              </div>
              <div className="space-y-2">
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
              </div>

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
              <section className="space-y-3 rounded-lg bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="watermark-scale" className="font-semibold">
                    حجم العلامة المائية
                  </label>
                  <output
                    htmlFor="watermark-scale"
                    className="font-semibold tabular-nums"
                  >
                    {values.watermarkScalePercent}%
                  </output>
                </div>
                <input
                  id="watermark-scale"
                  type="range"
                  min={MIN_WATERMARK_SCALE_PERCENT}
                  max={MAX_WATERMARK_SCALE_PERCENT}
                  step={5}
                  value={values.watermarkScalePercent}
                  onChange={event =>
                    updateValue(
                      "watermarkScalePercent",
                      Number(event.target.value)
                    )
                  }
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>أصغر</span>
                  <span>أكبر</span>
                </div>
              </section>
              {!values.watermarkText.trim() ? (
                <p className="text-xs text-destructive">
                  لا يمكن ترك نص العلامة الأمنية فارغاً.
                </p>
              ) : null}
            </section>

            <div className="h-px bg-border" />

            <section
              id="page-layout-settings"
              aria-labelledby="page-layout-title"
              className="space-y-4 rounded-xl border border-primary/20 bg-primary/[0.03] p-4"
            >
              <div>
                <h2 id="page-layout-title" className="font-semibold">
                  حجم الصفحة والهوامش والإطار
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  اضبط هوامش الصفحة واختر نمط حدود الصفحة للطباعة والمعاينة.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["pageMarginTopMm", "الهامش العلوي"],
                    ["pageMarginRightMm", "الهامش الأيمن"],
                    ["pageMarginBottomMm", "الهامش السفلي"],
                    ["pageMarginLeftMm", "الهامش الأيسر"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="space-y-1 text-sm">
                    <span className="flex justify-between">
                      <span>{label}</span>
                      <output>{values[key]} مم</output>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={MAX_PAGE_MARGIN_MM}
                      step={1}
                      value={values[key]}
                      onChange={event =>
                        updateValue(key, Number(event.target.value))
                      }
                      className="w-full accent-primary"
                    />
                  </label>
                ))}
              </div>
              <DocumentFramePicker
                value={values.frameStyle}
                onChange={style => updateValue("frameStyle", style)}
              />
            </section>
            <section
              id="header-divider-settings"
              aria-labelledby="header-divider-title"
              className="space-y-4 rounded-xl border p-4"
            >
              <div>
                <h2 id="header-divider-title" className="font-semibold">
                  فاصل ترويسة الوثيقة
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  اختر نمطًا رسميًا ولونًا وسماكة متوازنة للفاصل.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="block">نمط الفاصل</span>
                  <select
                    value={values.headerDividerStyle}
                    onChange={event =>
                      updateValue(
                        "headerDividerStyle",
                        event.target.value as SettingsForm["headerDividerStyle"]
                      )
                    }
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  >
                    <option value="solid">متصل</option>
                    <option value="double">مزدوج</option>
                    <option value="dashed">متقطع</option>
                    <option value="dotted">منقط</option>
                    <option value="tricolor-stars">
                      أسود وأخضر مع ثلاث نجوم حمراء
                    </option>
                  </select>
                </label>
                <div className="space-y-2 text-sm">
                  <label htmlFor="document-divider-color" className="block">
                    لون الفاصل
                  </label>
                  <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
                    <input
                      type="color"
                      aria-label="منتقي لون الفاصل"
                      value={values.headerDividerColor}
                      onChange={event =>
                        updateValue("headerDividerColor", event.target.value)
                      }
                      className="h-10 w-full cursor-pointer rounded-md border bg-background p-1"
                    />
                    <input
                      id="document-divider-color"
                      type="text"
                      inputMode="text"
                      autoCapitalize="characters"
                      maxLength={7}
                      spellCheck={false}
                      value={values.headerDividerColor}
                      onChange={event =>
                        updateValue("headerDividerColor", event.target.value.trim())
                      }
                      placeholder="#B49A55"
                      aria-describedby="document-divider-color-hint"
                      className="h-10 w-full rounded-md border bg-background px-3 font-mono uppercase"
                    />
                  </div>
                  <p id="document-divider-color-hint" className="text-xs text-muted-foreground">
                    أدخل رمز اللون بصيغة HEX، مثال: #B49A55
                  </p>
                </div>
              </div>
              <label className="block space-y-1 text-sm">
                <span className="flex justify-between">
                  <span>سماكة الفاصل</span>
                  <output>{values.headerDividerWidthPt} نقطة</output>
                </span>
                <input
                  type="range"
                  min={MIN_DIVIDER_WIDTH_PT}
                  max={MAX_DIVIDER_WIDTH_PT}
                  step={0.25}
                  value={values.headerDividerWidthPt}
                  onChange={event =>
                    updateValue(
                      "headerDividerWidthPt",
                      Number(event.target.value)
                    )
                  }
                  className="w-full accent-primary"
                />
              </label>
            </section>
            {!colorIsValid ? (
              <p className="text-xs text-destructive">
                أدخل ألواناً صالحة بصيغة HEX.
              </p>
            ) : null}

            <section
              id="header-content-settings"
              aria-labelledby="header-content-title"
              className="space-y-4 rounded-xl border p-4"
            >
              <h2 id="header-content-title" className="font-semibold">
                بيانات الترويسة وتاريخ الوثيقة
              </h2>
              <p className="text-xs text-muted-foreground">
                اختر طريقة عرض التاريخ، ثم اضبط بيانات المسؤول والشعار والهوامش
                المرتبطة بالترويسة.
              </p>
              <label htmlFor="document-date-format" className="block space-y-1">
                <span className="text-sm font-medium">صيغة تاريخ الوثيقة</span>
                <select
                  id="document-date-format"
                  value={values.documentDateFormat}
                  onChange={event =>
                    updateValue(
                      "documentDateFormat",
                      event.target.value as SettingsForm["documentDateFormat"]
                    )
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  {DOCUMENT_DATE_FORMATS.map(format => (
                    <option key={format} value={format}>
                      {DOCUMENT_DATE_FORMAT_LABELS[format]}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  يطبّق على تاريخ الترويسة والتاريخ التلقائي داخل القوالب.
                </span>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">رتبة رئيس الوحدة</span>
                  <input
                    value={values.headerTitle}
                    maxLength={120}
                    onChange={event =>
                      updateValue("headerTitle", event.target.value)
                    }
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">اسم رئيس الوحدة</span>
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
                  <span className="text-sm font-medium">صفة المسؤول</span>
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
                  <span className="text-sm font-medium">اسم الوحدة</span>
                  <input
                    value={values.headerChiefName}
                    maxLength={255}
                    onChange={event =>
                      updateValue("headerChiefName", event.target.value)
                    }
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  إظهار شعار الجهة في وسط رأس الوثيقة
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
              <section className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label htmlFor="document-header-logo-size" className="text-sm font-semibold">
                    حجم شعار الوثيقة
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={MIN_HEADER_LOGO_SIZE}
                      max={MAX_HEADER_LOGO_SIZE}
                      step={1}
                      value={values.headerLogoSize}
                      disabled={!values.headerShowLogo}
                      onChange={event => {
                        const size = Number(event.target.value);
                        if (
                          Number.isInteger(size) &&
                          size >= MIN_HEADER_LOGO_SIZE &&
                          size <= MAX_HEADER_LOGO_SIZE
                        ) {
                          updateValue("headerLogoSize", size);
                        }
                      }}
                      aria-label="حجم الشعار بالبكسل"
                      className="h-9 w-20 rounded-md border bg-background px-2 text-center font-mono text-sm disabled:opacity-50"
                    />
                    <span className="text-xs text-muted-foreground">px</span>
                  </div>
                </div>
                <input
                  id="document-header-logo-size"
                  type="range"
                  min={MIN_HEADER_LOGO_SIZE}
                  max={MAX_HEADER_LOGO_SIZE}
                  step={4}
                  value={values.headerLogoSize}
                  disabled={!values.headerShowLogo}
                  onChange={event =>
                    updateValue("headerLogoSize", Number(event.target.value))
                  }
                  className="w-full accent-primary disabled:opacity-50"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{MIN_HEADER_LOGO_SIZE}px — صغير</span>
                  <span>{MAX_HEADER_LOGO_SIZE}px — كبير</span>
                </div>
                {!values.headerShowLogo ? (
                  <p className="text-xs text-muted-foreground">
                    الشعار مخفي حالياً؛ فعّل خيار إظهار الشعار لتغيير حجمه.
                  </p>
                ) : null}
              </section>
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
            </section>

            <div className="h-px bg-border" />

            <section
              id="page-rows-settings"
              aria-labelledby="page-rows-title"
              className="space-y-4 rounded-xl border p-4"
            >
              <div>
                <h2 id="page-rows-title" className="font-semibold">
                  سطور أعلى الصفحة وأسفلها
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  اختر عدد السطور واكتب نصاً يميناً وآخر يساراً في السطر نفسه،
                  مثل: الجمهورية العربية السورية / Syrian Arab.
                </p>
              </div>
              {(
                [
                  ["pageHeaderRows", "سطور رأس الصفحة"],
                  ["pageFooterRows", "تذييل الصفحة"],
                ] as const
              ).map(([kind, label]) => (
                <div key={kind} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{label}</span>
                    <select
                      value={values[kind].length}
                      onChange={event =>
                        resizeTextRows(kind, Number(event.target.value))
                      }
                      className="rounded-md border bg-background px-2 py-1 text-sm"
                    >
                      {Array.from({ length: 13 }, (_, count) => (
                        <option key={count} value={count}>
                          {count} سطر
                        </option>
                      ))}
                    </select>
                  </div>
                  {values[kind].map((row, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-1 gap-2 md:grid-cols-2"
                    >
                      <input
                        value={row.right}
                        maxLength={255}
                        placeholder={`السطر ${index + 1} — يمين`}
                        onChange={event =>
                          updateTextRow(
                            kind,
                            index,
                            "right",
                            event.target.value
                          )
                        }
                        className="rounded-md border bg-background px-3 py-2 text-sm"
                      />
                      <input
                        value={row.left}
                        maxLength={255}
                        dir="ltr"
                        placeholder={`السطر ${index + 1} — يسار`}
                        onChange={event =>
                          updateTextRow(kind, index, "left", event.target.value)
                        }
                        className="rounded-md border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              ))}
            </section>

            <div className="h-px bg-border" />

            <section
              id="verification-settings"
              aria-labelledby="verification-title"
              className="space-y-3 rounded-xl border p-4"
            >
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span
                    id="verification-title"
                    className="block font-semibold"
                  >
                    رمز التحقق
                  </span>
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

          <PlatformDocumentPreview
            settings={values}
            logoUrl={logoUrl}
            organizationId={organizationId}
            organizationName={organizationContext.data?.organizationName}
            updatedAt={settingsQuery.data?.updatedAt}
          />
        </div>
      )}
    </div>
  );
}
