import { Fragment, useEffect, useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  FilterX,
  RefreshCw,
  Search,
} from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { auditActionLabels } from "@/features/reports/auditPresentation";
import { ownerTrpc as trpc } from "@/lib/ownerTrpc";

const PAGE_SIZE = 25;

const ENTITY_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "الكل" },
  { value: "organization", label: "الجهات" },
  { value: "user", label: "المستخدمون" },
  { value: "department_settings", label: "إعدادات الدوائر" },
  { value: "document", label: "الوثائق" },
  { value: "auth", label: "المصادقة" },
];

const ENTITY_LABELS: Record<string, string> = Object.fromEntries(
  ENTITY_TYPE_OPTIONS.filter(option => option.value !== "all").map(option => [
    option.value,
    option.label,
  ])
);

const ROLE_LABELS: Record<string, string> = {
  system_admin: "مدير النظام",
  organization_admin: "مدير جهة",
  regional_admin: "مدير إقليمي",
  reviewer: "مراجع",
  dispatcher: "موزّع",
  member: "عضو جهة",
  owner: "مالك المنصة",
  platform_owner: "مالك المنصة",
};

type AuditLogRow = {
  id: string;
  actorUserId: number | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  organizationId: string | null;
  reason: string | null;
  metadata: unknown;
  beforeState: unknown;
  afterState: unknown;
  ipAddress: string | null;
  createdAt: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat("ar-SY", {
  dateStyle: "medium",
  timeStyle: "short",
});

const countFormatter = new Intl.NumberFormat("ar-SY");

function formatCount(value: number): string {
  return countFormatter.format(value);
}

function formatAuditDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  try {
    return dateTimeFormatter.format(date);
  } catch {
    return date.toLocaleString("ar-SY");
  }
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function dateInputToIso(
  value: string,
  edge: "start" | "end"
): string | undefined {
  if (!value) return undefined;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) {
    return undefined;
  }
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  if (!Number.isFinite(date.getTime())) return undefined;
  if (edge === "end") date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function actorLabel(row: AuditLogRow): string {
  return row.actorName?.trim() || "منفذ غير معروف";
}

function actorRoleLabel(row: AuditLogRow): string {
  if (!row.actorRole) return "صلاحية غير محددة";
  return ROLE_LABELS[row.actorRole] ?? "صلاحية مسجلة";
}

function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? "سجل النظام";
}

function actionLabel(action: string): string {
  return auditActionLabels[action] ?? action;
}

function DetailBlock({ title, value }: { title: string; value: unknown }) {
  const text = formatJson(value);
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      {text ? (
        <pre
          dir="ltr"
          className="mt-1 max-h-64 overflow-auto rounded-lg border bg-background p-3 text-left text-xs leading-6"
        >
          {text}
        </pre>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">لا توجد بيانات.</p>
      )}
    </div>
  );
}

