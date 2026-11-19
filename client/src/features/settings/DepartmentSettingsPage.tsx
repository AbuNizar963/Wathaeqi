import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Building2,
  Hash,
  ImagePlus,
  Info,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ownerTrpc as trpc } from "@/lib/ownerTrpc";
import { TELEGRAM_TIMEZONES } from "@shared/telegrams";

const MAX_LOGO_BYTES = 2_500_000;
const MAX_SERIAL_VALUE = 999_999_999;

type Timezone = (typeof TELEGRAM_TIMEZONES)[number];

type SettingsSource = {
  departmentName: string;
  unitName: string;
  unitChiefRank: string;
  unitChiefName: string;
  serialPrefix: string;
  incomingSerialPrefix: string;
  serialStart: number;
  incomingSerialStart: number;
  nextOutgoingSerial: number;
  nextIncomingSerial: number;
  timezone: string;
  dateFormat: string;
  timeFormat: "12" | "24";
  numberSystem: "latin" | "arabic";
  showVerificationQr: boolean;
  logoUrl: string | null;
};

type SettingsForm = {
  departmentName: string;
  unitName: string;
  unitChiefRank: string;
  unitChiefName: string;
  serialPrefix: string;
  incomingSerialPrefix: string;
  serialStart: string;
  incomingSerialStart: string;
  nextOutgoingSerial: string;
  nextIncomingSerial: string;
  timezone: Timezone;
  dateFormat: string;
  timeFormat: "12" | "24";
  numberSystem: "latin" | "arabic";
  showVerificationQr: boolean;
  logoUrl: string | null;
};

type FormErrors = Partial<Record<keyof SettingsForm, string>>;

const FORM_KEYS = [
  "departmentName",
  "unitName",
  "unitChiefRank",
  "unitChiefName",
  "serialPrefix",
  "incomingSerialPrefix",
  "serialStart",
  "incomingSerialStart",
  "nextOutgoingSerial",
  "nextIncomingSerial",
  "timezone",
  "dateFormat",
  "timeFormat",
  "numberSystem",
  "showVerificationQr",
  "logoUrl",
] as const satisfies readonly (keyof SettingsForm)[];

const SERIAL_PREFIX_PATTERN = /^[A-Za-z0-9-]{1,24}$/;

function isTimezone(value: string): value is Timezone {
  return (TELEGRAM_TIMEZONES as readonly string[]).includes(value);
}

function timezoneLabel(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("ar", {
      timeZone: timezone,
      timeZoneName: "long",
    }).formatToParts(new Date());
    const name = parts.find(part => part.type === "timeZoneName")?.value;
    return name ?? timezone;
  } catch {
    return timezone;
  }
}

const TIMEZONE_OPTIONS = TELEGRAM_TIMEZONES.map(value => ({
  value,
  label: timezoneLabel(value),
}));

function toForm(source: SettingsSource): SettingsForm {
  return {
    departmentName: source.departmentName,
    unitName: source.unitName,
    unitChiefRank: source.unitChiefRank,
    unitChiefName: source.unitChiefName,
    serialPrefix: source.serialPrefix,
    incomingSerialPrefix: source.incomingSerialPrefix,
    serialStart: String(source.serialStart),
    incomingSerialStart: String(source.incomingSerialStart),
    nextOutgoingSerial: String(source.nextOutgoingSerial),
    nextIncomingSerial: String(source.nextIncomingSerial),
    timezone: isTimezone(source.timezone) ? source.timezone : "Asia/Damascus",
    dateFormat: source.dateFormat,
    timeFormat: source.timeFormat,
    numberSystem: source.numberSystem,
    showVerificationQr: source.showVerificationQr,
    logoUrl: source.logoUrl,
  };
}

function toPayload(form: SettingsForm) {
  return {
    departmentName: form.departmentName.trim(),
    unitName: form.unitName.trim(),
    unitChiefRank: form.unitChiefRank.trim(),
    unitChiefName: form.unitChiefName.trim(),
    serialPrefix: form.serialPrefix.trim().toUpperCase(),
    incomingSerialPrefix: form.incomingSerialPrefix.trim().toUpperCase(),
    serialStart: Number(form.serialStart),
    incomingSerialStart: Number(form.incomingSerialStart),
    nextOutgoingSerial: Number(form.nextOutgoingSerial),
    nextIncomingSerial: Number(form.nextIncomingSerial),
    timezone: form.timezone,
    dateFormat: form.dateFormat.trim(),
    timeFormat: form.timeFormat,
    numberSystem: form.numberSystem,
    showVerificationQr: form.showVerificationQr,
    logoUrl: form.logoUrl,
  };
}

