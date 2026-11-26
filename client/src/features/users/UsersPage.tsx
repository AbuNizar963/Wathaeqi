import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Ban,
  Pencil,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { ownerTrpc as trpc } from "@/lib/ownerTrpc";

const MEMBERSHIP_ROLES = [
  "system_admin",
  "organization_admin",
  "regional_admin",
  "reviewer",
  "dispatcher",
  "member",
] as const;

type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

const MEMBERSHIP_ROLE_LABELS: Record<MembershipRole, string> = {
  system_admin: "مدير نظام",
  organization_admin: "مدير جهة",
  regional_admin: "مدير إقليمي",
  reviewer: "مراجع",
  dispatcher: "موزّع",
  member: "عضو",
};

const ACCOUNT_ROLE_LABELS: Record<"user" | "admin", string> = {
  user: "مستخدم",
  admin: "مدير",
};

type ManagedUser = {
  id: number;
  authUserId: string;
  name: string | null;
  username: string | null;
  email: string | null;
  organizationId: string;
  organizationName: string | null;
  role: "user" | "admin";
  membershipRole: string | null;
  rank: string | null;
  badgeNumber: string | null;
  phone: string | null;
  unit: string | null;
  bio: string | null;
  isActive: boolean;
  isPlatformOwner: boolean;
  mustChangePassword: boolean;
  lastSignedIn: string | null;
  createdAt: string | null;
};

type OrganizationOption = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
};

type UserForm = {
  name: string;
  username: string;
  email: string;
  password: string;
  organizationId: string;
  role: "user" | "admin";
  membershipRole: MembershipRole;
  rank: string;
  badgeNumber: string;
  phone: string;
  unit: string;
  bio: string;
  mustChangePassword: boolean;
};

const EMPTY_USER_FORM: UserForm = {
  name: "",
  username: "",
  email: "",
  password: "",
  organizationId: "",
  role: "user",
  membershipRole: "member",
  rank: "",
  badgeNumber: "",
  phone: "",
  unit: "",
  bio: "",
  mustChangePassword: true,
};

function isMembershipRole(value: string): value is MembershipRole {
  return (MEMBERSHIP_ROLES as readonly string[]).includes(value);
}

function membershipRoleLabel(value: string | null): string {
  if (!value) return "—";
  return isMembershipRole(value) ? MEMBERSHIP_ROLE_LABELS[value] : value;
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function validateUserForm(
  form: UserForm,
  mode: "create" | "edit"
): string | null {
  const name = form.name.trim();
  if (name.length < 2) return "أدخل الاسم الكامل (حرفان على الأقل).";
  if (name.length > 255) return "الاسم يتجاوز 255 محرفاً.";

  const username = form.username.trim();
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
    return "اسم المستخدم بين 3 و64 محرفاً لاتينياً أو رقماً أو نقطة أو شرطة.";
  }

  const email = form.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return "أدخل بريداً إلكترونياً صالحاً.";
  }

  if (mode === "create" && form.password.length < 10) {
    return "كلمة المرور المؤقتة يجب ألا تقل عن 10 محارف.";
  }

  if (!form.organizationId) return "اختر جهة المستخدم.";

  return null;
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

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <Card className="flex-row items-center gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tabular-nums">{value}</p>
      </div>
    </Card>
  );
}

