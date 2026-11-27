import { useAuth } from "@/features/auth-session/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  FileText,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  LockKeyhole,
  PanelLeft,
  Plus,
  Search,
  ShieldCheck,
  Users,
  Bell,
  Contact,
  WifiOff,
  X,
} from "lucide-react";
import { CSSProperties, FormEvent, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "./ui/command";
import { Input } from "./ui/input";
import { trpc } from "@/lib/trpc";
import { setSessionToken } from "@/lib/sessionToken";
import { BrandMark } from "./BrandMark";
import HeaderActions from "./HeaderActions";
import {
  hasOrganizationSettingsMenuAccess,
  hasUserManagementMenuAccess,
} from "@/features/admin/menuAccess";

const menuItems = [
  {
    key: "dashboard",
    icon: LayoutDashboard,
    label: "لوحة التحكم",
    path: "/dashboard",
    group: "workspace",
  },
  {
    key: "library",
    icon: FileText,
    label: "إدارة الوثائق",
    path: "/documents",
    group: "workspace",
  },
  {
    key: "contacts",
    icon: Contact,
    label: "جهات الاتصال",
    path: "/contacts",
    group: "workspace",
  },
  {
    key: "notifications",
    icon: Bell,
    label: "الإشعارات",
    path: "/notifications",
    group: "workspace",
  },
  {
    key: "workspace-users",
    icon: Users,
    label: "إدارة المستخدمين",
    path: "/users",
    adminOnly: true,
    group: "management",
  },
  {
    key: "document-settings",
    icon: FileSpreadsheet,
    label: "إعدادات الوثائق",
    path: "/settings",
    ownerOnly: true,
    group: "management",
  },
  {
    key: "audit-log",
    icon: History,
    label: "سجل الحركات",
    path: "/audit-log",
    ownerOnly: true,
    group: "management",
  },
];

const menuGroups = [
  { key: "workspace", label: "مساحة العمل" },
  { key: "management", label: "الإدارة" },
] as const;

const LAST_NAVIGATION_KEY = "wathaeqi:last-navigation";

function normalizeRoute(route: string) {
  const pathname = route.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  return pathname || "/";
}

function isRouteActive(currentRoute: string, targetRoute: string) {
  const current = normalizeRoute(currentRoute);
  const target = normalizeRoute(targetRoute);
  return target === "/"
    ? current === "/"
    : current === target || current.startsWith(`${target}/`);
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 220;
const MAX_WIDTH = 320;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (!saved) return DEFAULT_WIDTH;
    const parsed = Number.parseInt(saved, 10);
    return Number.isFinite(parsed)
      ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed))
      : DEFAULT_WIDTH;
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { loading, user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const loginMutation = trpc.auth.login.useMutation();
  const [loginError, setLoginError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError(null);

    try {
      const result = await loginMutation.mutateAsync({
        username: username.trim(),
        password,
      });
      setSessionToken(result.sessionToken);
      await utils.auth.me.invalidate();

      if (!utils.auth.me.getData()) {
        setLoginError(
          "قُبلت بيانات الدخول لكن تعذر تثبيت جلسة آمنة. أعد المحاولة، وإذا تكررت المشكلة تواصل مع الدعم."
        );
      }
    } catch (error) {
      const failure = error as Error;
      if (failure.name === "TimeoutError") {
        setLoginError(
          "انتهت مهلة تسجيل الدخول قبل تلقي رد من الخادم. تحقق من اتصال الإنترنت ثم أعد المحاولة."
        );
      } else if (
        failure instanceof TypeError ||
        /failed to fetch|network|load failed/i.test(failure.message)
      ) {
        setLoginError(
          "تعذر الاتصال بخدمة تسجيل الدخول. تحقق من اتصال الإنترنت ثم أعد المحاولة."
        );
      } else {
        setLoginError(
          failure.message || "تعذر تسجيل الدخول. يرجى المحاولة مرة أخرى."
        );
      }
    }
  };

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="auth-shell flex min-h-dvh items-center justify-center px-4 py-8">
        <form
          className="auth-card surface-elevated flex w-full max-w-md flex-col gap-6 rounded-[1.5rem] border bg-card/95 p-6 shadow-lg backdrop-blur sm:p-8"
          onSubmit={submitLogin}
        >
          <div className="flex flex-col items-center gap-4">
            <BrandMark size="lg" showLabel />
            <span className="auth-eyebrow">مساحة عمل موثوقة</span>
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              وثائقك. منظّمة وواضحة.
            </h1>
            <p className="text-sm text-muted-foreground text-center">
              سجّل الدخول للوصول إلى وثائقك وقوالبك وملفاتك المحفوظة بأمان.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="login-username" className="text-sm font-medium">
                اسم المستخدم
              </label>
              <Input
                id="login-username"
                value={username}
                onChange={event => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                dir="ltr"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="login-password" className="text-sm font-medium">
                كلمة المرور
              </label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="current-password"
                dir="ltr"
                required
              />
            </div>
          </div>

          {loginError ? (
            <p
              role="alert"
              aria-live="polite"
              className="text-sm text-destructive text-center"
            >
              {loginError}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            disabled={loginMutation.isPending || !username.trim() || !password}
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            {loginMutation.isPending ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            بتسجيل الدخول، فإنك توافق على{" "}
            <a
              href="/terms"
              className="text-muted-foreground underline decoration-muted-foreground/50 underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              الشروط والأحكام
            </a>
            .
          </p>
        </form>
      </div>
    );
  }

  return (
    <>
      <SidebarProvider
        style={
          {
            "--sidebar-width": `${sidebarWidth}px`,
          } as CSSProperties
        }
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
      >
        <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
          {children}
        </DashboardLayoutContent>
      </SidebarProvider>
      <TemporaryPasswordDialog user={user} />
    </>
  );
}

function TemporaryPasswordDialog({
  user,
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
}) {
  const utils = trpc.useUtils();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const changePassword = trpc.profile.changePassword.useMutation({
    onSuccess: async result => {
      setSessionToken(result.sessionToken);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await utils.auth.me.invalidate();
    },
  });
  const skipPasswordChange =
    trpc.profile.dismissTemporaryPasswordChange.useMutation({
      onSuccess: async () => {
        await utils.auth.me.invalidate();
      },
    });

  if (!user.mustChangePassword) return null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) return;
    changePassword.mutate({ currentPassword, newPassword });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm"
      dir="rtl"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="temporary-password-title"
        onSubmit={submit}
        className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-5 overflow-y-auto overscroll-contain rounded-3xl border bg-background p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <h2 id="temporary-password-title" className="text-lg font-bold">
                حماية حسابك
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                هذه كلمة مرور مؤقتة. يمكنك تغييرها الآن أو المتابعة بها مؤقتًا.
                ستظهر هذه الرسالة مرة واحدة فقط.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
            aria-label="إغلاق النافذة"
            onClick={() => skipPasswordChange.mutate()}
            disabled={skipPasswordChange.isPending}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="grid gap-1.5 text-sm font-medium">
            كلمة المرور الحالية
            <Input
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
              placeholder="كلمة المرور المؤقتة"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            كلمة المرور الجديدة
            <Input
              type="password"
              dir="ltr"
              autoComplete="new-password"
              minLength={12}
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              placeholder="12 محرفًا على الأقل"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            تأكيد كلمة المرور الجديدة
            <Input
              type="password"
              dir="ltr"
              autoComplete="new-password"
              minLength={12}
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              placeholder="أعد كتابة كلمة المرور"
            />
          </label>
          {newPassword &&
            confirmPassword &&
            newPassword !== confirmPassword && (
              <p className="text-xs text-destructive">
                كلمتا المرور غير متطابقتين
              </p>
            )}
          {changePassword.error && (
            <p role="alert" className="text-xs text-destructive">
              {changePassword.error.message}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => skipPasswordChange.mutate()}
            disabled={skipPasswordChange.isPending || changePassword.isPending}
          >
            {skipPasswordChange.isPending ? "جارٍ المتابعة..." : "تخطي الآن"}
          </Button>
          <Button
            type="submit"
            disabled={
              changePassword.isPending ||
              skipPasswordChange.isPending ||
              !currentPassword ||
              newPassword.length < 12 ||
              newPassword !== confirmPassword
            }
          >
            <LockKeyhole className="ml-2 h-4 w-4" />
            {changePassword.isPending ? "جارٍ الحفظ..." : "تغيير كلمة المرور"}
          </Button>
        </div>
      </form>
    </div>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user } = useAuth();
  const organizationContext = trpc.organizations.context.useQuery(undefined, {
    enabled: Boolean(user),
    staleTime: 30_000,
  });
  const isPlatformOwnerAccount = organizationContext.data?.isOwner === true;
  const canManageUsers = hasUserManagementMenuAccess({
    accountRole: user?.role,
    organizationRole: organizationContext.data?.role,
    isPlatformOwner: isPlatformOwnerAccount,
  });
  const canManageDocumentSettings = hasOrganizationSettingsMenuAccess({
    organizationRole: organizationContext.data?.role,
    isPlatformOwner: isPlatformOwnerAccount,
  });
  const [location, setLocation] = useLocation();
  const { state, openMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
  // The offcanvas shell is initialized from the mobile breakpoint.
  // Keep this expression explicit for the responsive-shell contract.
  const mobileSidebarInitialState = useState(() => !isMobile)[0];
  const showSidebarBrand = isMobile || !isCollapsed;
  const [searchOpen, setSearchOpen] = useState(false);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine
  );
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item =>
    isRouteActive(location, item.path)
  );

  const navigateTo = (path: string) => {
    if (isRouteActive(location, path)) {
      if (isMobile) setOpenMobile(false);
      return;
    }

    window.sessionStorage.setItem(LAST_NAVIGATION_KEY, path);
    setLocation(path);
    if (isMobile) setOpenMobile(false);
  };

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (isMobile) setOpenMobile(false);
        setSearchOpen(true);
      }
    };

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  useEffect(() => {
    const updateOnlineState = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <a
        href="#main-content"
        className="fixed right-4 top-3 z-50 -translate-y-24 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0"
      >
        تجاوز إلى المحتوى الرئيسي
      </a>
      {isMobile && openMobile ? (
        <button
          type="button"
          aria-label="إغلاق القائمة الجانبية"
          className="fixed inset-0 z-20 bg-slate-950/35 backdrop-blur-[1px] transition-opacity"
          onClick={() => setOpenMobile(false)}
        />
      ) : null}
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          side="right"
          collapsible={isMobile ? "offcanvas" : "icon"}
          className={`z-30 border-l-0 ${isMobile && openMobile ? "z-[60]" : ""}`}
          disableTransition={isResizing}
        >
          <SidebarHeader className="border-b border-sidebar-border bg-sidebar/95 px-3 pb-4 pt-[calc(1rem_+_env(safe-area-inset-top))]">
            <div className="flex w-full items-center justify-between gap-3">
              {showSidebarBrand ? (
                <BrandMark size="sm" showLabel className="min-w-0" />
              ) : null}
              <button
                onClick={toggleSidebar}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={
                  isMobile
                    ? "إغلاق القائمة الجانبية"
                    : isCollapsed
                      ? "توسيع القائمة الجانبية"
                      : "طي القائمة إلى أيقونات"
                }
                title={
                  isMobile
                    ? "إغلاق القائمة"
                    : isCollapsed
                      ? "توسيع القائمة"
                      : "طي القائمة"
                }
              >
                {isMobile ? (
                  <X className="h-4 w-4" />
                ) : (
                  <PanelLeft className="h-4 w-4" />
                )}
              </button>
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-3 py-5">
            {menuGroups.map(group => {
              const groupItems = menuItems.filter(
                item =>
                  item.group === group.key &&
                  (!item.adminOnly || canManageUsers) &&
                  (!item.ownerOnly || canManageDocumentSettings)
              );
              if (!groupItems.length) return null;
              return (
                <SidebarGroup key={group.key} className="px-0 py-0 [&+&]:mt-5">
                  <SidebarGroupLabel className="mb-2 px-2 text-[11px] font-semibold tracking-[0.14em] text-sidebar-foreground/55">
                    {group.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu className="gap-1.5">
                      {groupItems.map(item => {
                        const isActive = isRouteActive(location, item.path);
                        return (
                          <SidebarMenuItem key={item.key}>
                            <SidebarMenuButton
                              isActive={isActive}
                              onClick={() => navigateTo(item.path)}
                              aria-current={isActive ? "page" : undefined}
                              tooltip={item.label}
                              className="h-11 rounded-xl px-3 font-medium transition-colors hover:translate-x-[-2px] data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-md data-[active=true]:hover:bg-primary/90"
                            >
                              <item.icon
                                className={`h-[18px] w-[18px] ${isActive ? "text-current" : "text-sidebar-foreground/70"}`}
                              />
                              <span>{item.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })}
          </SidebarContent>
        </Sidebar>
        <div
          className={`absolute top-0 left-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:bg-primary/20 ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
        />
      </div>

      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="البحث السريع"
        description="انتقل إلى صفحة أو ابدأ إجراءً في وثائقي"
      >
        <CommandInput placeholder="ابحث عن صفحة أو إجراء..." dir="rtl" />
        <CommandList dir="rtl">
          <CommandEmpty>لا توجد نتائج مطابقة.</CommandEmpty>
          <CommandGroup heading="التنقل">
            {menuItems
              .filter(
                item =>
                  (!item.adminOnly || canManageUsers) &&
                  (!item.ownerOnly || canManageDocumentSettings)
              )
              .map(item => (
                <CommandItem
                  key={item.key}
                  value={`${item.label} ${item.path}`}
                  onSelect={() => {
                    setSearchOpen(false);
                    navigateTo(item.path);
                  }}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            <CommandItem
              value="إنشاء وثيقة جديدة"
              onSelect={() => {
                setSearchOpen(false);
                setLocation("/documents?create=1");
              }}
            >
              <Plus className="h-4 w-4" />
              <span>إنشاء وثيقة جديدة</span>
              <CommandShortcut>↵</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <SidebarInset>
        {!isMobile ? (
          <div
            dir="rtl"
            className="app-header flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4"
          >
            <div className="flex items-center gap-3">
              <SidebarTrigger
                className="h-10 w-10 shrink-0 rounded-xl border bg-background shadow-sm hover:bg-accent"
                aria-label={
                  isCollapsed
                    ? "فتح القائمة الجانبية"
                    : "إغلاق القائمة الجانبية"
                }
                title={isCollapsed ? "فتح القائمة" : "إغلاق القائمة"}
              />
              <BrandMark size="sm" />
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="text-[10px] font-medium text-muted-foreground">
                  وثائقي <span className="px-1 text-brand-gold">/</span> مساحة
                  العمل
                </span>
                <h1 className="truncate text-sm font-bold tracking-tight text-foreground">
                  {activeMenuItem?.label ?? "لوحة العمل"}
                </h1>
              </div>
              <span
                className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold ${online ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${online ? "animate-pulse bg-emerald-500" : "bg-amber-500"}`}
                />
                {online ? "النظام متصل" : "وضع عدم الاتصال"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="hidden h-10 w-40 justify-between rounded-lg border-border bg-background px-3 text-sm text-muted-foreground md:flex lg:w-48"
                aria-label="البحث السريع، الاختصار Ctrl K"
                onClick={() => setSearchOpen(true)}
              >
                <span className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  بحث سريع
                </span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">
                  Ctrl K
                </kbd>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-xl border-border/70 bg-background/95 shadow-sm backdrop-blur transition-colors hover:bg-accent"
                aria-label="الإشعارات"
                onClick={() => setLocation("/notifications")}
              >
                <Bell className="h-5 w-5" />
              </Button>
              <HeaderActions />
            </div>
          </div>
        ) : null}
        {isMobile && (
          <div
            dir="rtl"
            className="app-header sticky top-0 z-40 flex h-[52px] items-center justify-between border-b border-border bg-card px-3"
            style={{
              height: "calc(52px + env(safe-area-inset-top))",
              paddingTop: "env(safe-area-inset-top)",
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-xl border-border/70 bg-background/95 shadow-sm backdrop-blur transition-colors hover:bg-accent"
                aria-label="فتح القائمة الجانبية الكاملة"
                aria-expanded={openMobile}
                onClick={() => setOpenMobile(true)}
              >
                <PanelLeft className="h-5 w-5" />
              </Button>
              <h1 className="min-w-0 truncate text-sm font-semibold text-foreground">
                {activeMenuItem?.label ?? "مساحة العمل"}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-xl border-border/70 bg-background/95 shadow-sm backdrop-blur transition-colors hover:bg-accent"
                aria-label="الإشعارات"
                onClick={() => setLocation("/notifications")}
              >
                <Bell className="h-5 w-5" />
              </Button>
              <HeaderActions showTheme showMenu={false} />
            </div>
          </div>
        )}
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 p-3 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8 lg:p-8 lg:pb-8 xl:p-10 xl:pb-10 2xl:p-12 2xl:pb-12"
        >
          {!online ? (
            <div
              role="status"
              className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"
              dir="rtl"
            >
              <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-bold">أنت تعمل دون اتصال بالإنترنت</p>
                <p className="mt-1 text-xs leading-5 opacity-85">
                  ستبقى الواجهة مفتوحة، وستظهر آخر البيانات المحفوظة إن توفرت.
                  ستستأنف المزامنة تلقائياً عند عودة الاتصال.
                </p>
              </div>
            </div>
          ) : null}
          {children}
        </main>
      </SidebarInset>
      {isMobile ? (
        <nav
          aria-label="التنقل الرئيسي"
          dir="rtl"
          className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border/80 bg-card/95 px-2 pt-2 shadow-[0_-8px_28px_rgba(2,8,23,0.10)] backdrop-blur-xl md:hidden"
          style={{
            paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
          }}
        >
          <button
            type="button"
            onClick={() => navigateTo("/dashboard")}
            aria-current={
              isRouteActive(location, "/dashboard") ? "page" : undefined
            }
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors ${
              isRouteActive(location, "/dashboard")
                ? "text-primary"
                : "text-muted-foreground hover:bg-muted/70"
            }`}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>الرئيسية</span>
          </button>
          <button
            type="button"
            onClick={() => navigateTo("/documents")}
            aria-current={
              isRouteActive(location, "/documents") ? "page" : undefined
            }
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors ${
              isRouteActive(location, "/documents")
                ? "text-primary"
                : "text-muted-foreground hover:bg-muted/70"
            }`}
          >
            <FileText className="h-5 w-5" />
            <span>الوثائق</span>
          </button>
          <button
            type="button"
            onClick={() => setLocation("/documents?create=1")}
            className="flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold text-primary"
          >
            <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-4 ring-background">
              <Plus className="h-5 w-5" />
            </span>
            <span>إنشاء جديد</span>
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="فتح البحث السريع"
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted/70"
          >
            <Search className="h-5 w-5" />
            <span>بحث</span>
          </button>
          <div className="mobile-bottom-nav-account flex min-h-14 items-center justify-center">
            <HeaderActions showTheme={false} />
          </div>
        </nav>
      ) : null}
    </>
  );
}
