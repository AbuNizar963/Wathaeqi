import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { keepPreviousData } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  Building2,
  ChevronLeft,
  ClipboardList,
  Clock,
  FileText,
  Inbox,
  LayoutDashboard,
  Lock,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatDateTime,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
} from "@/features/telegrams/telegramUi";
import { ownerTrpc as trpc } from "@/lib/ownerTrpc";
import { cn } from "@/lib/utils";
import type { TelegramRecord, TelegramRouteRecord } from "@shared/telegrams";

type ReportGroupBy = "status" | "category" | "priority" | "month";

const GROUP_BY_OPTIONS: Array<{ value: ReportGroupBy; label: string }> = [
  { value: "status", label: "الحالة" },
  { value: "category", label: "التصنيف" },
  { value: "priority", label: "الأولوية" },
  { value: "month", label: "الشهر" },
];

const ROLE_LABELS: Record<string, string> = {
  system_admin: "مدير النظام",
  organization_admin: "مدير جهة",
  regional_admin: "مدير إقليمي",
  reviewer: "مراجع",
  dispatcher: "موزّع",
  member: "عضو جهة",
};

const countFormatter = new Intl.NumberFormat("ar-SY");

function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return countFormatter.format(value);
}

function roleLabel(role: string | undefined): string {
  if (!role) return "عضو جهة";
  return ROLE_LABELS[role] ?? "عضو جهة";
}

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "صباح الخير";
  if (hour < 17) return "طاب يومك";
  return "مساء الخير";
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  iconClassName,
  isLoading,
}: {
  label: string;
  value: number | undefined;
  hint: string;
  icon: ReactNode;
  iconClassName?: string;
  isLoading: boolean;
}) {
  return (
    <Card className="gap-3 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary",
            iconClassName
          )}
        >
          {icon}
        </span>
      </div>
      {isLoading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <p className="text-2xl font-bold tabular-nums">{formatCount(value)}</p>
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

function ErrorBlock({
  title,
  message,
  onRetry,
  isRetrying,
}: {
  title: string;
  message?: string;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <div
      className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
      role="alert"
    >
      <p className="text-sm font-semibold text-destructive">{title}</p>
      {message ? (
        <p className="text-xs text-muted-foreground">{message}</p>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        onClick={onRetry}
        disabled={isRetrying}
      >
        <RefreshCw className={cn("h-4 w-4", isRetrying && "animate-spin")} />
        {isRetrying ? "جارٍ إعادة المحاولة..." : "إعادة المحاولة"}
      </Button>
    </div>
  );
}

function RecentTelegramRow({ telegram }: { telegram: TelegramRecord }) {
  return (
    <Link
      href={`/telegrams/${telegram.id}`}
      className="flex flex-wrap items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground" dir="ltr">
            {telegram.serialCode}
          </span>
          <Badge variant="outline" className={statusTone(telegram.status)}>
            {statusLabel(telegram.status)}
          </Badge>
          <Badge variant="outline" className={priorityTone(telegram.priority)}>
            {priorityLabel(telegram.priority)}
          </Badge>
        </div>
        <p className="truncate font-medium">{telegram.subject}</p>
        <p className="truncate text-xs text-muted-foreground">
          الجهة المستلمة: {telegram.recipient || "—"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <time dateTime={telegram.createdAt}>
          {formatDateTime(telegram.createdAt)}
        </time>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </div>
    </Link>
  );
}

function PendingRouteRow({ route }: { route: TelegramRouteRecord }) {
  const reference =
    route.incomingSerialCode ?? route.routeSerialCode ?? route.telegramId;
  return (
    <Link
      href={`/telegrams/${route.telegramId}`}
      className="flex flex-wrap items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground" dir="ltr">
            {reference}
          </span>
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-50 text-amber-900"
          >
            بانتظار القرار
          </Badge>
        </div>
        <p className="truncate text-sm font-medium">
          {route.fromOrganizationName ?? "جهة غير محددة"} ←{" "}
          {route.toOrganizationName ?? "جهة غير محددة"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <time dateTime={route.createdAt}>
          {formatDateTime(route.createdAt)}
        </time>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const [groupBy, setGroupBy] = useState<ReportGroupBy>("status");

  const contextQuery = trpc.organizations.context.useQuery();
  const statsQuery = trpc.dashboard.stats.useQuery();
  const ownerSummaryQuery = trpc.dashboard.ownerSummary.useQuery();
  const reportsQuery = trpc.dashboard.reports.useQuery(
    { groupBy },
    { placeholderData: keepPreviousData }
  );

  const stats = statsQuery.data;
  const reports = reportsQuery.data;
  const series = reports?.series ?? [];
  const maxCount = series.reduce((max, item) => Math.max(max, item.count), 0);
  const ownerSummary =
    ownerSummaryQuery.data?.allowed === true ? ownerSummaryQuery.data : null;

  const organizationName = contextQuery.data?.organizationName ?? "وثائقي";
  const isOwner = contextQuery.data?.isOwner ?? false;
  const canManageTelegrams = contextQuery.data?.canManageTelegrams ?? true;
  const roleBadge = isOwner
    ? "مالك المنصة"
    : roleLabel(contextQuery.data?.role);

  const isRefreshing =
    contextQuery.isFetching ||
    statsQuery.isFetching ||
    ownerSummaryQuery.isFetching ||
    reportsQuery.isFetching;

  const refreshAll = () => {
    void contextQuery.refetch();
    void statsQuery.refetch();
    void ownerSummaryQuery.refetch();
    void reportsQuery.refetch();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <LayoutDashboard className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            {contextQuery.isLoading ? (
              <Skeleton className="h-7 w-64" />
            ) : (
              <h1 className="text-2xl font-bold">
                {greetingForNow()}، {organizationName}
              </h1>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              لوحة التحكم — ملخص البرقيات والإحالات والإشعارات في جهتك
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {contextQuery.isLoading ? (
                <Skeleton className="h-5 w-24" />
              ) : (
                <Badge variant={isOwner ? "default" : "secondary"}>
                  {roleBadge}
                </Badge>
              )}
              {contextQuery.isError ? (
                <span className="flex items-center gap-2 text-xs text-destructive">
                  تعذّر تحميل بيانات الجهة.
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => void contextQuery.refetch()}
                    disabled={contextQuery.isFetching}
                  >
                    إعادة المحاولة
                  </Button>
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={refreshAll} disabled={isRefreshing}>
          <RefreshCw
            className={cn("h-4 w-4", isRefreshing && "animate-spin")}
          />
          {isRefreshing ? "جارٍ التحديث..." : "تحديث البيانات"}
        </Button>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/telegrams"
          className={buttonVariants({ variant: "default" })}
        >
          <FileText className="h-4 w-4" />
          فتح سجل البرقيات
        </Link>
        {canManageTelegrams ? (
          <Link
            href="/telegrams?compose=1"
            className={buttonVariants({ variant: "outline" })}
          >
            <Send className="h-4 w-4" />
            برقية جديدة
          </Link>
        ) : null}
        {isOwner ? (
          <Link
            href="/audit-logs"
            className={buttonVariants({ variant: "outline" })}
          >
            <ClipboardList className="h-4 w-4" />
            سجل التدقيق
          </Link>
        ) : null}
      </div>

      {statsQuery.isError ? (
        <Card className="rounded-2xl p-4">
          <ErrorBlock
            title="تعذّر تحميل ملخص البرقيات"
            message={statsQuery.error.message}
            onRetry={() => void statsQuery.refetch()}
            isRetrying={statsQuery.isFetching}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="إجمالي البرقيات"
            value={stats?.totalTelegrams}
            hint="ضمن نطاق جهتك"
            icon={<FileText className="h-4 w-4" />}
            isLoading={statsQuery.isLoading}
          />
          <KpiCard
            label="قيد الإجراء"
            value={stats?.openTelegrams}
            hint="برقيات مفتوحة تحتاج متابعة"
            icon={<Clock className="h-4 w-4" />}
            iconClassName="bg-sky-500/10 text-sky-600"
            isLoading={statsQuery.isLoading}
          />
          <KpiCard
            label="عاجلة"
            value={stats?.urgentTelegrams}
            hint="أولوية عاجلة"
            icon={<AlertTriangle className="h-4 w-4" />}
            iconClassName="bg-rose-500/10 text-rose-600"
            isLoading={statsQuery.isLoading}
          />
          <KpiCard
            label="سرية"
            value={stats?.telegramStats.secret}
            hint="تصنيف سري"
            icon={<Lock className="h-4 w-4" />}
            iconClassName="bg-amber-500/10 text-amber-600"
            isLoading={statsQuery.isLoading}
          />
          <KpiCard
            label="واردة بانتظار القرار"
            value={stats?.pendingIncomingRoutes}
            hint="إحالات لم يُبتّ فيها بعد"
            icon={<Inbox className="h-4 w-4" />}
            iconClassName="bg-indigo-500/10 text-indigo-600"
            isLoading={statsQuery.isLoading}
          />
          <KpiCard
            label="إشعارات غير مقروءة"
            value={stats?.unreadNotifications}
            hint="تنبيهات بحاجة إلى اطلاع"
            icon={<Bell className="h-4 w-4" />}
            iconClassName="bg-emerald-500/10 text-emerald-600"
            isLoading={statsQuery.isLoading}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-4 rounded-2xl p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">توزيع البرقيات</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                حسب{" "}
                {
                  GROUP_BY_OPTIONS.find(option => option.value === groupBy)
                    ?.label
                }
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {formatCount(reports?.total ?? 0)}
              </Badge>
              <Select
                value={groupBy}
                onValueChange={value => setGroupBy(value as ReportGroupBy)}
              >
                <SelectTrigger className="w-36" aria-label="تجميع التوزيع">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUP_BY_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {reportsQuery.isLoading ? (
            <div className="space-y-4">
              {[0, 1, 2, 3].map(index => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                  <Skeleton className="h-2.5 w-full" />
                </div>
              ))}
            </div>
          ) : reportsQuery.isError ? (
            <ErrorBlock
              title="تعذّر تحميل التوزيع"
              message={reportsQuery.error.message}
              onRetry={() => void reportsQuery.refetch()}
              isRetrying={reportsQuery.isFetching}
            />
          ) : series.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              لا توجد بيانات كافية لعرض التوزيع.
            </p>
          ) : (
            <div className="space-y-4">
              {series.map(item => (
                <div key={item.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{item.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatCount(item.count)}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${maxCount > 0 ? Math.max(4, Math.round((item.count / maxCount) * 100)) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                تُبنى الأشرطة على أحدث 100 برقية كحد أقصى. آخر تحديث:{" "}
                {reports?.generatedAt
                  ? formatDateTime(reports.generatedAt)
                  : "—"}
              </p>
            </div>
          )}
        </Card>

        <Card className="gap-4 rounded-2xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">أحدث البرقيات</h2>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {formatCount(stats?.totalTelegrams ?? 0)}
              </Badge>
              <Link
                href="/telegrams"
                className="text-xs font-medium text-primary hover:underline"
              >
                عرض الكل
              </Link>
            </div>
          </div>
          {statsQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(index => (
                <div key={index} className="space-y-2 rounded-xl border p-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          ) : statsQuery.isError ? (
            <ErrorBlock
              title="تعذّر تحميل أحدث البرقيات"
              message={statsQuery.error.message}
              onRetry={() => void statsQuery.refetch()}
              isRetrying={statsQuery.isFetching}
            />
          ) : (stats?.recentTelegrams ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              لا توجد برقيات مسجلة بعد. ابدأ بإنشاء برقية جديدة.
            </p>
          ) : (
            <div className="divide-y rounded-xl border">
              {(stats?.recentTelegrams ?? []).map(telegram => (
                <RecentTelegramRow key={telegram.id} telegram={telegram} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="gap-4 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">إحالات واردة بانتظار القرار</h2>
          </div>
          <Badge
            variant={
              (stats?.pendingIncomingRoutes ?? 0) > 0 ? "default" : "secondary"
            }
          >
            {formatCount(stats?.pendingIncomingRoutes ?? 0)}
          </Badge>
        </div>
        {statsQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1].map(index => (
              <div key={index} className="space-y-2 rounded-xl border p-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-56" />
              </div>
            ))}
          </div>
        ) : statsQuery.isError ? (
          <ErrorBlock
            title="تعذّر تحميل الإحالات الواردة"
            message={statsQuery.error.message}
            onRetry={() => void statsQuery.refetch()}
            isRetrying={statsQuery.isFetching}
          />
        ) : (stats?.pendingRoutes ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            لا توجد إحالات واردة بانتظار القرار حالياً.
          </p>
        ) : (
          <div className="divide-y rounded-xl border">
            {(stats?.pendingRoutes ?? []).map(route => (
              <PendingRouteRow key={route.id} route={route} />
            ))}
          </div>
        )}
      </Card>

      {ownerSummaryQuery.isLoading ? (
        <Card className="gap-4 rounded-2xl border-primary/30 p-4 sm:p-5">
          <Skeleton className="h-5 w-40" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map(index => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        </Card>
      ) : ownerSummaryQuery.isError ? (
        <Card className="rounded-2xl p-4">
          <ErrorBlock
            title="تعذّر تحميل ملخص المنصة"
            message={ownerSummaryQuery.error.message}
            onRetry={() => void ownerSummaryQuery.refetch()}
            isRetrying={ownerSummaryQuery.isFetching}
          />
        </Card>
      ) : ownerSummary ? (
        <Card className="gap-4 rounded-2xl border-primary/30 bg-primary/5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <div>
                <h2 className="font-semibold">ملخص المنصة</h2>
                <p className="text-xs text-muted-foreground">
                  إحصاءات شاملة متاحة لمالك المنصة فقط
                </p>
              </div>
            </div>
            <Link
              href="/audit-logs"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ClipboardList className="h-4 w-4" />
              سجل التدقيق
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <OwnerMetric
              label="إجمالي البرقيات"
              value={ownerSummary.totalTelegrams}
              icon={<FileText className="h-4 w-4" />}
            />
            <OwnerMetric
              label="حسابات المستخدمين"
              value={ownerSummary.users}
              icon={<Users className="h-4 w-4" />}
            />
            <OwnerMetric
              label="الجهات النشطة"
              value={ownerSummary.organizations}
              icon={<Building2 className="h-4 w-4" />}
            />
            <OwnerMetric
              label="سجلات التدقيق"
              value={ownerSummary.auditEntries}
              icon={<ClipboardList className="h-4 w-4" />}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function OwnerMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums">
        {formatCount(value)}
      </p>
    </div>
  );
}