export default function AuditLogPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => setAction(actionInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [actionInput]);

  const rangeInvalid = Boolean(fromDate && toDate && fromDate > toDate);
  const fromIso = rangeInvalid ? undefined : dateInputToIso(fromDate, "start");
  const toIso = rangeInvalid ? undefined : dateInputToIso(toDate, "end");

  const logsQuery = trpc.auditLogs.search.useQuery(
    {
      search: search || undefined,
      action: action || undefined,
      entityType: entityType === "all" ? undefined : entityType,
      from: fromIso,
      to: toIso,
      page,
      pageSize: PAGE_SIZE,
    },
    {
      placeholderData: keepPreviousData,
      enabled: !rangeInvalid,
    }
  );

  const organizationsQuery = trpc.organizations.list.useQuery({
    includeInactive: true,
  });

  const organizationNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const organization of organizationsQuery.data ?? []) {
      map.set(organization.id, organization.name);
    }
    return map;
  }, [organizationsQuery.data]);

  const rows: AuditLogRow[] = logsQuery.data?.items ?? [];
  const total = logsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(
    searchInput || actionInput || entityType !== "all" || fromDate || toDate
  );

  useEffect(() => {
    if (!logsQuery.data) return;
    if (page > totalPages) setPage(totalPages);
  }, [logsQuery.data, page, totalPages]);

  const resetFilters = () => {
    setSearchInput("");
    setSearch("");
    setActionInput("");
    setAction("");
    setEntityType("all");
    setFromDate("");
    setToDate("");
    setPage(1);
    setExpandedId(null);
  };

  const toggleExpanded = (id: string) => {
    setExpandedId(current => (current === id ? null : id));
  };

  const firstRowNumber = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRowNumber = Math.min(page * PAGE_SIZE, total);
  const actionSuggestions = Object.entries(auditActionLabels);

  return (
    <div className="mx-auto max-w-6xl space-y-5" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ClipboardList className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">سجل التدقيق</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              مراجعة العمليات المسجلة على الوثائق والجهات والمستخدمين
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{formatCount(total)} سجل</Badge>
          <Button
            variant="outline"
            onClick={() => void logsQuery.refetch()}
            disabled={logsQuery.isFetching || rangeInvalid}
          >
            <RefreshCw
              className={
                logsQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"
              }
            />
            تحديث
          </Button>
        </div>
      </header>

      <Card className="gap-4 rounded-2xl p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="audit-search">اسم المنفذ</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="audit-search"
                value={searchInput}
                onChange={event => {
                  setSearchInput(event.target.value);
                  setPage(1);
                }}
                placeholder="ابحث باسم المستخدم المنفذ..."
                className="pr-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-action">الإجراء</Label>
            <Input
              id="audit-action"
              value={actionInput}
              onChange={event => {
                setActionInput(event.target.value);
                setPage(1);
              }}
              placeholder="مثال: document.upload"
              list="audit-action-options"
              dir="ltr"
              className="text-left"
            />
            <datalist id="audit-action-options">
              {actionSuggestions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              يُطابق رمز الإجراء تماماً؛ اختر من القائمة أو اكتب الرمز.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-entity">نوع الكيان</Label>
            <Select
              value={entityType}
              onValueChange={value => {
                setEntityType(value);
                setPage(1);
              }}
            >
              <SelectTrigger id="audit-entity" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-from">من تاريخ</Label>
            <Input
              id="audit-from"
              type="date"
              value={fromDate}
              onChange={event => {
                setFromDate(event.target.value);
                setPage(1);
              }}
              max={toDate || undefined}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-to">إلى تاريخ</Label>
            <Input
              id="audit-to"
              type="date"
              value={toDate}
              onChange={event => {
                setToDate(event.target.value);
                setPage(1);
              }}
              min={fromDate || undefined}
            />
          </div>

          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              onClick={resetFilters}
              disabled={!hasFilters}
            >
              <FilterX className="h-4 w-4" />
              مسح المرشحات
            </Button>
          </div>
        </div>

        {rangeInvalid ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            تاريخ البداية بعد تاريخ النهاية. عدّل النطاق لعرض السجلات.
          </p>
        ) : null}
      </Card>

      <Card className="gap-4 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">السجلات</h2>
          {logsQuery.isFetching && !logsQuery.isLoading ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              جارٍ التحديث...
            </span>
          ) : null}
        </div>

        {organizationsQuery.isError ? (
          <p className="text-xs text-muted-foreground">
            تعذّر تحميل أسماء الجهات؛ تُعرض معرّفاتها كما هي في السجلات.
          </p>
        ) : null}

        {rangeInvalid ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            راجع نطاق التاريخ أعلاه لعرض السجلات.
          </p>
        ) : logsQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5].map(index => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : logsQuery.isError ? (
          <div
            className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
            role="alert"
          >
            <p className="text-sm font-semibold text-destructive">
              تعذّر تحميل سجل التدقيق
            </p>
            <p className="text-xs text-muted-foreground">
              {logsQuery.error.message}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void logsQuery.refetch()}
              disabled={logsQuery.isFetching}
            >
              <RefreshCw
                className={
                  logsQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"
                }
              />
              إعادة المحاولة
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="space-y-3 rounded-xl border border-dashed p-8 text-center">
            <p className="text-sm font-medium">لا توجد سجلات مطابقة</p>
            <p className="text-xs text-muted-foreground">
              جرّب تعديل المرشحات أو توسيع نطاق التاريخ.
            </p>
            {hasFilters ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                <FilterX className="h-4 w-4" />
                مسح المرشحات
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="rounded-xl border">
              <Table className="min-w-[900px]">
                <TableHeader className="bg-muted/60">
                  <TableRow>
                    <TableHead className="text-right">الوقت</TableHead>
                    <TableHead className="text-right">المنفذ</TableHead>
                    <TableHead className="text-right">الإجراء</TableHead>
                    <TableHead className="text-right">الكيان</TableHead>
                    <TableHead className="text-right">المعرف</TableHead>
                    <TableHead className="text-right">الجهة</TableHead>
                    <TableHead className="text-right">التفاصيل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(row => {
                    const expanded = expandedId === row.id;
                    const organizationName = row.organizationId
                      ? (organizationNames.get(row.organizationId) ??
                        row.organizationId)
                      : "—";
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          className={expanded ? "bg-muted/40" : undefined}
                        >
                          <TableCell className="text-xs text-muted-foreground">
                            {formatAuditDate(row.createdAt)}
                          </TableCell>
                          <TableCell>
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {actorLabel(row)}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {actorRoleLabel(row)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="min-w-0">
                              <p className="truncate">
                                {actionLabel(row.action)}
                              </p>
                              <p
                                className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
                                dir="ltr"
                                title={row.action}
                              >
                                {row.action}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="min-w-0">
                              <p className="truncate">
                                {entityLabel(row.entityType)}
                              </p>
                              <p
                                className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
                                dir="ltr"
                                title={row.entityType}
                              >
                                {row.entityType}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span
                              className="block max-w-[160px] truncate font-mono text-xs text-muted-foreground"
                              dir="ltr"
                              title={row.entityId ?? ""}
                            >
                              {row.entityId ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span
                              className="block max-w-[180px] truncate text-xs"
                              title={organizationName}
                            >
                              {organizationName}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleExpanded(row.id)}
                              aria-expanded={expanded}
                              aria-controls={`audit-details-${row.id}`}
                            >
                              {expanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                              {expanded ? "إخفاء" : "عرض"}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {expanded ? (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell
                              colSpan={7}
                              className="whitespace-normal p-4"
                            >
                              <div
                                id={`audit-details-${row.id}`}
                                className="space-y-3"
                              >
                                {row.reason ? (
                                  <div>
                                    <p className="text-xs font-semibold text-muted-foreground">
                                      السبب
                                    </p>
                                    <p className="mt-1 text-sm">{row.reason}</p>
                                  </div>
                                ) : null}
                                <div className="grid gap-3 lg:grid-cols-3">
                                  <DetailBlock
                                    title="البيانات الوصفية"
                                    value={row.metadata}
                                  />
                                  <DetailBlock
                                    title="الحالة قبل التنفيذ"
                                    value={row.beforeState}
                                  />
                                  <DetailBlock
                                    title="الحالة بعد التنفيذ"
                                    value={row.afterState}
                                  />
                                </div>
                                <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                                  <span>
                                    عنوان IP:{" "}
                                    <span className="font-mono" dir="ltr">
                                      {row.ipAddress ?? "—"}
                                    </span>
                                  </span>
                                  <span>
                                    معرف المنفذ:{" "}
                                    <span className="font-mono" dir="ltr">
                                      {row.actorUserId ?? "—"}
                                    </span>
                                  </span>
                                  <span>
                                    معرف الجهة:{" "}
                                    <span className="font-mono" dir="ltr">
                                      {row.organizationId ?? "—"}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                عرض {formatCount(firstRowNumber)}–{formatCount(lastRowNumber)}{" "}
                من أصل {formatCount(total)} سجل
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(current => Math.max(1, current - 1))}
                  disabled={page <= 1 || logsQuery.isFetching}
                >
                  <ChevronRight className="h-4 w-4" />
                  السابق
                </Button>
                <span className="text-sm tabular-nums">
                  الصفحة {formatCount(page)} من {formatCount(totalPages)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(current => current + 1)}
                  disabled={!logsQuery.data?.hasNext || logsQuery.isFetching}
                >
                  التالي
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
