import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Bell,
  Contact,
  FileClock,
  FilePlus2,
  FileText,
  LayoutDashboard,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ownerTrpc as trpc } from "@/lib/ownerTrpc";
import { trpc as appTrpc } from "@/lib/trpc";
import { useAuth } from "@/features/auth-session/useAuth";
import { hasUserManagementMenuAccess } from "@/features/admin/menuAccess";

type WorkspaceSection = "dashboard" | "contacts" | "notifications" | "users";

type UserForm = {
  name: string;
  username: string;
  email: string;
  password: string;
  role: "user" | "admin";
};

type ContactForm = {
  name: string;
  email: string;
  phone: string;
  organization: string;
};

const emptyUser: UserForm = {
  name: "",
  username: "",
  email: "",
  password: "",
  role: "user",
};

const emptyContact: ContactForm = {
  name: "",
  email: "",
  phone: "",
  organization: "",
};

function formatDashboardDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    numberingSystem: "latn",
    timeZone: "UTC",
  })
    .format(date)
    .replaceAll("-", "/");
}

const sectionTitles: Record<WorkspaceSection, string> = {
  dashboard: "لوحة التحكم",
  contacts: "جهات الاتصال",
  notifications: "الإشعارات",
  users: "إدارة المستخدمين",
};

export default function WorkspacePage({
  section,
}: {
  section: WorkspaceSection;
}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const organizationContext = appTrpc.organizations.context.useQuery(
    undefined,
    { enabled: Boolean(user), staleTime: 30_000 }
  );
  const canOpenAdvancedManagement = hasUserManagementMenuAccess({
    accountRole: user?.role,
    organizationRole: organizationContext.data?.role,
    isPlatformOwner:
      user?.isPlatformOwner === true ||
      organizationContext.data?.isOwner === true,
  });
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyContact);
  const [userForm, setUserForm] = useState<UserForm>(emptyUser);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const documentsQuery = trpc.documentStudio.listDocuments.useQuery(undefined, {
    enabled: section === "dashboard",
  });
  const templatesQuery = trpc.documentStudio.listTemplates.useQuery(undefined, {
    enabled: section === "dashboard",
  });
  const contactsQuery = trpc.workspace.contacts.list.useQuery(undefined, {
    enabled: section === "contacts",
  });
  const notificationsQuery = trpc.workspace.notifications.list.useQuery(
    undefined,
    {
      enabled: section === "notifications",
    }
  );
  const administrationQuery = trpc.workspace.administration.overview.useQuery(
    undefined,
    {
      enabled:
        section === "users" ||
        (section === "dashboard" && canOpenAdvancedManagement),
    }
  );
  const utils = trpc.useUtils();
  const markNotificationRead =
    trpc.workspace.notifications.markRead.useMutation({
      onSuccess: async () => {
        await utils.workspace.notifications.list.invalidate();
      },
      onError: error => toast.error(error.message),
    });
  const markAllNotificationsRead =
    trpc.workspace.notifications.markAllRead.useMutation({
      onSuccess: async result => {
        await utils.workspace.notifications.list.invalidate();
        toast.success(`تم تعليم ${result.updated} تنبيهاً كمقروء`);
      },
      onError: error => toast.error(error.message),
    });
  const createContact = trpc.workspace.contacts.create.useMutation({
    onSuccess: async () => {
      await utils.workspace.contacts.list.invalidate();
      setForm(emptyContact);
      setEditingId(null);
      setContactDialogOpen(false);
      toast.success("تمت إضافة جهة الاتصال");
    },
    onError: error => toast.error(error.message),
  });
  const updateContact = trpc.workspace.contacts.update.useMutation({
    onSuccess: async () => {
      await utils.workspace.contacts.list.invalidate();
      setForm(emptyContact);
      setEditingId(null);
      setContactDialogOpen(false);
      toast.success("تم تحديث جهة الاتصال");
    },
    onError: error => toast.error(error.message),
  });
  const deleteContact = trpc.workspace.contacts.delete.useMutation({
    onSuccess: async () => {
      await utils.workspace.contacts.list.invalidate();
      toast.success("تم حذف جهة الاتصال");
    },
    onError: error => toast.error(error.message),
  });
  const createUser = trpc.workspace.administration.createUser.useMutation({
    onSuccess: async () => {
      await utils.workspace.administration.overview.invalidate();
      setUserForm(emptyUser);
      setUserDialogOpen(false);
      toast.success("تم إنشاء حساب المستخدم");
    },
    onError: error => toast.error(error.message),
  });
  const setUserActive = trpc.workspace.administration.setUserActive.useMutation(
    {
      onSuccess: async () => {
        await utils.workspace.administration.overview.invalidate();
        toast.success("تم تحديث حالة المستخدم");
      },
      onError: error => toast.error(error.message),
    }
  );
  const setUserRole = trpc.workspace.administration.setUserRole.useMutation({
    onSuccess: async () => {
      await utils.workspace.administration.overview.invalidate();
      toast.success("تم تحديث صلاحية المستخدم");
    },
    onError: error => toast.error(error.message),
  });
  const contacts = useMemo(() => {
    const rows = contactsQuery.data ?? [];
    const term = search.trim().toLocaleLowerCase("ar");
    if (!term) return rows;
    return rows.filter(item =>
      [item.name, item.email, item.phone, item.organization]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase("ar").includes(term))
    );
  }, [contactsQuery.data, search]);

  const users = useMemo(() => {
    const rows = administrationQuery.data?.users ?? [];
    const term = search.trim().toLocaleLowerCase("ar");
    if (!term) return rows;
    return rows.filter(item =>
      [item.name, item.username, item.email, item.role]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase("ar").includes(term))
    );
  }, [administrationQuery.data?.users, search]);

  const isLoading =
    section === "dashboard"
      ? documentsQuery.isLoading
      : section === "contacts"
        ? contactsQuery.isLoading
        : section === "notifications"
          ? notificationsQuery.isLoading
          : administrationQuery.isLoading;
  const isError =
    section === "dashboard"
      ? documentsQuery.isError
      : section === "contacts"
        ? contactsQuery.isError
        : section === "notifications"
          ? notificationsQuery.isError
          : administrationQuery.isError;
  const errorMessage =
    section === "dashboard"
      ? documentsQuery.error?.message
      : section === "contacts"
        ? contactsQuery.error?.message
        : section === "notifications"
          ? notificationsQuery.error?.message
          : administrationQuery.error?.message;

  const refresh = () => {
    if (section === "dashboard") {
      void documentsQuery.refetch();
      void templatesQuery.refetch();
      if (canOpenAdvancedManagement) void administrationQuery.refetch();
    } else if (section === "contacts") void contactsQuery.refetch();
    else if (section === "notifications") void notificationsQuery.refetch();
    else void administrationQuery.refetch();
  };

  const startEdit = (item: NonNullable<typeof contactsQuery.data>[number]) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      email: item.email ?? "",
      phone: item.phone ?? "",
      organization: item.organization ?? "",
    });
    setContactDialogOpen(true);
  };

  const saveContact = () => {
    if (!form.name.trim()) {
      toast.error("أدخل اسم جهة الاتصال");
      return;
    }
    const values = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      organization: form.organization.trim(),
    };
    if (editingId) updateContact.mutate({ id: editingId, ...values });
    else createContact.mutate(values);
  };

  const mutationPending =
    createContact.isPending ||
    updateContact.isPending ||
    deleteContact.isPending ||
    createUser.isPending ||
    setUserActive.isPending ||
    setUserRole.isPending;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {section === "dashboard" ? (
              <LayoutDashboard className="h-6 w-6" />
            ) : section === "contacts" ? (
              <Contact className="h-6 w-6" />
            ) : section === "notifications" ? (
              <Bell className="h-6 w-6" />
            ) : section === "users" ? (
              <Users className="h-6 w-6" />
            ) : (
              <Users className="h-6 w-6" />
            )}
          </span>
          <div>
            <h1 className="text-2xl font-bold">{sectionTitles[section]}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {section === "dashboard"
                ? "مؤشرات الوثائق وآخر الوثائق المحفوظة"
                : section === "contacts"
                  ? "إدارة دليل الجهات والأشخاص المرتبطين بالوثائق المطبوعة"
                  : section === "notifications"
                    ? "عرض التنبيهات المرتبطة بحسابك وإدارة حالة قراءتها"
                    : section === "users"
                      ? "إدارة حسابات المستخدمين وصلاحياتهم"
                      : "إدارة حسابات المستخدمين وصلاحياتهم"}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
          {canOpenAdvancedManagement && section === "users" ? (
            <Button
              variant="outline"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("open-owner-user-management")
                )
              }
            >
              <ShieldCheck className="ml-2 h-4 w-4" />
              إدارة الصلاحيات المتقدمة
            </Button>
          ) : null}
          <Button variant="outline" onClick={refresh} disabled={isLoading}>
            <RefreshCw className="ml-2 h-4 w-4" />
            تحديث البيانات
          </Button>
        </div>
      </header>

      {section === "users" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard
            label="المستخدمون"
            value={administrationQuery.data?.totals.users}
            icon={<Users className="h-4 w-4" />}
          />
          <SummaryCard
            label="المستخدمون النشطون"
            value={administrationQuery.data?.totals.activeUsers}
            icon={<ShieldCheck className="h-4 w-4" />}
          />
        </div>
      ) : null}

      {section === "dashboard" ? (
        <div className="space-y-6">
          <section className="relative isolate overflow-hidden rounded-[1.75rem] border border-slate-700/70 bg-[#10262d] px-5 py-6 text-white shadow-xl shadow-slate-950/10 sm:px-7 sm:py-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-16 -top-24 -z-10 h-64 w-64 rounded-full bg-[#c49a5b]/20 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-28 right-1/3 -z-10 h-64 w-64 rounded-full bg-[#0f766e]/25 blur-3xl"
            />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#c49a5b]/35 bg-[#c49a5b]/10 px-3 py-1 text-xs font-semibold text-[#e2bd86]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  أرشيف موثوق — قرار أوضح
                </div>
                <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                  أهلاً بك في وثائقي
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                  أنشئ وثائقك الرسمية، نظّم أرشيفك، واطبع مستنداتك بهوية موحّدة
                  من مساحة عمل واحدة.
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:min-w-44">
                <Button
                  type="button"
                  className="min-h-12 rounded-xl bg-[#c49a5b] px-5 font-bold text-[#10262d] shadow-lg shadow-black/20 hover:bg-[#d2aa70]"
                  onClick={() => setLocation("/documents?create=1")}
                >
                  <Plus className="ml-2 h-4 w-4" />
                  إنشاء وثيقة جديدة
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => setLocation("/documents")}
                >
                  <FileText className="ml-2 h-4 w-4" />
                  استعراض الأرشيف
                </Button>
              </div>
            </div>
          </section>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <SummaryCard
              label="إجمالي الوثائق"
              value={documentsQuery.data?.length}
              icon={<FileClock className="h-4 w-4" />}
              tone="blue"
            />
            <SummaryCard
              label="مسودات"
              value={
                documentsQuery.data?.filter(item => item.status === "draft")
                  .length
              }
              icon={<Pencil className="h-4 w-4" />}
              tone="amber"
            />
            <SummaryCard
              label="وثائق صادرة"
              value={
                documentsQuery.data?.filter(item => item.status === "issued")
                  .length
              }
              icon={<ShieldCheck className="h-4 w-4" />}
              tone="emerald"
            />
            <SummaryCard
              label="وثائق مؤرشفة"
              value={
                documentsQuery.data?.filter(item => item.status === "archived")
                  .length
              }
              icon={<FileClock className="h-4 w-4" />}
              tone="indigo"
            />
            <SummaryCard
              label="القوالب والنماذج"
              value={templatesQuery.data?.filter(item => item.isActive).length}
              icon={<FileText className="h-4 w-4" />}
              tone="violet"
            />
            {canOpenAdvancedManagement ? (
              <SummaryCard
                label="المستخدمون"
                value={administrationQuery.data?.totals.users}
                icon={<Users className="h-4 w-4" />}
                tone="cyan"
              />
            ) : null}
          </div>
          <Card className="space-y-4 rounded-[1.5rem] border-border/70 p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight">
                  أحدث الوثائق
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  آخر ما أُضيف إلى مكتبتك الرسمية
                </p>
              </div>
              <Badge variant="secondary">
                {documentsQuery.data?.length ?? 0}
              </Badge>
            </div>
            {isLoading ? (
              <Loading />
            ) : isError ? (
              <ErrorMessage message={errorMessage} onRetry={refresh} />
            ) : (documentsQuery.data ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 p-8 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <FilePlus2 className="h-6 w-6" />
                </span>
                <p className="mt-3 font-semibold">مساحة الوثائق جاهزة للبدء</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  أنشئ أول وثيقة رسمية أو ابدأ من قالب معتمد.
                </p>
                <Button
                  type="button"
                  className="mt-4 rounded-xl"
                  onClick={() => setLocation("/documents?create=1")}
                >
                  إنشاء الوثيقة الأولى
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70">
                {(documentsQuery.data ?? []).slice(0, 8).map(item => {
                  const documentId = encodeURIComponent(item.id);
                  const documentUrl = `/documents?document=${documentId}`;
                  const printUrl = `${documentUrl}&print=1`;
                  const documentDate = item.documentDate || item.updatedAt;

                  return (
                    <article
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 transition-colors hover:bg-muted/30"
                    >
                      <button
                        type="button"
                        onClick={() => setLocation(documentUrl)}
                        aria-label={`معاينة الوثيقة ${item.title}`}
                        className="flex min-w-0 flex-1 items-center gap-3 text-right"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <FileText className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {item.title}
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {item.subject || item.category}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            رقم الوثيقة:{" "}
                            <bdi
                              dir="ltr"
                              className="tabular-nums font-semibold"
                            >
                              {item.serialCode || "غير مرقمة"}
                            </bdi>
                          </span>
                        </span>
                      </button>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            item.status === "issued" ? "default" : "secondary"
                          }
                          className={
                            item.status === "issued"
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : item.status === "archived"
                                ? "border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                                : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          }
                        >
                          {item.status === "issued"
                            ? "صادرة"
                            : item.status === "archived"
                              ? "مؤرشفة"
                              : "مسودة"}
                        </Badge>
                        <time
                          className="text-xs font-medium tabular-nums text-muted-foreground"
                          dir="ltr"
                        >
                          {formatDashboardDate(documentDate)}
                        </time>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setLocation(documentUrl)}
                        >
                          معاينة
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setLocation(printUrl)}
                        >
                          <Printer className="ml-2 h-4 w-4" />
                          طباعة
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      ) : section === "contacts" ? (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">دليل جهات الاتصال</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                قائمة محلية للاختيار عند إعداد الوثيقة وطباعتها
              </p>
            </div>
            <Button
              className="min-h-11"
              onClick={() => {
                setEditingId(null);
                setForm(emptyContact);
                setContactDialogOpen(true);
              }}
            >
              <Plus className="ml-2 h-4 w-4" />
              جهة اتصال جديدة
            </Button>
          </div>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="ابحث بالاسم أو الجهة أو الهاتف..."
          />
          {isLoading ? (
            <Loading />
          ) : isError ? (
            <ErrorMessage message={errorMessage} onRetry={refresh} />
          ) : contacts.length === 0 ? (
            <EmptyState text="لا توجد جهات اتصال مطابقة." />
          ) : (
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {contacts.map(item => (
                <article
                  key={item.id}
                  className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{item.name}</h3>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {item.organization || "جهة اتصال"}
                      </p>
                    </div>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary">
                      <Contact className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    {item.phone ? (
                      <p className="truncate text-muted-foreground" dir="ltr">
                        {item.phone}
                      </p>
                    ) : null}
                    {item.email ? (
                      <p className="truncate text-muted-foreground" dir="ltr">
                        {item.email}
                      </p>
                    ) : null}
                    {!item.phone && !item.email ? (
                      <p className="text-xs text-muted-foreground">
                        لا توجد بيانات اتصال إضافية
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-10 flex-1"
                      onClick={() => startEdit(item)}
                    >
                      <Pencil className="ml-2 h-4 w-4" />
                      تعديل
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-10 text-destructive hover:text-destructive"
                      disabled={mutationPending}
                      onClick={() => {
                        if (window.confirm("هل تريد حذف جهة الاتصال؟")) {
                          deleteContact.mutate({ id: item.id });
                        }
                      }}
                      aria-label={`حذف ${item.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      ) : section === "notifications" ? (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">صندوق الإشعارات</h2>
            <Button
              variant="outline"
              disabled={
                markAllNotificationsRead.isPending ||
                !(notificationsQuery.data ?? []).some(item => !item.readAt)
              }
              onClick={() => markAllNotificationsRead.mutate()}
            >
              تعليم الكل كمقروء
            </Button>
          </div>
          {isLoading ? (
            <Loading />
          ) : isError ? (
            <ErrorMessage message={errorMessage} onRetry={refresh} />
          ) : (notificationsQuery.data ?? []).length === 0 ? (
            <EmptyState text="لا توجد إشعارات جديدة." />
          ) : (
            <div className="space-y-2">
              {(notificationsQuery.data ?? []).map(item => (
                <div
                  key={item.id}
                  className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3 ${item.readAt ? "opacity-70" : "border-primary/40 bg-primary/5"}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{item.title}</p>
                      {!item.readAt ? <Badge>جديد</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.body}
                    </p>
                    <time
                      className="mt-2 block text-xs text-muted-foreground"
                      dir="ltr"
                    >
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleString("ar")
                        : "—"}
                    </time>
                  </div>
                  {!item.readAt ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={markNotificationRead.isPending}
                      onClick={() =>
                        markNotificationRead.mutate({ id: item.id })
                      }
                    >
                      تعليم كمقروء
                    </Button>
                  ) : (
                    <Badge variant="secondary">مقروء</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : section === "users" ? (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">حسابات المستخدمين</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                إدارة الحالة والدور من بطاقة كل مستخدم
              </p>
            </div>
            <Button
              className="min-h-11"
              onClick={() => {
                setUserForm(emptyUser);
                setUserDialogOpen(true);
              }}
            >
              <Plus className="ml-2 h-4 w-4" />
              مستخدم جديد
            </Button>
          </div>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="ابحث باسم المستخدم أو البريد..."
          />
          {isLoading ? (
            <Loading />
          ) : isError ? (
            <ErrorMessage message={errorMessage} onRetry={refresh} />
          ) : users.length === 0 ? (
            <EmptyState text="لا توجد حسابات مستخدمين." />
          ) : (
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {users.map(item => (
                <article
                  key={item.id}
                  className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{item.name}</h3>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        @{item.username || "—"}
                      </p>
                    </div>
                    <Badge
                      variant={item.isActive ? "default" : "secondary"}
                      className={
                        item.isActive
                          ? "border-emerald-500/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "border-border bg-muted text-muted-foreground"
                      }
                    >
                      {item.isActive ? "نشط" : "موقوف"}
                    </Badge>
                  </div>
                  {item.isPlatformOwner ? (
                    <Badge className="mt-3">مالك المنصة — حساب محمي</Badge>
                  ) : null}
                  <div className="mt-4 space-y-2 text-sm">
                    <p className="truncate text-muted-foreground" dir="ltr">
                      {item.email || "لا يوجد بريد إلكتروني"}
                    </p>
                    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                      صلاحية الحساب
                      <select
                        className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                        value={item.role === "admin" ? "admin" : "user"}
                        disabled={mutationPending || item.isPlatformOwner}
                        onChange={event => {
                          setUserRole.mutate({
                            id: Number(item.id),
                            role: event.target.value as "user" | "admin",
                          });
                        }}
                      >
                        <option value="user">مستخدم</option>
                        <option value="admin">مدير جهة</option>
                      </select>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      آخر دخول:{" "}
                      {item.lastSignedIn
                        ? new Date(item.lastSignedIn).toLocaleString("ar")
                        : "لم يسجل الدخول بعد"}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">
                      {item.isPlatformOwner ? "صلاحيات محمية" : "إدارة الحساب"}
                    </span>
                    {!item.isPlatformOwner ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-10"
                        disabled={mutationPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              item.isActive
                                ? "إيقاف حساب هذا المستخدم؟"
                                : "إعادة تفعيل حساب هذا المستخدم؟"
                            )
                          ) {
                            setUserActive.mutate({
                              id: Number(item.id),
                              isActive: !item.isActive,
                            });
                          }
                        }}
                      >
                        {item.isActive ? "إيقاف الحساب" : "تفعيل الحساب"}
                      </Button>
                    ) : (
                      <ShieldCheck className="h-5 w-5 text-emerald-600" />
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            لا تعرض هذه الصفحة كلمات المرور أو مفاتيح الجلسات.
          </p>
        </Card>
      ) : null}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent
          className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-xl overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle>
              {editingId ? "تعديل جهة الاتصال" : "إضافة جهة اتصال"}
            </DialogTitle>
            <DialogDescription>
              احفظ بيانات الجهة لاستخدامها عند تحرير الوثائق وطباعتها.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="الاسم"
              value={form.name}
              onChange={value =>
                setForm(current => ({ ...current, name: value }))
              }
            />
            <Field
              label="الجهة"
              value={form.organization}
              onChange={value =>
                setForm(current => ({ ...current, organization: value }))
              }
            />
            <Field
              label="الهاتف"
              value={form.phone}
              onChange={value =>
                setForm(current => ({ ...current, phone: value }))
              }
            />
            <Field
              label="البريد الإلكتروني"
              value={form.email}
              onChange={value =>
                setForm(current => ({ ...current, email: value }))
              }
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              onClick={saveContact}
              disabled={mutationPending || !form.name.trim()}
              className="min-h-11"
            >
              <Save className="ml-2 h-4 w-4" />
              {editingId ? "حفظ التعديلات" : "إضافة جهة الاتصال"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setContactDialogOpen(false)}
              className="min-h-11"
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent
          className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-xl overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle>إنشاء مستخدم جديد</DialogTitle>
            <DialogDescription>
              ينشأ الحساب في Appwrite Auth ويرتبط بالجهة الوحيدة في النظام.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="الاسم الكامل"
              value={userForm.name}
              onChange={value =>
                setUserForm(current => ({ ...current, name: value }))
              }
            />
            <Field
              label="اسم المستخدم"
              value={userForm.username}
              onChange={value =>
                setUserForm(current => ({ ...current, username: value }))
              }
            />
            <Field
              label="البريد الإلكتروني"
              value={userForm.email}
              onChange={value =>
                setUserForm(current => ({ ...current, email: value }))
              }
            />
            <Field
              label="كلمة مرور مؤقتة (12 محرفاً على الأقل)"
              type="password"
              value={userForm.password}
              onChange={value =>
                setUserForm(current => ({ ...current, password: value }))
              }
            />
            <label className="grid gap-1.5 text-sm font-medium">
              الصلاحية
              <select
                className="h-11 rounded-lg border bg-background px-3"
                value={userForm.role}
                onChange={event =>
                  setUserForm(current => ({
                    ...current,
                    role: event.target.value as UserForm["role"],
                  }))
                }
              >
                <option value="user">مستخدم</option>
                <option value="admin">مدير جهة</option>
              </select>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            لن يتم إنشاء مالك منصة جديد. سيُطلب من المستخدم تغيير كلمة المرور
            المؤقتة عند أول دخول.
          </p>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              onClick={() =>
                createUser.mutate({
                  ...userForm,
                  organizationId:
                    organizationContext.data?.organizationId ?? "",
                })
              }
              disabled={
                mutationPending ||
                !userForm.name.trim() ||
                !userForm.username.trim() ||
                !userForm.email.trim() ||
                userForm.password.length < 12 ||
                !organizationContext.data?.organizationId
              }
              className="min-h-11"
            >
              <Plus className="ml-2 h-4 w-4" />
              إنشاء الحساب
            </Button>
            <Button
              variant="outline"
              onClick={() => setUserDialogOpen(false)}
              disabled={createUser.isPending}
              className="min-h-11"
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone = "blue",
}: {
  label: string;
  value?: number;
  icon: React.ReactNode;
  tone?: "blue" | "emerald" | "amber" | "indigo" | "violet" | "cyan";
}) {
  const toneClasses = {
    blue: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    indigo: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
    violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    cyan: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  } satisfies Record<NonNullable<typeof tone>, string>;
  return (
    <Card
      data-tone={tone}
      className="workspace-summary-card group relative min-w-0 overflow-hidden rounded-2xl border-border/70 bg-card p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-4"
    >
      <span
        className={`workspace-summary-icon absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl ${toneClasses[tone]}`}
      >
        {icon}
      </span>
      <div className="min-w-0 pt-11">
        <p className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
          {value?.toLocaleString("ar", { numberingSystem: "latn" }) ?? "—"}
        </p>
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password" | "email" | "tel";
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <Input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="min-h-11"
      />
    </label>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pr-9"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function Loading() {
  return (
    <div
      className="rounded-xl border p-8 text-center text-sm text-muted-foreground"
      role="status"
    >
      جارٍ تحميل البيانات...
    </div>
  );
}

function ErrorMessage({
  message,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="space-y-3 rounded-xl border border-destructive/30 p-6 text-center"
      role="alert"
    >
      <p className="font-semibold">تعذر تحميل البيانات</p>
      <p className="text-sm text-muted-foreground">
        {message || "حدث خطأ غير متوقع"}
      </p>
      <Button variant="outline" onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
