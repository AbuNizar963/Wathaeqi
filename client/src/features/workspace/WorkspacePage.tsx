import { useMemo, useState } from "react";
import {
  Building2,
  Bell,
  Contact,
  FileClock,
  LayoutDashboard,
  Pencil,
  Plus,
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
import { ownerTrpc as trpc } from "@/lib/ownerTrpc";

type WorkspaceSection =
  | "dashboard"
  | "contacts"
  | "activity"
  | "notifications"
  | "users"
  | "organizations";

type OrganizationForm = {
  name: string;
  code: string;
  type: string;
  parentOrganizationId: string;
};

type UserForm = {
  name: string;
  username: string;
  email: string;
  password: string;
  organizationId: string;
  role: "user" | "admin";
};

type ContactForm = {
  name: string;
  email: string;
  phone: string;
  organization: string;
};

const emptyOrganization: OrganizationForm = {
  name: "",
  code: "",
  type: "department",
  parentOrganizationId: "",
};

const emptyUser: UserForm = {
  name: "",
  username: "",
  email: "",
  password: "",
  organizationId: "",
  role: "user",
};

const emptyContact: ContactForm = {
  name: "",
  email: "",
  phone: "",
  organization: "",
};

const sectionTitles: Record<WorkspaceSection, string> = {
  dashboard: "لوحة التحكم",
  contacts: "جهات الاتصال",
  activity: "سجل النشاط",
  notifications: "الإشعارات",
  users: "إدارة المستخدمين",
  organizations: "إدارة الجهات",
};

export default function WorkspacePage({
  section,
}: {
  section: WorkspaceSection;
}) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyContact);
  const [userForm, setUserForm] = useState<UserForm>(emptyUser);
  const [organizationForm, setOrganizationForm] =
    useState<OrganizationForm>(emptyOrganization);
  const [editingOrganizationId, setEditingOrganizationId] = useState<
    string | null
  >(null);
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
  const activityQuery = trpc.workspace.activity.list.useQuery(undefined, {
    enabled: section === "activity",
  });
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
  const administrationQuery = trpc.workspace.administration.overview.useQuery(
    undefined,
    {
      enabled:
        section === "dashboard" ||
        section === "users" ||
        section === "organizations",
    }
  );
  const utils = trpc.useUtils();

  const createContact = trpc.workspace.contacts.create.useMutation({
    onSuccess: async () => {
      await utils.workspace.contacts.list.invalidate();
      setForm(emptyContact);
      setEditingId(null);
      toast.success("تمت إضافة جهة الاتصال");
    },
    onError: error => toast.error(error.message),
  });
  const updateContact = trpc.workspace.contacts.update.useMutation({
    onSuccess: async () => {
      await utils.workspace.contacts.list.invalidate();
      setForm(emptyContact);
      setEditingId(null);
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
  const createOrganization =
    trpc.workspace.administration.createOrganization.useMutation({
      onSuccess: async () => {
        await utils.workspace.administration.overview.invalidate();
        setOrganizationForm(emptyOrganization);
        toast.success("تم إنشاء الجهة");
      },
      onError: error => toast.error(error.message),
    });
  const updateOrganization =
    trpc.workspace.administration.updateOrganization.useMutation({
      onSuccess: async () => {
        await utils.workspace.administration.overview.invalidate();
        setEditingOrganizationId(null);
        setOrganizationForm(emptyOrganization);
        toast.success("تم تحديث الجهة");
      },
      onError: error => toast.error(error.message),
    });
  const setOrganizationActive =
    trpc.workspace.administration.setOrganizationActive.useMutation({
      onSuccess: async () => {
        await utils.workspace.administration.overview.invalidate();
        toast.success("تم تحديث حالة الجهة");
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

  const activities = useMemo(() => {
    const rows = activityQuery.data ?? [];
    const term = search.trim().toLocaleLowerCase("ar");
    if (!term) return rows;
    return rows.filter(item =>
      [item.actorName, item.action, item.entityType, item.entityId]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase("ar").includes(term))
    );
  }, [activityQuery.data, search]);

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

  const organizations = useMemo(() => {
    const rows = administrationQuery.data?.organizations ?? [];
    const term = search.trim().toLocaleLowerCase("ar");
    if (!term) return rows;
    return rows.filter(item =>
      [item.name, item.code, item.type]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase("ar").includes(term))
    );
  }, [administrationQuery.data?.organizations, search]);

  const isLoading =
    section === "dashboard"
      ? documentsQuery.isLoading ||
        templatesQuery.isLoading ||
        administrationQuery.isLoading
      : section === "contacts"
        ? contactsQuery.isLoading
        : section === "activity"
          ? activityQuery.isLoading
          : section === "notifications"
            ? notificationsQuery.isLoading
            : administrationQuery.isLoading;
  const isError =
    section === "dashboard"
      ? documentsQuery.isError ||
        templatesQuery.isError ||
        administrationQuery.isError
      : section === "contacts"
        ? contactsQuery.isError
        : section === "activity"
          ? activityQuery.isError
          : section === "notifications"
            ? notificationsQuery.isError
            : administrationQuery.isError;
  const errorMessage =
    section === "dashboard"
      ? (documentsQuery.error?.message ??
        templatesQuery.error?.message ??
        administrationQuery.error?.message)
      : section === "contacts"
        ? contactsQuery.error?.message
        : section === "activity"
          ? activityQuery.error?.message
          : section === "notifications"
            ? notificationsQuery.error?.message
            : administrationQuery.error?.message;

  const refresh = () => {
    if (section === "dashboard") {
      void documentsQuery.refetch();
      void templatesQuery.refetch();
      void administrationQuery.refetch();
    } else if (section === "contacts") void contactsQuery.refetch();
    else if (section === "activity") void activityQuery.refetch();
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
    deleteContact.isPending;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {section === "dashboard" ? (
              <LayoutDashboard className="h-6 w-6" />
            ) : section === "contacts" ? (
              <Contact className="h-6 w-6" />
            ) : section === "activity" ? (
              <FileClock className="h-6 w-6" />
            ) : section === "notifications" ? (
              <Bell className="h-6 w-6" />
            ) : section === "notifications" ? (
              <Card className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-semibold">صندوق الإشعارات</h2>
                  <Button
                    variant="outline"
                    disabled={
                      markAllNotificationsRead.isPending ||
                      !(notificationsQuery.data ?? []).some(
                        item => !item.readAt
                      )
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
              <Users className="h-6 w-6" />
            ) : (
              <Building2 className="h-6 w-6" />
            )}
          </span>
          <div>
            <h1 className="text-2xl font-bold">{sectionTitles[section]}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {section === "dashboard"
                ? "ملخص الوثائق والنماذج وحالة المنصة"
                : section === "contacts"
                  ? "إدارة دليل الجهات والأشخاص المرتبطين بمراسلاتك ووثائقك"
                  : section === "activity"
                    ? "مراجعة سجل العمليات المسجلة على المنصة"
                    : section === "notifications"
                      ? "عرض التنبيهات المرتبطة بحسابك وإدارة حالة قراءتها"
                      : section === "users"
                        ? "إدارة حسابات المستخدمين وصلاحياتهم"
                        : "إدارة الجهات وعلاقاتها التنظيمية"}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={refresh} disabled={isLoading}>
          <RefreshCw className="ml-2 h-4 w-4" />
          تحديث البيانات
        </Button>
      </header>

      {section === "users" || section === "organizations" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <SummaryCard
            label="الجهات"
            value={administrationQuery.data?.totals.organizations}
            icon={<Building2 className="h-4 w-4" />}
          />
          <SummaryCard
            label="الجهات النشطة"
            value={administrationQuery.data?.totals.activeOrganizations}
            icon={<Building2 className="h-4 w-4" />}
          />
        </div>
      ) : null}

      {section === "dashboard" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard
              label="إجمالي الوثائق"
              value={documentsQuery.data?.length}
              icon={<FileClock className="h-4 w-4" />}
            />
            <SummaryCard
              label="مسودات"
              value={
                documentsQuery.data?.filter(item => item.status === "draft")
                  .length
              }
              icon={<Pencil className="h-4 w-4" />}
            />
            <SummaryCard
              label="وثائق صادرة"
              value={
                documentsQuery.data?.filter(item => item.status === "issued")
                  .length
              }
              icon={<ShieldCheck className="h-4 w-4" />}
            />
            <SummaryCard
              label="وثائق مؤرشفة"
              value={
                documentsQuery.data?.filter(item => item.status === "archived")
                  .length
              }
              icon={<FileClock className="h-4 w-4" />}
            />
            <SummaryCard
              label="النماذج النشطة"
              value={templatesQuery.data?.length}
              icon={<Contact className="h-4 w-4" />}
            />
            <SummaryCard
              label="المستخدمون والجهات"
              value={
                (administrationQuery.data?.totals.users ?? 0) +
                (administrationQuery.data?.totals.organizations ?? 0)
              }
              icon={<Users className="h-4 w-4" />}
            />
          </div>
          <Card className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">أحدث الوثائق</h2>
              <Badge variant="secondary">
                {documentsQuery.data?.length ?? 0}
              </Badge>
            </div>
            {isLoading ? (
              <Loading />
            ) : isError ? (
              <ErrorMessage message={errorMessage} onRetry={refresh} />
            ) : (documentsQuery.data ?? []).length === 0 ? (
              <EmptyState text="لم تُنشأ وثائق بعد. ابدأ بإنشاء وثيقتك الأولى." />
            ) : (
              <div className="divide-y rounded-xl border">
                {(documentsQuery.data ?? []).slice(0, 8).map(item => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.subject || item.category}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          item.status === "issued" ? "default" : "secondary"
                        }
                      >
                        {item.status === "issued"
                          ? "صادرة"
                          : item.status === "archived"
                            ? "مؤرشفة"
                            : "مسودة"}
                      </Badge>
                      <time className="text-xs text-muted-foreground" dir="ltr">
                        {new Date(item.updatedAt).toLocaleDateString("ar")}
                      </time>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : section === "contacts" ? (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">دليل جهات الاتصال</h2>
            <Button
              onClick={() => {
                setEditingId(null);
                setForm(emptyContact);
              }}
              variant="outline"
            >
              <Plus className="ml-2 h-4 w-4" />
              جهة اتصال جديدة
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="الاسم"
              value={form.name}
              onChange={value =>
                setForm(current => ({ ...current, name: value }))
              }
            />
            <Field
              label="البريد الإلكتروني"
              value={form.email}
              onChange={value =>
                setForm(current => ({ ...current, email: value }))
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
              label="الجهة"
              value={form.organization}
              onChange={value =>
                setForm(current => ({ ...current, organization: value }))
              }
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={saveContact}
              disabled={mutationPending || !form.name.trim()}
            >
              <Save className="ml-2 h-4 w-4" />
              {editingId ? "حفظ التعديلات" : "إضافة جهة الاتصال"}
            </Button>
            {editingId || Object.values(form).some(Boolean) ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyContact);
                }}
              >
                <X className="ml-2 h-4 w-4" />
                إلغاء
              </Button>
            ) : null}
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
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-muted/60 text-right">
                  <tr>
                    <th className="p-3">الاسم</th>
                    <th className="p-3">الجهة</th>
                    <th className="p-3">الهاتف</th>
                    <th className="p-3">البريد</th>
                    <th className="p-3">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(item => (
                    <tr key={item.id} className="border-t">
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className="p-3">{item.organization || "—"}</td>
                      <td className="p-3" dir="ltr">
                        {item.phone || "—"}
                      </td>
                      <td className="p-3" dir="ltr">
                        {item.email || "—"}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(item)}
                            aria-label="تعديل"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={mutationPending}
                            onClick={() => {
                              if (window.confirm("هل تريد حذف جهة الاتصال؟"))
                                deleteContact.mutate({ id: item.id });
                            }}
                            aria-label="حذف"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : section === "activity" ? (
        <Card className="space-y-4 p-4 sm:p-5">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="ابحث في سجل النشاط..."
          />
          {isLoading ? (
            <Loading />
          ) : isError ? (
            <ErrorMessage message={errorMessage} onRetry={refresh} />
          ) : activities.length === 0 ? (
            <EmptyState text="لا توجد عمليات مسجلة بعد." />
          ) : (
            <div className="space-y-2">
              {activities.map(item => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{item.actorName}</p>
                    <p className="mt-1 text-sm">
                      {item.action} · {item.entityType}
                      {item.entityId ? ` · ${item.entityId}` : ""}
                    </p>
                    {item.metadata ? (
                      <pre className="mt-2 max-w-full overflow-auto rounded-lg bg-muted p-2 text-xs">
                        {JSON.stringify(item.metadata, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                  <time
                    className="shrink-0 text-xs text-muted-foreground"
                    dir="ltr"
                  >
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleString("ar")
                      : "—"}
                  </time>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : section === "users" ? (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="space-y-3 rounded-xl border p-4">
            <h2 className="font-semibold">إضافة مستخدم جديد</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                value={userForm.password}
                onChange={value =>
                  setUserForm(current => ({ ...current, password: value }))
                }
              />
              <label className="grid gap-1.5 text-sm font-medium">
                الجهة
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={userForm.organizationId}
                  onChange={event =>
                    setUserForm(current => ({
                      ...current,
                      organizationId: event.target.value,
                    }))
                  }
                >
                  <option value="">اختر الجهة</option>
                  {(administrationQuery.data?.organizations ?? [])
                    .filter(item => item.isActive)
                    .map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                الصلاحية
                <select
                  className="h-10 rounded-md border bg-background px-3"
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
            <Button
              onClick={() => createUser.mutate(userForm)}
              disabled={
                mutationPending ||
                !userForm.name.trim() ||
                !userForm.username.trim() ||
                !userForm.email.trim() ||
                userForm.password.length < 12 ||
                !userForm.organizationId
              }
            >
              <Plus className="ml-2 h-4 w-4" /> إنشاء الحساب
            </Button>
            <p className="text-xs text-muted-foreground">
              سيُنشأ الحساب في Appwrite Auth ويرتبط بملف المستخدم وعضوية الجهة.
              لن يتم إنشاء مالك منصة جديد.
            </p>
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
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-muted/60 text-right">
                  <tr>
                    <th className="p-3">المستخدم</th>
                    <th className="p-3">اسم الدخول</th>
                    <th className="p-3">البريد</th>
                    <th className="p-3">الدور</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">آخر دخول</th>
                    <th className="p-3">الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(item => (
                    <tr key={item.id} className="border-t">
                      <td className="p-3 font-medium">
                        {item.name}
                        {item.isPlatformOwner ? (
                          <Badge className="mr-2">مالك المنصة</Badge>
                        ) : null}
                      </td>
                      <td className="p-3">{item.username || "—"}</td>
                      <td className="p-3" dir="ltr">
                        {item.email || "—"}
                      </td>
                      <td className="p-3">{item.role}</td>
                      <td className="p-3">
                        <Badge
                          variant={item.isActive ? "default" : "secondary"}
                        >
                          {item.isActive ? "نشط" : "موقوف"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {item.lastSignedIn
                          ? new Date(item.lastSignedIn).toLocaleString("ar")
                          : "—"}
                      </td>
                      <td className="p-3">
                        {!item.isPlatformOwner ? (
                          <Button
                            size="sm"
                            variant="outline"
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
                            {item.isActive ? "إيقاف" : "تفعيل"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            محمي
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            يعرض هذا القسم بيانات الحسابات من Appwrite دون إظهار كلمات المرور أو
            مفاتيح الجلسات.
          </p>
        </Card>
      ) : (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="space-y-3 rounded-xl border p-4">
            <h2 className="font-semibold">
              {editingOrganizationId ? "تعديل بيانات الجهة" : "إضافة جهة جديدة"}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                label="اسم الجهة"
                value={organizationForm.name}
                onChange={value =>
                  setOrganizationForm(current => ({ ...current, name: value }))
                }
              />
              <Field
                label="رمز الجهة"
                value={organizationForm.code}
                onChange={value =>
                  setOrganizationForm(current => ({
                    ...current,
                    code: value.toUpperCase(),
                  }))
                }
              />
              <label className="grid gap-1.5 text-sm font-medium">
                نوع الجهة
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={organizationForm.type}
                  onChange={event =>
                    setOrganizationForm(current => ({
                      ...current,
                      type: event.target.value,
                    }))
                  }
                >
                  <option value="department">إدارة / قسم</option>
                  <option value="organization">مؤسسة</option>
                  <option value="unit">وحدة</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                الجهة الأم
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={organizationForm.parentOrganizationId}
                  onChange={event =>
                    setOrganizationForm(current => ({
                      ...current,
                      parentOrganizationId: event.target.value,
                    }))
                  }
                >
                  <option value="">بدون جهة أم</option>
                  {(administrationQuery.data?.organizations ?? [])
                    .filter(
                      item => item.isActive && item.id !== editingOrganizationId
                    )
                    .map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  editingOrganizationId
                    ? updateOrganization.mutate({
                        id: editingOrganizationId,
                        ...organizationForm,
                      })
                    : createOrganization.mutate(organizationForm)
                }
                disabled={
                  mutationPending ||
                  !organizationForm.name.trim() ||
                  !organizationForm.code.trim()
                }
              >
                <Save className="ml-2 h-4 w-4" />{" "}
                {editingOrganizationId ? "حفظ التعديلات" : "إنشاء الجهة"}
              </Button>
              {editingOrganizationId ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingOrganizationId(null);
                    setOrganizationForm(emptyOrganization);
                  }}
                >
                  <X className="ml-2 h-4 w-4" /> إلغاء
                </Button>
              ) : null}
            </div>
          </div>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="ابحث باسم الجهة أو رمزها..."
          />
          {isLoading ? (
            <Loading />
          ) : isError ? (
            <ErrorMessage message={errorMessage} onRetry={refresh} />
          ) : organizations.length === 0 ? (
            <EmptyState text="لا توجد جهات مسجلة." />
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-muted/60 text-right">
                  <tr>
                    <th className="p-3">الجهة</th>
                    <th className="p-3">الرمز</th>
                    <th className="p-3">النوع</th>
                    <th className="p-3">الجهة الأم</th>
                    <th className="p-3">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map(item => (
                    <tr key={item.id} className="border-t">
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className="p-3" dir="ltr">
                        {item.code}
                      </td>
                      <td className="p-3">{item.type}</td>
                      <td className="p-3">
                        {organizations.find(
                          parent => parent.id === item.parentOrganizationId
                        )?.name || "—"}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={item.isActive ? "default" : "secondary"}
                        >
                          {item.isActive ? "نشطة" : "موقوفة"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingOrganizationId(item.id);
                              setOrganizationForm({
                                name: item.name,
                                code: item.code,
                                type: item.type,
                                parentOrganizationId:
                                  item.parentOrganizationId ?? "",
                              });
                            }}
                            aria-label="تعديل الجهة"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={mutationPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  item.isActive
                                    ? "إيقاف الجهة؟"
                                    : "إعادة تفعيل الجهة؟"
                                )
                              ) {
                                setOrganizationActive.mutate({
                                  id: item.id,
                                  isActive: !item.isActive,
                                });
                              }
                            }}
                          >
                            {item.isActive ? "إيقاف" : "تفعيل"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            يعرض هذا القسم شجرة الجهات المحفوظة في Appwrite. لم تُجرَ أي تغييرات
            على بيانات الجهات.
          </p>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value?: number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="rounded-xl bg-primary/10 p-2 text-primary">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold tabular-nums">{value ?? "—"}</p>
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <Input value={value} onChange={event => onChange(event.target.value)} />
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
