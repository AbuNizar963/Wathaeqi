import { useMemo, useState } from "react";
import {
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
        section === "dashboard" ||
        section === "users",
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
      ? documentsQuery.isLoading ||
        templatesQuery.isLoading ||
        administrationQuery.isLoading
      : section === "contacts"
        ? contactsQuery.isLoading
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
        : section === "notifications"
          ? notificationsQuery.error?.message
          : administrationQuery.error?.message;

  const refresh = () => {
    if (section === "dashboard") {
      void documentsQuery.refetch();
      void templatesQuery.refetch();
      void administrationQuery.refetch();
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
    setUserActive.isPending;

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
                ? "ملخص الوثائق والنماذج وحالة المنصة"
                : section === "contacts"
                  ? "إدارة دليل الجهات والأشخاص المرتبطين بمراسلاتك ووثائقك"
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
              label="المستخدمون"
              value={administrationQuery.data?.totals.users}
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
              onClick={() =>
                createUser.mutate({
                  ...userForm,
                  organizationId: organizationContext.data?.organizationId ?? "",
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
      ) : null}
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
