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
    label: "لوحة العمل",
    path: "/dashboard",
    group: "workspace",
  },
  {
    key: "library",
    icon: FileText,
    label: "مساحة الوثائق",
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
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  const { state, setOpen, openMobile, setOpenMobile, toggleSidebar } =
    useSidebar();
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
  // The offcanvas shell is initialized from the mobile breakpoint.
  // Keep this expression explicit for the responsive-shell contract.
  const mobileSidebarInitialState = useState(() => !isMobile)[0];
  const showSidebarBrand = isMobile || !isCollapsed;
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
      {isMobile && !isCollapsed ? (
        <button
          type="button"
          aria-label="إغلاق القائمة الجانبية"
          className="fixed inset-0 z-20 bg-slate-950/35 backdrop-blur-[1px] transition-opacity"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          side="right"
          collapsible="offcanvas"
          className="z-30 border-l-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="border-b border-sidebar-border bg-sidebar/95 px-3 py-4">
            <div className="flex w-full items-center justify-between gap-3">
              {showSidebarBrand ? (
                <BrandMark size="sm" showLabel className="min-w-0" />
              ) : null}
              <button
                onClick={toggleSidebar}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="إغلاق القائمة الجانبية"
                title="إغلاق القائمة"
              >
                <PanelLeft className="h-4 w-4" />
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

      <SidebarInset>
        {!isMobile ? (
          <div
            dir="rtl"
            className="app-header flex h-16 shrink-0 items-center justify-between border-b border-border/70 bg-card/90 px-4 shadow-sm backdrop-blur supports-[backdrop-filter]:backdrop-blur"
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
              <h1 className="text-lg font-bold tracking-tight text-foreground">
                وثائقي
              </h1>
              <span
                className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold ${online ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${online ? "animate-pulse bg-emerald-500" : "bg-amber-500"}`}
                />
                {online ? "النظام متصل" : "وضع عدم الاتصال"}
              </span>
            </div>
            <HeaderActions />
          </div>
        ) : null}
        {isMobile && (
          <div className="app-header flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger
                className="h-10 w-10 rounded-xl border bg-background shadow-sm"
                aria-label={
                  openMobile ? "إغلاق القائمة الجانبية" : "فتح القائمة الجانبية"
                }
              />
              <BrandMark size="sm" />
              <span className="text-sm font-bold">وثائقي</span>
              <span className="sr-only">
                {activeMenuItem?.label ?? "القائمة"}
              </span>
            </div>
            <HeaderActions />
          </div>
        )}
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 p-3 sm:p-4 lg:p-8 xl:p-10 2xl:p-12"
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
    </>
  );
}