export default function UsersPage() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_USER_FORM);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);

  const contextQuery = trpc.organizations.context.useQuery();
  const isOwner = contextQuery.data?.isOwner ?? false;

  const usersQuery = trpc.userManagement.list.useQuery(undefined, {
    enabled: isOwner,
  });
  const organizationsQuery = trpc.organizations.list.useQuery(
    { includeInactive: true },
    { enabled: isOwner }
  );

  const organizations = useMemo<OrganizationOption[]>(
    () => organizationsQuery.data ?? [],
    [organizationsQuery.data]
  );

  const organizationNames = useMemo(
    () => new Map(organizations.map(item => [item.id, item.name])),
    [organizations]
  );

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar");
    if (!term) return users;
    return users.filter(user =>
      [
        user.name,
        user.username,
        user.email,
        user.organizationName,
        organizationNames.get(user.organizationId),
        user.rank,
        user.badgeNumber,
        user.unit,
      ]
        .filter((value): value is string => Boolean(value))
        .some(value => value.toLocaleLowerCase("ar").includes(term))
    );
  }, [organizationNames, search, users]);

  const createUser = trpc.userManagement.create.useMutation({
    onSuccess: async () => {
      await utils.userManagement.list.invalidate();
      setIsDialogOpen(false);
      setForm(EMPTY_USER_FORM);
      toast.success("تم إنشاء حساب المستخدم");
    },
    onError: error => toast.error(error.message),
  });

  const updateUser = trpc.userManagement.update.useMutation({
    onSuccess: async () => {
      await utils.userManagement.list.invalidate();
      setIsDialogOpen(false);
      setEditingUser(null);
      setForm(EMPTY_USER_FORM);
      toast.success("تم تحديث بيانات المستخدم");
    },
    onError: error => toast.error(error.message),
  });

  const setUserActive = trpc.userManagement.setActive.useMutation({
    onSuccess: async () => {
      await utils.userManagement.list.invalidate();
      toast.success("تم تحديث حالة المستخدم");
    },
    onError: error => toast.error(error.message),
  });

  const deleteUser = trpc.userManagement.delete.useMutation({
    onSuccess: async () => {
      await utils.userManagement.list.invalidate();
      setDeleteTarget(null);
      toast.success("تم حذف حساب المستخدم");
    },
    onError: error => toast.error(error.message),
  });

  const mutationPending =
    createUser.isPending ||
    updateUser.isPending ||
    setUserActive.isPending ||
    deleteUser.isPending;

  const dialogMode: "create" | "edit" = editingUser ? "edit" : "create";
  const validationError = validateUserForm(form, dialogMode);

  const updateForm = (patch: Partial<UserForm>) =>
    setForm(current => ({ ...current, ...patch }));

  const openCreateDialog = () => {
    setEditingUser(null);
    setForm({
      ...EMPTY_USER_FORM,
      organizationId: organizations[0]?.id ?? "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (user: ManagedUser) => {
    setEditingUser(user);
    setForm({
      name: user.name ?? "",
      username: user.username ?? "",
      email: user.email ?? "",
      password: "",
      organizationId: user.organizationId,
      role: user.role,
      membershipRole:
        user.membershipRole && isMembershipRole(user.membershipRole)
          ? user.membershipRole
          : "member",
      rank: user.rank ?? "",
      badgeNumber: user.badgeNumber ?? "",
      phone: user.phone ?? "",
      unit: user.unit ?? "",
      bio: user.bio ?? "",
      mustChangePassword: user.mustChangePassword,
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingUser(null);
    setForm(EMPTY_USER_FORM);
  };

  const handleSubmit = () => {
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const shared = {
      name: form.name.trim(),
      username: form.username.trim(),
      email: form.email.trim(),
      organizationId: form.organizationId,
      role: form.role,
      membershipRole: form.membershipRole,
      rank: optionalText(form.rank),
      badgeNumber: optionalText(form.badgeNumber),
      phone: optionalText(form.phone),
      unit: optionalText(form.unit),
    };

    if (editingUser) {
      updateUser.mutate({
        id: editingUser.id,
        ...shared,
        bio: optionalText(form.bio),
      });
      return;
    }

    createUser.mutate({
      ...shared,
      password: form.password,
      mustChangePassword: form.mustChangePassword,
    });
  };

  const refresh = () => {
    void usersQuery.refetch();
    void organizationsQuery.refetch();
  };

  const totalUsers = users.length;
  const activeUsers = users.filter(user => user.isActive).length;
  const disabledUsers = totalUsers - activeUsers;

  return (
    <div className="mx-auto max-w-6xl space-y-5" dir="rtl">
      <header className="document-page-header document-admin-header">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Users className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">إدارة المستخدمين</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              إنشاء حسابات المستخدمين وربطها بالجهات وضبط أدوارها وصلاحياتها
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner ? (
            <Button
              variant="outline"
              onClick={refresh}
              disabled={usersQuery.isFetching}
            >
              <RefreshCw className="ml-2 h-4 w-4" aria-hidden="true" />
              {usersQuery.isFetching ? "جارٍ التحديث..." : "تحديث"}
            </Button>
          ) : null}
          {isOwner ? (
            <Button
              onClick={openCreateDialog}
              disabled={mutationPending || organizations.length === 0}
              title={
                organizations.length === 0
                  ? "أضف جهة واحدة على الأقل قبل إنشاء المستخدمين"
                  : undefined
              }
            >
              <UserPlus className="ml-2 h-4 w-4" aria-hidden="true" />
              إضافة مستخدم
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
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            إدارة حسابات المستخدمين متاحة لمالك المنصة فقط. يمكنك مراجعة بيانات
            حسابك من صفحة الملف الشخصي.
          </p>
        </Card>
      ) : null}

      {contextQuery.isLoading ? (
        <div className="space-y-3" aria-busy="true">
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map(index => (
              <Skeleton key={index} className="h-20 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      ) : isOwner ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="إجمالي المستخدمين"
              value={totalUsers}
              icon={<Users className="h-5 w-5" aria-hidden="true" />}
            />
            <StatCard
              label="حسابات نشطة"
              value={activeUsers}
              icon={<UserCheck className="h-5 w-5" aria-hidden="true" />}
            />
            <StatCard
              label="حسابات موقوفة"
              value={disabledUsers}
              icon={<Ban className="h-5 w-5" aria-hidden="true" />}
            />
          </div>

          <Card className="gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">حسابات المستخدمين</h2>
                <Badge variant="secondary">{filteredUsers.length}</Badge>
              </div>
              <div className="relative w-full sm:w-72">
                <Search
                  className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="ابحث بالاسم أو البريد أو الجهة..."
                  className="pe-9"
                  aria-label="بحث في المستخدمين"
                />
              </div>
            </div>

            {usersQuery.isLoading ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2, 3, 4].map(index => (
                  <Skeleton key={index} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            ) : usersQuery.isError ? (
              <div className="space-y-3 rounded-xl border border-destructive/40 p-4">
                <p className="font-semibold">تعذّر تحميل المستخدمين</p>
                <p className="text-sm text-muted-foreground">
                  {usersQuery.error.message}
                </p>
                <Button
                  variant="outline"
                  onClick={() => void usersQuery.refetch()}
                  disabled={usersQuery.isFetching}
                >
                  إعادة المحاولة
                </Button>
              </div>
            ) : filteredUsers.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                {users.length === 0
                  ? "لا توجد حسابات بعد. ابدأ بإضافة أول مستخدم."
                  : "لا توجد حسابات مطابقة لبحثك."}
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:hidden">
                  {filteredUsers.map(user => (
                    <article
                      key={user.id}
                      className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary"
                        >
                          {(user.name?.trim().charAt(0) ||
                            user.username?.trim().charAt(0) ||
                            "؟").toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="min-w-0 break-words font-semibold">
                              {user.name ?? "بدون اسم"}
                            </h3>
                            {user.isPlatformOwner ? (
                              <Badge variant="outline">مالك المنصة</Badge>
                            ) : null}
                            {user.mustChangePassword ? (
                              <Badge variant="secondary">
                                تغيير كلمة المرور
                              </Badge>
                            ) : null}
                          </div>
                          <p
                            className="mt-1 break-all text-xs text-muted-foreground"
                            dir="ltr"
                          >
                            @{user.username ?? "—"}
                          </p>
                        </div>
                        <Badge
                          variant={user.isActive ? "default" : "secondary"}
                          className={
                            user.isActive
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-border bg-muted text-muted-foreground"
                          }
                        >
                          {user.isActive ? "نشط" : "موقوف"}
                        </Badge>
                      </div>
                      <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                        <div className="min-w-0">
                          <dt className="text-xs text-muted-foreground">البريد الإلكتروني</dt>
                          <dd className="mt-1 break-all" dir="ltr">
                            {user.email ?? "—"}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted-foreground">الجهة</dt>
                          <dd className="mt-1 break-words">
                            {user.organizationName ??
                              organizationNames.get(user.organizationId) ??
                              "—"}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted-foreground">الدور</dt>
                          <dd className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge
                              variant={user.role === "admin" ? "default" : "secondary"}
                            >
                              {ACCOUNT_ROLE_LABELS[user.role]}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {membershipRoleLabel(user.membershipRole)}
                            </span>
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted-foreground">الرتبة / الوحدة</dt>
                          <dd className="mt-1 break-words">
                            {[user.rank, user.unit].filter(Boolean).join(" · ") || "—"}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted-foreground">الرقم العسكري</dt>
                          <dd className="mt-1 font-mono text-xs" dir="ltr">
                            {user.badgeNumber ?? "—"}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted-foreground">آخر دخول</dt>
                          <dd className="mt-1 tabular-nums" dir="ltr">
                            {formatDateTime(user.lastSignedIn)}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                          صلاحية الحساب
                          <Select
                            value={user.role}
                            disabled={mutationPending || user.isPlatformOwner}
                            onValueChange={value =>
                              setUserRole.mutate({
                                id: user.id,
                                role: value as "user" | "admin",
                              })
                            }
                          >
                            <SelectTrigger className="h-10 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">مستخدم</SelectItem>
                              <SelectItem value="admin">مدير</SelectItem>
                            </SelectContent>
                          </Select>
                        </label>
                        <div className="flex flex-wrap items-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-10 flex-1"
                            disabled={mutationPending}
                            onClick={() => openEditDialog(user)}
                          >
                            <Pencil className="ml-1 h-4 w-4" />
                            تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-10 flex-1"
                            disabled={mutationPending || user.isPlatformOwner}
                            onClick={() =>
                              setUserActive.mutate({
                                id: user.id,
                                isActive: !user.isActive,
                              })
                            }
                          >
                            <Power className="ml-1 h-4 w-4" />
                            {user.isActive ? "تعطيل" : "تفعيل"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-10 text-destructive hover:text-destructive"
                            disabled={mutationPending || user.isPlatformOwner}
                            onClick={() => setDeleteTarget(user)}
                            aria-label={`حذف ${user.name ?? "المستخدم"}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto rounded-xl border 2xl:block">
                  <table className="w-full min-w-[1080px] text-sm">
                  <thead className="bg-muted/60 text-right">
                    <tr>
                      <th className="p-3">الاسم</th>
                      <th className="p-3">اسم المستخدم</th>
                      <th className="p-3">البريد</th>
                      <th className="p-3">الجهة</th>
                      <th className="p-3">الدور</th>
                      <th className="p-3">الرتبة</th>
                      <th className="p-3">الرقم العسكري</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3">آخر دخول</th>
                      <th className="min-w-32 p-3">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(user => (
                      <tr key={user.id} className="border-t">
                        <td className="p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">
                              {user.name ?? "بدون اسم"}
                            </span>
                            {user.isPlatformOwner ? (
                              <Badge variant="outline">مالك المنصة</Badge>
                            ) : null}
                            {user.mustChangePassword ? (
                              <Badge variant="secondary">
                                تغيير كلمة المرور
                              </Badge>
                            ) : null}
                          </div>
                          {user.unit ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {user.unit}
                            </p>
                          ) : null}
                        </td>
                        <td className="p-3" dir="ltr">
                          {user.username ?? "—"}
                        </td>
                        <td className="p-3" dir="ltr">
                          {user.email ?? "—"}
                        </td>
                        <td className="p-3">
                          {user.organizationName ??
                            organizationNames.get(user.organizationId) ??
                            "—"}
                        </td>
                        <td className="p-3">
                          <div className="space-y-1">
                            <Badge
                              variant={
                                user.role === "admin" ? "default" : "secondary"
                              }
                            >
                              {ACCOUNT_ROLE_LABELS[user.role]}
                            </Badge>
                            <p className="text-xs text-muted-foreground">
                              {membershipRoleLabel(user.membershipRole)}
                            </p>
                          </div>
                        </td>
                        <td className="p-3">{user.rank ?? "—"}</td>
                        <td className="p-3 font-mono text-xs" dir="ltr">
                          {user.badgeNumber ?? "—"}
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={user.isActive ? "default" : "secondary"}
                          >
                            {user.isActive ? "نشط" : "موقوف"}
                          </Badge>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {formatDateTime(user.lastSignedIn)}
                        </td>
                        <td className="min-w-32 p-3">
                          <div className="flex flex-nowrap items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              title="تعديل"
                              aria-label={`تعديل ${user.name ?? "المستخدم"}`}
                              disabled={mutationPending}
                              onClick={() => openEditDialog(user)}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title={user.isActive ? "تعطيل" : "تفعيل"}
                              aria-label={
                                user.isActive
                                  ? `تعطيل ${user.name ?? "المستخدم"}`
                                  : `تفعيل ${user.name ?? "المستخدم"}`
                              }
                              disabled={mutationPending || user.isPlatformOwner}
                              onClick={() =>
                                setUserActive.mutate({
                                  id: user.id,
                                  isActive: !user.isActive,
                                })
                              }
                            >
                              <Power className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              title="حذف"
                              aria-label={`حذف ${user.name ?? "المستخدم"}`}
                              disabled={mutationPending || user.isPlatformOwner}
                              onClick={() => setDeleteTarget(user)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground">
              لا تُعرض كلمات المرور أو مفاتيح الجلسات في هذه القائمة. حسابات
              مالك المنصة محمية من التعطيل والحذف.
            </p>
          </Card>
        </>
      ) : null}

      <Dialog
        open={isDialogOpen}
        onOpenChange={open => (open ? setIsDialogOpen(true) : closeDialog())}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "تعديل بيانات المستخدم" : "إضافة مستخدم جديد"}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? "تحديث الملف الشخصي والدور والجهة المرتبطة بالحساب."
                : "يُنشأ الحساب بكلمة مرور مؤقتة يجب تغييرها عند أول دخول."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الاسم الكامل *" htmlFor="user-name">
              <Input
                id="user-name"
                value={form.name}
                maxLength={255}
                placeholder="مثال: أحمد محمود"
                onChange={event => updateForm({ name: event.target.value })}
              />
            </Field>

            <Field
              label="اسم المستخدم *"
              htmlFor="user-username"
              hint="أحرف لاتينية وأرقام ونقطة وشرطة، من 3 إلى 64 محرفاً."
            >
              <Input
                id="user-username"
                value={form.username}
                maxLength={64}
                dir="ltr"
                placeholder="a.mahmoud"
                onChange={event => updateForm({ username: event.target.value })}
              />
            </Field>

            <Field label="البريد الإلكتروني *" htmlFor="user-email">
              <Input
                id="user-email"
                type="email"
                value={form.email}
                maxLength={320}
                dir="ltr"
                placeholder="name@example.com"
                onChange={event => updateForm({ email: event.target.value })}
              />
            </Field>

            {editingUser ? null : (
              <Field
                label="كلمة المرور المؤقتة *"
                htmlFor="user-password"
                hint="10 محارف على الأقل."
              >
                <Input
                  id="user-password"
                  type="password"
                  value={form.password}
                  autoComplete="new-password"
                  dir="ltr"
                  onChange={event =>
                    updateForm({ password: event.target.value })
                  }
                />
              </Field>
            )}

            <Field label="الجهة *">
              <Select
                value={form.organizationId}
                onValueChange={value => updateForm({ organizationId: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر الجهة" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map(organization => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name}
                      {organization.isActive ? "" : " (معطّلة)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="الدور *">
              <Select
                value={form.role}
                onValueChange={value => {
                  if (value === "user" || value === "admin") {
                    updateForm({ role: value });
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر الدور" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">مستخدم</SelectItem>
                  <SelectItem value="admin">مدير</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="دور العضوية *">
              <Select
                value={form.membershipRole}
                onValueChange={value => {
                  if (isMembershipRole(value)) {
                    updateForm({ membershipRole: value });
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر دور العضوية" />
                </SelectTrigger>
                <SelectContent>
                  {MEMBERSHIP_ROLES.map(role => (
                    <SelectItem key={role} value={role}>
                      {MEMBERSHIP_ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="الرتبة" htmlFor="user-rank">
              <Input
                id="user-rank"
                value={form.rank}
                maxLength={120}
                placeholder="مثال: عقيد"
                onChange={event => updateForm({ rank: event.target.value })}
              />
            </Field>

            <Field label="الرقم العسكري" htmlFor="user-badge">
              <Input
                id="user-badge"
                value={form.badgeNumber}
                maxLength={80}
                dir="ltr"
                placeholder="12345"
                onChange={event =>
                  updateForm({ badgeNumber: event.target.value })
                }
              />
            </Field>

            <Field label="الهاتف" htmlFor="user-phone">
              <Input
                id="user-phone"
                value={form.phone}
                maxLength={40}
                dir="ltr"
                placeholder="+963 9xx xxx xxx"
                onChange={event => updateForm({ phone: event.target.value })}
              />
            </Field>

            <Field label="الوحدة" htmlFor="user-unit">
              <Input
                id="user-unit"
                value={form.unit}
                maxLength={120}
                placeholder="مثال: وحدة العمليات"
                onChange={event => updateForm({ unit: event.target.value })}
              />
            </Field>

            {editingUser ? (
              <div className="sm:col-span-2">
                <Field label="نبذة" htmlFor="user-bio">
                  <Textarea
                    id="user-bio"
                    value={form.bio}
                    maxLength={2000}
                    rows={3}
                    placeholder="معلومات إضافية عن المستخدم"
                    onChange={event => updateForm({ bio: event.target.value })}
                  />
                </Field>
              </div>
            ) : (
              <div className="sm:col-span-2">
                <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <span>
                    <span className="block text-sm font-medium">
                      إلزام تغيير كلمة المرور
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      يُطلب من المستخدم تعيين كلمة مرور جديدة عند أول دخول.
                    </span>
                  </span>
                  <Switch
                    checked={form.mustChangePassword}
                    onCheckedChange={checked =>
                      updateForm({ mustChangePassword: checked })
                    }
                    aria-label="إلزام تغيير كلمة المرور"
                  />
                </label>
              </div>
            )}

            {validationError && form.name.length > 0 ? (
              <div className="sm:col-span-2">
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {validationError}
                </p>
              </div>
            ) : null}
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
                !form.username.trim() ||
                !form.email.trim() ||
                !form.organizationId ||
                (!editingUser && form.password.length < 10)
              }
            >
              {createUser.isPending || updateUser.isPending
                ? "جارٍ الحفظ..."
                : editingUser
                  ? "حفظ التعديلات"
                  : "إنشاء الحساب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={open => {
          if (!open && !deleteUser.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف حساب المستخدم</AlertDialogTitle>
            <AlertDialogDescription>
              سيُحذف حساب «{deleteTarget?.name ?? "المستخدم"}» نهائياً مع
              عضوياته في الجهات، ولا يمكن التراجع عن هذه العملية.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUser.isPending}>
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteUser.isPending}
              onClick={event => {
                event.preventDefault();
                if (deleteTarget) deleteUser.mutate({ id: deleteTarget.id });
              }}
            >
              {deleteUser.isPending ? "جارٍ الحذف..." : "حذف نهائي"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