function formsEqual(left: SettingsForm, right: SettingsForm): boolean {
  return FORM_KEYS.every(key => left[key] === right[key]);
}

function validateSettings(form: SettingsForm): FormErrors {
  const errors: FormErrors = {};

  const departmentName = form.departmentName.trim();
  if (departmentName.length < 2) {
    errors.departmentName = "أدخل اسم الإدارة (حرفان على الأقل).";
  } else if (departmentName.length > 255) {
    errors.departmentName = "اسم الإدارة يتجاوز 255 محرفاً.";
  }

  const unitName = form.unitName.trim();
  if (!unitName) errors.unitName = "أدخل اسم الوحدة.";
  else if (unitName.length > 255) errors.unitName = "اسم الوحدة طويل جداً.";

  const unitChiefRank = form.unitChiefRank.trim();
  if (!unitChiefRank) errors.unitChiefRank = "أدخل رتبة رئيس الوحدة.";
  else if (unitChiefRank.length > 120) {
    errors.unitChiefRank = "الرتبة تتجاوز 120 محرفاً.";
  }

  const unitChiefName = form.unitChiefName.trim();
  if (!unitChiefName) errors.unitChiefName = "أدخل اسم رئيس الوحدة.";
  else if (unitChiefName.length > 255) {
    errors.unitChiefName = "الاسم يتجاوز 255 محرفاً.";
  }

  if (!SERIAL_PREFIX_PATTERN.test(form.serialPrefix.trim())) {
    errors.serialPrefix =
      "بادئة الصادر تقبل الأحرف اللاتينية والأرقام والشرطة (24 محرفاً كحد أقصى).";
  }

  if (!SERIAL_PREFIX_PATTERN.test(form.incomingSerialPrefix.trim())) {
    errors.incomingSerialPrefix =
      "بادئة الوارد تقبل الأحرف اللاتينية والأرقام والشرطة (24 محرفاً كحد أقصى).";
  }

  const numericFields: Array<{
    key:
      | "serialStart"
      | "incomingSerialStart"
      | "nextOutgoingSerial"
      | "nextIncomingSerial";
    label: string;
  }> = [
    { key: "serialStart", label: "بداية ترقيم الصادر" },
    { key: "incomingSerialStart", label: "بداية ترقيم الوارد" },
    { key: "nextOutgoingSerial", label: "العدّاد الحالي للصادر" },
    { key: "nextIncomingSerial", label: "العدّاد الحالي للوارد" },
  ];

  for (const field of numericFields) {
    const value = Number(form[field.key]);
    if (!Number.isInteger(value) || value < 1 || value > MAX_SERIAL_VALUE) {
      errors[field.key] =
        `${field.label} يجب أن يكون رقماً صحيحاً بين 1 و${MAX_SERIAL_VALUE}.`;
    }
  }

  const dateFormat = form.dateFormat.trim();
  if (dateFormat.length < 4) {
    errors.dateFormat = "أدخل صيغة تاريخ صالحة (4 محارف على الأقل).";
  } else if (dateFormat.length > 32) {
    errors.dateFormat = "صيغة التاريخ تتجاوز 32 محرفاً.";
  }

  return errors;
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("تعذر قراءة ملف الشعار"));
    };
    reader.onerror = () => reject(new Error("تعذر قراءة ملف الشعار"));
    reader.readAsDataURL(file);
  });
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default function DepartmentSettingsPage() {
  const utils = trpc.useUtils();
  const settingsQuery = trpc.departmentSettings.get.useQuery();
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    if (settingsQuery.data && form === null) {
      setForm(toForm(settingsQuery.data));
      setLogoPreview(settingsQuery.data.logoDataUrl);
    }
  }, [settingsQuery.data, form]);

  const saveSettings = trpc.departmentSettings.update.useMutation({
    onSuccess: async saved => {
      setForm(toForm(saved));
      await utils.departmentSettings.get.invalidate();
      toast.success("تم حفظ إعدادات القسم");
    },
    onError: error => toast.error(error.message),
  });

  const uploadLogo = trpc.organizations.uploadLogo.useMutation({
    onSuccess: async () => {
      await utils.departmentSettings.get.invalidate();
      toast.success("تم رفع شعار القسم");
    },
    onError: error => {
      setLogoPreview(null);
      setLogoError(error.message);
      toast.error(error.message);
    },
  });

  const settings = settingsQuery.data;
  const canEdit = settings?.canEdit ?? false;

  const baseline = useMemo(
    () => (settings ? toForm(settings) : null),
    [settings]
  );

  const errors = useMemo<FormErrors>(
    () => (form ? validateSettings(form) : {}),
    [form]
  );
  const hasErrors = Object.keys(errors).length > 0;

  const isDirty = Boolean(form && baseline && !formsEqual(form, baseline));

  const updateForm = (patch: Partial<SettingsForm>) =>
    setForm(current => (current ? { ...current, ...patch } : current));

  const handleSave = () => {
    if (!form) return;
    if (hasErrors) {
      toast.error("تحقق من الحقول المطلوبة قبل الحفظ.");
      return;
    }
    saveSettings.mutate(toPayload(form));
  };

  const handleLogoFile = async (file: File) => {
    if (!settings) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setLogoError("صيغة الشعار يجب أن تكون PNG أو JPG.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("حجم الشعار يجب ألا يتجاوز 2.5 ميغابايت.");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      if (!base64) {
        setLogoError("تعذر قراءة ملف الشعار.");
        return;
      }
      setLogoError(null);
      setLogoPreview(dataUrl);
      uploadLogo.mutate({
        id: settings.organizationId,
        contentType: file.type === "image/jpeg" ? "image/jpeg" : "image/png",
        base64,
      });
    } catch (error) {
      setLogoError(
        error instanceof Error ? error.message : "تعذر قراءة ملف الشعار"
      );
    }
  };

  const currentOutgoing = form ? Number(form.nextOutgoingSerial) : 0;
  const currentIncoming = form ? Number(form.nextIncomingSerial) : 0;
  const savedOutgoing = baseline ? Number(baseline.nextOutgoingSerial) : 0;
  const savedIncoming = baseline ? Number(baseline.nextIncomingSerial) : 0;
  const counterIncreased =
    currentOutgoing > savedOutgoing || currentIncoming > savedIncoming;
  const counterDecreased =
    currentOutgoing < savedOutgoing || currentIncoming < savedIncoming;

  const previewDate = new Date().toISOString().slice(0, 10);
  const previewPrefix = form?.serialPrefix.trim() || "—";
  const parsedPreviewCounter = Number.parseInt(
    form?.nextOutgoingSerial ?? "",
    10
  );
  const previewCounter =
    Number.isFinite(parsedPreviewCounter) && parsedPreviewCounter > 0
      ? parsedPreviewCounter
      : 0;
  const previewCode = `${previewPrefix}-${previewDate}-${String(
    previewCounter
  ).padStart(5, "0")}`;

  const logoSource = logoPreview ?? settings?.logoDataUrl ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-5" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <SlidersHorizontal className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">إعدادات القسم</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              هوية القسم وترقيم الصادر والوارد وتنسيقات العرض والطباعة
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {settings?.organizationName ? (
            <Badge variant="outline">{settings.organizationName}</Badge>
          ) : null}
          {settings?.organizationCode ? (
            <Badge variant="secondary" dir="ltr">
              {settings.organizationCode}
            </Badge>
          ) : null}
          <Button
            onClick={handleSave}
            disabled={
              !form ||
              !baseline ||
              !canEdit ||
              saveSettings.isPending ||
              !isDirty ||
              hasErrors
            }
          >
            <Save className="ml-2 h-4 w-4" aria-hidden="true" />
            {saveSettings.isPending ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
          </Button>
        </div>
      </header>

      {settingsQuery.isError ? (
        <Card className="space-y-3 p-5" role="alert">
          <p className="font-semibold">تعذّر تحميل إعدادات القسم</p>
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
      ) : settingsQuery.isLoading || !form || !baseline ? (
        <div className="grid gap-4 lg:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map(index => (
            <Skeleton key={index} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {!canEdit ? (
            <Card className="flex-row items-start gap-3 border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p>
                عرض للقراءة فقط: تعديل إعدادات القسم متاح لمدير الجهة أو مالك
                المنصة.
              </p>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <Card className="gap-4 p-5">
                <SectionHeader
                  icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
                  title="هوية القسم"
                  description="تظهر هذه البيانات في ترويسة الوثائق والبرقيات الرسمية."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="اسم الإدارة *"
                    htmlFor="department-name"
                    error={errors.departmentName}
                  >
                    <Input
                      id="department-name"
                      value={form.departmentName}
                      maxLength={255}
                      disabled={!canEdit}
                      onChange={event =>
                        updateForm({ departmentName: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label="اسم الوحدة *"
                    htmlFor="unit-name"
                    error={errors.unitName}
                  >
                    <Input
                      id="unit-name"
                      value={form.unitName}
                      maxLength={255}
                      disabled={!canEdit}
                      onChange={event =>
                        updateForm({ unitName: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label="رتبة رئيس الوحدة *"
                    htmlFor="unit-chief-rank"
                    error={errors.unitChiefRank}
                  >
                    <Input
                      id="unit-chief-rank"
                      value={form.unitChiefRank}
                      maxLength={120}
                      disabled={!canEdit}
                      onChange={event =>
                        updateForm({ unitChiefRank: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label="اسم رئيس الوحدة *"
                    htmlFor="unit-chief-name"
                    error={errors.unitChiefName}
                  >
                    <Input
                      id="unit-chief-name"
                      value={form.unitChiefName}
                      maxLength={255}
                      disabled={!canEdit}
                      onChange={event =>
                        updateForm({ unitChiefName: event.target.value })
                      }
                    />
                  </Field>
                </div>

                <div className="space-y-3 border-t pt-4">
                  <Label htmlFor="department-logo">شعار القسم</Label>
                  <div className="flex flex-wrap items-center gap-4">
                    {logoSource ? (
                      <img
                        src={logoSource}
                        alt="شعار القسم"
                        className="h-20 w-20 rounded-2xl border bg-white object-contain p-1"
                      />
                    ) : (
                      <div className="grid h-20 w-20 place-items-center rounded-2xl border bg-muted text-muted-foreground">
                        <ImagePlus className="h-6 w-6" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        id="department-logo"
                        type="file"
                        accept="image/png,image/jpeg"
                        disabled={!canEdit || uploadLogo.isPending}
                        onChange={event => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) void handleLogoFile(file);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        PNG أو JPG بحجم أقصى 2.5 ميغابايت. يُرفع الشعار مباشرة
                        ويُستخدم في ترويسة المخرجات.
                      </p>
                      {logoError ? (
                        <p className="text-xs text-destructive">{logoError}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="gap-4 p-5">
                <SectionHeader
                  icon={<Hash className="h-4 w-4" aria-hidden="true" />}
                  title="الترقيم"
                  description="بادئات التسلسل والعدادات المستخدمة في ترقيم الصادر والوارد."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="بادئة الصادر *"
                    htmlFor="serial-prefix"
                    error={errors.serialPrefix}
                  >
                    <Input
                      id="serial-prefix"
                      value={form.serialPrefix}
                      maxLength={24}
                      dir="ltr"
                      disabled={!canEdit}
                      onChange={event =>
                        updateForm({
                          serialPrefix: event.target.value.toUpperCase(),
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="بادئة الوارد *"
                    htmlFor="incoming-serial-prefix"
                    error={errors.incomingSerialPrefix}
                  >
                    <Input
                      id="incoming-serial-prefix"
                      value={form.incomingSerialPrefix}
                      maxLength={24}
                      dir="ltr"
                      disabled={!canEdit}
                      onChange={event =>
                        updateForm({
                          incomingSerialPrefix:
                            event.target.value.toUpperCase(),
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="بداية ترقيم الصادر *"
                    htmlFor="serial-start"
                    error={errors.serialStart}
                  >
                    <Input
                      id="serial-start"
                      type="number"
                      min={1}
                      max={MAX_SERIAL_VALUE}
                      step={1}
                      dir="ltr"
                      value={form.serialStart}
                      disabled={!canEdit}
                      onChange={event =>
                        updateForm({ serialStart: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label="بداية ترقيم الوارد *"
                    htmlFor="incoming-serial-start"
                    error={errors.incomingSerialStart}
                  >
                    <Input
                      id="incoming-serial-start"
                      type="number"
                      min={1}
                      max={MAX_SERIAL_VALUE}
                      step={1}
                      dir="ltr"
                      value={form.incomingSerialStart}
                      disabled={!canEdit}
                      onChange={event =>
                        updateForm({ incomingSerialStart: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label="العدّاد الحالي للصادر *"
                    htmlFor="next-outgoing"
                    error={errors.nextOutgoingSerial}
                    hint="رقم البرقية الصادرة التالية."
                  >
                    <Input
                      id="next-outgoing"
                      type="number"
                      min={1}
                      max={MAX_SERIAL_VALUE}
                      step={1}
                      dir="ltr"
                      value={form.nextOutgoingSerial}
                      disabled={!canEdit}
                      onChange={event =>
                        updateForm({ nextOutgoingSerial: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label="العدّاد الحالي للوارد *"
                    htmlFor="next-incoming"
                    error={errors.nextIncomingSerial}
                    hint="رقم البرقية الواردة التالية."
                  >
                    <Input
                      id="next-incoming"
                      type="number"
                      min={1}
                      max={MAX_SERIAL_VALUE}
                      step={1}
                      dir="ltr"
                      value={form.nextIncomingSerial}
                      disabled={!canEdit}
                      onChange={event =>
                        updateForm({ nextIncomingSerial: event.target.value })
                      }
                    />
                  </Field>
                </div>

                <div className="rounded-xl border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">
                    معاينة رقم الصادر التالي
                  </p>
                  <p className="mt-1 font-mono text-sm font-semibold" dir="ltr">
                    {previewCode}
                  </p>
                </div>

                {counterDecreased ? (
                  <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    لا يمكن تقليل العدّاد الحالي لأنه يعيد استخدام أرقام برقيات
                    صادرة؛ سيرفض الخادم الحفظ. يمكنك زيادة الرقم فقط.
                  </p>
                ) : counterIncreased ? (
                  <p className="rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    تنبيه: زيادة العدّاد تتخطى أرقاماً لم تُستخدم بعد. تأكد من
                    الرقم قبل الحفظ.
                  </p>
                ) : null}
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="gap-4 p-5">
                <SectionHeader
                  icon={
                    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  }
                  title="العرض والتنسيق"
                  description="المنطقة الزمنية وصيغ التاريخ والأرقام في المخرجات."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label="المنطقة الزمنية *">
                      <Select
                        value={form.timezone}
                        disabled={!canEdit}
                        onValueChange={value => {
                          if (isTimezone(value))
                            updateForm({ timezone: value });
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="اختر المنطقة الزمنية" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONE_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  <Field
                    label="صيغة التاريخ *"
                    htmlFor="date-format"
                    error={errors.dateFormat}
                    hint="مثال: dd/MM/yyyy HH:mm:ss"
                  >
                    <Input
                      id="date-format"
                      value={form.dateFormat}
                      maxLength={32}
                      dir="ltr"
                      disabled={!canEdit}
                      onChange={event =>
                        updateForm({ dateFormat: event.target.value })
                      }
                    />
                  </Field>

                  <Field label="نظام الوقت *">
                    <Select
                      value={form.timeFormat}
                      disabled={!canEdit}
                      onValueChange={value => {
                        if (value === "12" || value === "24") {
                          updateForm({ timeFormat: value });
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="اختر نظام الوقت" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24">24 ساعة</SelectItem>
                        <SelectItem value="12">12 ساعة (ص/م)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <div className="sm:col-span-2">
                    <Field label="نظام الأرقام *">
                      <Select
                        value={form.numberSystem}
                        disabled={!canEdit}
                        onValueChange={value => {
                          if (value === "latin" || value === "arabic") {
                            updateForm({ numberSystem: value });
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="اختر نظام الأرقام" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="latin">
                            أرقام لاتينية (0-9)
                          </SelectItem>
                          <SelectItem value="arabic">
                            أرقام عربية (٠-٩)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </div>

                <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <span>
                    <span className="block text-sm font-medium">
                      إظهار رمز التحقق (QR)
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      إضافة رمز تحقق قابل للمسح في مخرجات الوثائق والبرقيات.
                    </span>
                  </span>
                  <Switch
                    checked={form.showVerificationQr}
                    disabled={!canEdit}
                    onCheckedChange={checked =>
                      updateForm({ showVerificationQr: checked })
                    }
                    aria-label="إظهار رمز التحقق"
                  />
                </label>
              </Card>

              <Card className="gap-3 p-5">
                <h2 className="font-semibold">ملخص الإعدادات</h2>
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">الجهة</dt>
                    <dd className="font-medium">
                      {settings?.organizationName ?? "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">بادئة الصادر</dt>
                    <dd className="font-mono text-xs" dir="ltr">
                      {form.serialPrefix || "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">المنطقة الزمنية</dt>
                    <dd className="font-mono text-xs" dir="ltr">
                      {form.timezone}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">آخر تحديث</dt>
                    <dd className="text-xs">
                      {settings?.updatedAt
                        ? new Date(settings.updatedAt).toLocaleString("ar")
                        : "—"}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground">
                  {isDirty
                    ? "لديك تغييرات غير محفوظة."
                    : "كل التغييرات محفوظة."}
                </p>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
