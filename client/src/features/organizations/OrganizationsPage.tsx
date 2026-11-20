import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Building2,
  CornerDownLeft,
  ImagePlus,
  Info,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const ORGANIZATION_TYPES = [
  "ministry",
  "general_command",
  "directorate",
  "department",
  "station",
  "unit",
] as const;

type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  ministry: "وزارة",
  general_command: "قيادة عامة",
  directorate: "مديرية",
  department: "إدارة / قسم",
  station: "مخفر",
  unit: "وحدة",
};

const NO_PARENT = "__no_parent__";
const NO_DESTINATION = "__no_destination__";
const MAX_LOGO_BYTES = 2_500_000;

type OrganizationRecord = {
  id: string;
  name: string;
  code: string;
  type: string;
  parentOrganizationId: string | null;
  telegramDestinationOrganizationId: string | null;
  logoKey: string | null;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type OrganizationForm = {
  name: string;
  code: string;
  type: OrganizationType;
  parentOrganizationId: string;
  telegramDestinationOrganizationId: string;
};

type OrganizationRow = {
  organization: OrganizationRecord;
  depth: number;
};

const EMPTY_FORM: OrganizationForm = {
  name: "",
  code: "",
  type: "department",
  parentOrganizationId: "",
  telegramDestinationOrganizationId: "",
};

function isOrganizationType(value: string): value is OrganizationType {
  return (ORGANIZATION_TYPES as readonly string[]).includes(value);
}

function organizationTypeLabel(value: string): string {
  return isOrganizationType(value) ? ORGANIZATION_TYPE_LABELS[value] : value;
}

function buildOrganizationRows(
  organizations: readonly OrganizationRecord[]
): OrganizationRow[] {
  const byId = new Map(organizations.map(item => [item.id, item]));
  const childrenByParent = new Map<string, OrganizationRecord[]>();
  const roots: OrganizationRecord[] = [];

  for (const organization of organizations) {
    const parentId = organization.parentOrganizationId;
    if (parentId && parentId !== organization.id && byId.has(parentId)) {
      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(organization);
      childrenByParent.set(parentId, siblings);
    } else {
      roots.push(organization);
    }
  }

  const byName = (left: OrganizationRecord, right: OrganizationRecord) =>
    left.name.localeCompare(right.name, "ar");

  const rows: OrganizationRow[] = [];
  const visited = new Set<string>();

  const visit = (organization: OrganizationRecord, depth: number) => {
    if (visited.has(organization.id)) return;
    visited.add(organization.id);
    rows.push({ organization, depth });
    const children = [...(childrenByParent.get(organization.id) ?? [])];
    children.sort(byName);
    for (const child of children) visit(child, depth + 1);
  };

  [...roots].sort(byName).forEach(root => visit(root, 0));
  organizations
    .filter(organization => !visited.has(organization.id))
    .forEach(organization => visit(organization, 0));

  return rows;
}

function isSelfOrDescendant(
  candidateId: string,
  organizationId: string,
  byId: Map<string, OrganizationRecord>
): boolean {
  let current: string | null = candidateId;
  const seen = new Set<string>();
  while (current) {
    if (current === organizationId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = byId.get(current)?.parentOrganizationId ?? null;
  }
  return false;
}

function validateOrganizationForm(input: {
  form: OrganizationForm;
  organizations: readonly OrganizationRecord[];
  editingId: string | null;
}): string | null {
  const { form, organizations, editingId } = input;
  const name = form.name.trim();
  const code = form.code.trim();
  if (name.length < 2) return "أدخل اسم الجهة (حرفان على الأقل).";
  if (name.length > 255) return "اسم الجهة يتجاوز 255 محرفاً.";
  if (!code) return "أدخل رمز الجهة.";
  if (code.length > 32) return "رمز الجهة يجب ألا يتجاوز 32 محرفاً.";

  const duplicated = organizations.some(
    item =>
      item.id !== editingId && item.code.toUpperCase() === code.toUpperCase()
  );
  if (duplicated) return "رمز الجهة مستخدم مسبقاً، اختر رمزاً آخر.";

  const byId = new Map(organizations.map(item => [item.id, item]));
  if (form.parentOrganizationId) {
    if (!byId.has(form.parentOrganizationId)) {
      return "الجهة الأم المحددة غير موجودة.";
    }
    if (
      editingId &&
      isSelfOrDescendant(form.parentOrganizationId, editingId, byId)
    ) {
      return "لا يمكن اختيار الجهة نفسها أو إحدى الجهات التابعة لها كجهة أم.";
    }
  }

  if (
    form.telegramDestinationOrganizationId &&
    !byId.has(form.telegramDestinationOrganizationId)
  ) {
    return "جهة الإحالة المحددة غير موجودة.";
  }

  return null;
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
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function OrganizationLogoDialog({
  organization,
  onClose,
}: {
  organization: OrganizationRecord;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const logoQuery = trpc.organizations.logo.useQuery({ id: organization.id });
  const [preview, setPreview] = useState<string | null>(null);

  const uploadLogo = trpc.organizations.uploadLogo.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.organizations.logo.invalidate({ id: organization.id }),
        utils.organizations.list.invalidate(),
      ]);
      toast.success("تم رفع شعار الجهة");
    },
    onError: error => toast.error(error.message),
  });

  const handleFile = async (file: File) => {
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      toast.error("صيغة الشعار يجب أن تكون PNG أو JPG");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("حجم الشعار يجب ألا يتجاوز 2.5 ميغابايت");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      if (!base64) {
        toast.error("تعذر قراءة ملف الشعار");
        return;
      }
      setPreview(dataUrl);
      uploadLogo.mutate({
        id: organization.id,
        contentType: file.type === "image/jpeg" ? "image/jpeg" : "image/png",
        base64,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر قراءة ملف الشعار"
      );
    }
  };

  const currentLogo = preview ?? logoQuery.data?.dataUrl ?? null;

  return (
    <Dialog open onOpenChange={open => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>شعار الجهة</DialogTitle>
          <DialogDescription>
            شعار «{organization.name}» يظهر في ترويسة الوثائق.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-4">
          {logoQuery.isLoading && !currentLogo ? (
            <Skeleton className="h-24 w-24 rounded-2xl" />
          ) : currentLogo ? (
            <img
              src={currentLogo}
              alt={`شعار ${organization.name}`}
              className="h-24 w-24 rounded-2xl border bg-white object-contain p-1"
            />
          ) : (
            <div className="grid h-24 w-24 place-items-center rounded-2xl border bg-muted text-muted-foreground">
              <ImagePlus className="h-7 w-7" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <Input
              type="file"
              accept="image/png,image/jpeg"
              disabled={uploadLogo.isPending}
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleFile(file);
              }}
            />
            <p className="text-xs text-muted-foreground">
              PNG أو JPG بحجم أقصى 2.5 ميغابايت. يُفضّل شعار مربّع بخلفية شفافة.
            </p>
            {logoQuery.isError ? (
              <div className="space-y-2 text-xs text-destructive">
                <p>تعذر تحميل الشعار الحالي: {logoQuery.error.message}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void logoQuery.refetch()}
                  disabled={logoQuery.isFetching}
                >
                  إعادة المحاولة
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OrganizationsPage() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [form, setForm] = useState<OrganizationForm>(EMPTY_FORM);
  const [editingOrganization, setEditingOrganization] =
    useState<OrganizationRecord | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [logoOrganization, setLogoOrganization] =
    useState<OrganizationRecord | null>(null);

  const contextQuery = trpc.organizations.context.useQuery();
  const listQuery = trpc.organizations.list.useQuery({ includeInactive });
  const isOwner = contextQuery.data?.isOwner ?? false;

  const organizations = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const rows = useMemo(
    () => buildOrganizationRows(organizations),
    [organizations]
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar");
    if (!term) return rows;
    return rows.filter(({ organization }) =>
      [
        organization.name,
        organization.code,
        organizationTypeLabel(organization.type),
      ]
        .join(" ")
        .toLocaleLowerCase("ar")
        .includes(term)
    );
  }, [rows, search]);

  const parentNames = useMemo(
    () => new Map(organizations.map(item => [item.id, item.name])),
    [organizations]
  );

  const createOrganization = trpc.organizations.create.useMutation({
    onSuccess: async () => {
      await utils.organizations.list.invalidate();
      setIsDialogOpen(false);
      setEditingOrganization(null);
      setForm(EMPTY_FORM);
      toast.success("تمت إضافة الجهة");
    },
    onError: error => toast.error(error.message),
  });

  const updateOrganization = trpc.organizations.update.useMutation({
    onSuccess: async () => {
      await utils.organizations.list.invalidate();
      setIsDialogOpen(false);
      setEditingOrganization(null);
      setForm(EMPTY_FORM);
      toast.success("تم تحديث بيانات الجهة");
    },
    onError: error => toast.error(error.message),
  });

  const setOrganizationActive = trpc.organizations.setActive.useMutation({
    onSuccess: async () => {
      await utils.organizations.list.invalidate();
      toast.success("تم تحديث حالة الجهة");
    },
    onError: error => toast.error(error.message),
  });

  const mutationPending =
    createOrganization.isPending ||
    updateOrganization.isPending ||
    setOrganizationActive.isPending;

  const validationError = validateOrganizationForm({
    form,
    organizations,
    editingId: editingOrganization?.id ?? null,
  });

  const updateForm = (patch: Partial<OrganizationForm>) =>
    setForm(current => ({ ...current, ...patch }));

  const openCreateDialog = () => {
    setEditingOrganization(null);
    setForm(EMPTY_FORM);
    setIsDialogOpen(true);
  };

  const openEditDialog = (organization: OrganizationRecord) => {
    setEditingOrganization(organization);
    setForm({
      name: organization.name,
      code: organization.code,
      type: isOrganizationType(organization.type)
        ? organization.type
        : "department",
      parentOrganizationId: organization.parentOrganizationId ?? "",
      telegramDestinationOrganizationId:
        organization.telegramDestinationOrganizationId ?? "",
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingOrganization(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = () => {
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      type: form.type,
      parentOrganizationId: form.parentOrganizationId || null,
      telegramDestinationOrganizationId:
        form.telegramDestinationOrganizationId || null,
    };
    if (editingOrganization) {
      updateOrganization.mutate({ id: editingOrganization.id, ...payload });
    } else {
      createOrganization.mutate(payload);
    }
  };

  const toggleActive = (organization: OrganizationRecord) => {
    setOrganizationActive.mutate({
      id: organization.id,
      isActive: !organization.isActive,
    });
  };

  const isCurrentOrganization = (organization: OrganizationRecord) =>
    organization.id === contextQuery.data?.organizationId;

  const parentOptions = useMemo(() => {
    if (!editingOrganization) return organizations;
    const byId = new Map(organizations.map(item => [item.id, item]));
    return organizations.filter(
      item => !isSelfOrDescendant(item.id, editingOrganization.id, byId)
    );
  }, [editingOrganization, organizations]);

  const destinationOptions = useMemo(
    () =>
      editingOrganization
        ? organizations.filter(item => item.id !== editingOrganization.id)
        : organizations,
    [editingOrganization, organizations]
  );

  const activeCount = organizations.filter(item => item.isActive).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">إدارة الجهات</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              الهيكل التنظيمي للجهات وربط الجهات الأم وجهات الإحالة
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void listQuery.refetch()}
            disabled={listQuery.isFetching}
          >
            <RefreshCw className="ml-2 h-4 w-4" aria-hidden="true" />
            {listQuery.isFetching ? "جارٍ التحديث..." : "تحديث"}
          </Button>
          {isOwner ? (
            <Button onClick={openCreateDialog} disabled={mutationPending}>
              <Plus className="ml-2 h-4 w-4" aria-hidden="true" />
              إضافة جهة
            </Button>
          ) : null}
        </div>
      </header>

      {contextQuery.isError ? (
        <Card className="space-y-3 p-5" role="alert">
          <p className="font-semibold">تعذّر تحديد صلاحيات حسابك</p>
          <p className="text-sm text-muted-foreground">
            {contextQuery.error.message}
          </p>
          <Button
            variant="outline"
            onClick={() => void contextQuery.refetch()}
            disabled={contextQuery.isFetching}
          >
            إعادة المحاولة
          </Button>
        </Card>
      ) : null}

      {!contextQuery.isLoading && !isOwner ? (
        <Card className="flex-row items-start gap-3 border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            أنت تعرض الجهات المرتبطة بحسابك للقراءة فقط. إنشاء الجهات وتعديلها
            وتعطيلها ورفع شعاراتها متاح لمالك المنصة.
          </p>
        </Card>
      ) : null}

      <Card className="gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">الجهات المسجّلة</h2>
            <Badge variant="secondary">{organizations.length}</Badge>
            <Badge variant="outline">{activeCount} نشطة</Badge>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            {isOwner ? (
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={includeInactive}
                  onCheckedChange={setIncludeInactive}
                  aria-label="إظهار الجهات المعطّلة"
                />
                إظهار المعطّلة
              </label>
            ) : null}
            <div className="relative w-full min-w-48 sm:w-64">
              <Search
                className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="ابحث بالاسم أو الرمز..."
                className="pe-9"
                aria-label="بحث في الجهات"
              />
            </div>
          </div>
        </div>

        {listQuery.isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2, 3, 4].map(index => (
              <Skeleton key={index} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : listQuery.isError ? (
          <div className="space-y-3 rounded-xl border border-destructive/40 p-4">
            <p className="font-semibold">تعذّر تحميل الجهات</p>
            <p className="text-sm text-muted-foreground">
              {listQuery.error.message}
            </p>
            <Button
              variant="outline"
              onClick={() => void listQuery.refetch()}
              disabled={listQuery.isFetching}
            >
              إعادة المحاولة
            </Button>
          </div>
        ) : filteredRows.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {organizations.length === 0
              ? "لا توجد جهات مسجّلة بعد. ابدأ بإضافة أول جهة."
              : "لا توجد جهات مطابقة لبحثك."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/60 text-right">
                <tr>
                  <th className="p-3">الرمز</th>
                  <th className="p-3">اسم الجهة</th>
                  <th className="p-3">النوع</th>
                  <th className="p-3">الجهة الأم</th>
                  <th className="p-3">جهة الإحالة</th>
                  <th className="p-3">الحالة</th>
                  {isOwner ? <th className="p-3">الإجراءات</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(({ organization, depth }) => (
                  <tr key={organization.id} className="border-t">
                    <td className="p-3 font-mono text-xs" dir="ltr">
                      {organization.code}
                    </td>
                    <td className="p-3">
                      <div
                        className="flex items-center gap-2"
                        style={{ paddingInlineStart: `${depth * 18}px` }}
                      >
                        {depth > 0 ? (
                          <CornerDownLeft
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className="font-medium">{organization.name}</span>
                        {organization.logoKey ? (
                          <Badge variant="outline" className="text-[10px]">
                            شعار
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-3">
                      {organizationTypeLabel(organization.type)}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {organization.parentOrganizationId
                        ? (parentNames.get(organization.parentOrganizationId) ??
                          "—")
                        : "—"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {organization.telegramDestinationOrganizationId
                        ? (parentNames.get(
                            organization.telegramDestinationOrganizationId
                          ) ?? "—")
                        : "—"}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          organization.isActive ? "default" : "secondary"
                        }
                      >
                        {organization.isActive ? "نشطة" : "معطّلة"}
                      </Badge>
                    </td>
                    {isOwner ? (
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="تعديل"
                            aria-label={`تعديل ${organization.name}`}
                            disabled={mutationPending}
                            onClick={() => openEditDialog(organization)}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={organization.isActive ? "تعطيل" : "تفعيل"}
                            aria-label={
                              organization.isActive
                                ? `تعطيل ${organization.name}`
                                : `تفعيل ${organization.name}`
                            }
                            disabled={
                              mutationPending ||
                              (organization.isActive &&
                                isCurrentOrganization(organization))
                            }
                            onClick={() => toggleActive(organization)}
                          >
                            <Power className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="رفع شعار"
                            aria-label={`رفع شعار ${organization.name}`}
                            disabled={mutationPending}
                            onClick={() => setLogoOrganization(organization)}
                          >
                            <ImagePlus className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog
        open={isDialogOpen}
        onOpenChange={open => (open ? setIsDialogOpen(true) : closeDialog())}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingOrganization ? "تعديل بيانات الجهة" : "إضافة جهة جديدة"}
            </DialogTitle>
            <DialogDescription>
              يُستخدم رمز الجهة في تسلسل الوثائق، ويجب أن يكون فريداً.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم الجهة *" htmlFor="organization-name">
              <Input
                id="organization-name"
                value={form.name}
                maxLength={255}
                placeholder="مثال: إدارة الشرطة"
                onChange={event => updateForm({ name: event.target.value })}
              />
            </Field>

            <Field
              label="رمز الجهة *"
              htmlFor="organization-code"
              hint="أحرف لاتينية أو أرقام، بحد أقصى 32 محرفاً."
            >
              <Input
                id="organization-code"
                value={form.code}
                maxLength={32}
                dir="ltr"
                placeholder="POL"
                onChange={event =>
                  updateForm({ code: event.target.value.toUpperCase() })
                }
              />
            </Field>

            <Field label="نوع الجهة *">
              <Select
                value={form.type}
                onValueChange={value => {
                  if (isOrganizationType(value)) updateForm({ type: value });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر النوع" />
                </SelectTrigger>
                <SelectContent>
                  {ORGANIZATION_TYPES.map(type => (
                    <SelectItem key={type} value={type}>
                      {ORGANIZATION_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="الجهة الأم">
              <Select
                value={form.parentOrganizationId || NO_PARENT}
                onValueChange={value =>
                  updateForm({
                    parentOrganizationId: value === NO_PARENT ? "" : value,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="بدون جهة أم" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARENT}>بدون جهة أم</SelectItem>
                  {parentOptions.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                      {option.isActive ? "" : " (معطّلة)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="جهة الإحالة الافتراضية"
              hint="الجهة التي تُحال إليها وثائق هذه الجهة افتراضياً."
            >
              <Select
                value={form.telegramDestinationOrganizationId || NO_DESTINATION}
                onValueChange={value =>
                  updateForm({
                    telegramDestinationOrganizationId:
                      value === NO_DESTINATION ? "" : value,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="بدون وجهة محددة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DESTINATION}>
                    بدون وجهة محددة
                  </SelectItem>
                  {destinationOptions.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                      {option.isActive ? "" : " (معطّلة)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="sm:col-span-2">
              {validationError && form.name.length > 0 ? (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {validationError}
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={closeDialog}
              disabled={mutationPending}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                mutationPending ||
                Boolean(validationError) ||
                !form.name.trim() ||
                !form.code.trim()
              }
            >
              {mutationPending
                ? "جارٍ الحفظ..."
                : editingOrganization
                  ? "حفظ التعديلات"
                  : "إضافة الجهة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {logoOrganization ? (
        <OrganizationLogoDialog
          organization={logoOrganization}
          onClose={() => setLogoOrganization(null)}
        />
      ) : null}
    </div>
  );
}
