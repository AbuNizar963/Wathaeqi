import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  FileSpreadsheet,
  FileText,
  FilterX,
  Plus,
  Search,
  ShieldAlert,
  Timer,
  Inbox,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ownerTrpc as trpc } from "@/lib/ownerTrpc";
import {
  TELEGRAM_CATEGORIES,
  TELEGRAM_CATEGORY_LABELS,
  TELEGRAM_CLASSIFICATIONS,
  TELEGRAM_CLASSIFICATION_LABELS,
  TELEGRAM_PRIORITIES,
  TELEGRAM_PRIORITY_LABELS,
  TELEGRAM_STATUSES,
  TELEGRAM_STATUS_LABELS,
  type TelegramCategory,
  type TelegramClassification,
  type TelegramDirection,
  type TelegramPriority,
  type TelegramStatus,
} from "@shared/telegrams";
import TelegramComposerDialog from "./TelegramComposerDialog";
import TelegramExcelDialog from "./TelegramExcelDialog";
import {
  formatDateTime,
  priorityTone,
  statusTone,
  telegramDisplaySerial,
} from "./telegramUi";

const PAGE_SIZE = 20;

type Filters = {
  search: string;
  status: TelegramStatus | "";
  priority: TelegramPriority | "";
  classification: TelegramClassification | "";
  category: TelegramCategory | "";
  direction: TelegramDirection | "";
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = {
  search: "",
  status: "",
  priority: "",
  classification: "",
  category: "",
  direction: "",
  from: "",
  to: "",
};

export default function TelegramsPage() {
  const [, setLocation] = useLocation();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [composerOpen, setComposerOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("compose") === "1";
  });
  const [excelOpen, setExcelOpen] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setFilters(current => ({ ...current, search: searchInput.trim() }));
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const queryInput = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.classification
        ? { classification: filters.classification }
        : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.direction ? { direction: filters.direction } : {}),
      ...(filters.from
        ? { from: new Date(`${filters.from}T00:00:00`).toISOString() }
        : {}),
      ...(filters.to
        ? { to: new Date(`${filters.to}T23:59:59`).toISOString() }
        : {}),
    }),
    [filters, page]
  );

  const listQuery = trpc.telegrams.list.useQuery(queryInput, {
    placeholderData: previous => previous,
  });

  const stats = listQuery.data?.stats;
  const items = listQuery.data?.items ?? [];
  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "" ||
    filters.priority !== "" ||
    filters.classification !== "" ||
    filters.category !== "" ||
    filters.direction !== "" ||
    filters.from !== "" ||
    filters.to !== "";

  return (
    <div className="mx-auto max-w-7xl space-y-5" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">سجل البرقيات</h1>
            <p className="text-sm text-muted-foreground">
              إنشاء ومتابعة البرقيات الصادرة والواردة وسير اعتمادها.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setExcelOpen(true)}
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button onClick={() => setComposerOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            برقية جديدة
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<FileText className="h-5 w-5" />}
          label="إجمالي البرقيات"
          value={stats?.total ?? 0}
          tone="bg-sky-50 text-sky-700"
        />
        <StatCard
          icon={<Timer className="h-5 w-5" />}
          label="قيد الإجراء"
          value={stats?.open ?? 0}
          tone="bg-amber-50 text-amber-700"
        />
        <StatCard
          icon={<ShieldAlert className="h-5 w-5" />}
          label="عاجلة"
          value={stats?.urgent ?? 0}
          tone="bg-rose-50 text-rose-700"
        />
        <StatCard
          icon={<Inbox className="h-5 w-5" />}
          label="سرية"
          value={stats?.secret ?? 0}
          tone="bg-indigo-50 text-indigo-700"
        />
      </div>

      <Card className="space-y-4 p-4">
        <div className="grid gap-3 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
              placeholder="ابحث في الموضوع أو النص أو الرقم أو المستلم..."
              className="pe-10"
            />
          </div>
          <Select
            value={filters.status || "all"}
            onValueChange={value => {
              setFilters(current => ({
                ...current,
                status: value === "all" ? "" : (value as TelegramStatus),
              }));
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {TELEGRAM_STATUSES.map(status => (
                <SelectItem key={status} value={status}>
                  {TELEGRAM_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.priority || "all"}
            onValueChange={value => {
              setFilters(current => ({
                ...current,
                priority: value === "all" ? "" : (value as TelegramPriority),
              }));
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="الأولوية" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأولويات</SelectItem>
              {TELEGRAM_PRIORITIES.map(priority => (
                <SelectItem key={priority} value={priority}>
                  {TELEGRAM_PRIORITY_LABELS[priority]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 lg:grid-cols-5">
          <Select
            value={filters.classification || "all"}
            onValueChange={value => {
              setFilters(current => ({
                ...current,
                classification:
                  value === "all" ? "" : (value as TelegramClassification),
              }));
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="التصنيف" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل التصنيفات</SelectItem>
              {TELEGRAM_CLASSIFICATIONS.map(value => (
                <SelectItem key={value} value={value}>
                  {TELEGRAM_CLASSIFICATION_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.category || "all"}
            onValueChange={value => {
              setFilters(current => ({
                ...current,
                category: value === "all" ? "" : (value as TelegramCategory),
              }));
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="التصنيف الموضوعي" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المواضيع</SelectItem>
              {TELEGRAM_CATEGORIES.map(value => (
                <SelectItem key={value} value={value}>
                  {TELEGRAM_CATEGORY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.direction || "all"}
            onValueChange={value => {
              setFilters(current => ({
                ...current,
                direction: value === "all" ? "" : (value as TelegramDirection),
              }));
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="الاتجاه" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">صادر ووارد</SelectItem>
              <SelectItem value="outgoing">صادر</SelectItem>
              <SelectItem value="incoming">وارد</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={filters.from}
            onChange={event => {
              setFilters(current => ({ ...current, from: event.target.value }));
              setPage(1);
            }}
            aria-label="من تاريخ"
          />
          <Input
            type="date"
            value={filters.to}
            onChange={event => {
              setFilters(current => ({ ...current, to: event.target.value }));
              setPage(1);
            }}
            aria-label="إلى تاريخ"
          />
        </div>
        {hasActiveFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setSearchInput("");
              setPage(1);
            }}
          >
            <FilterX className="h-4 w-4" />
            مسح الفلاتر
          </Button>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        {listQuery.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : listQuery.isError ? (
          <div className="space-y-3 p-8 text-center">
            <p className="text-sm text-destructive">
              تعذر تحميل البرقيات: {listQuery.error.message}
            </p>
            <Button variant="outline" onClick={() => listQuery.refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="space-y-3 p-10 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="font-medium">لا توجد برقيات مطابقة</p>
            <p className="text-sm text-muted-foreground">
              ابدأ بإنشاء برقية جديدة أو عدّل الفلاتر.
            </p>
            <Button onClick={() => setComposerOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              برقية جديدة
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الرقم</TableHead>
                  <TableHead className="text-right">الموضوع</TableHead>
                  <TableHead className="text-right">المستلم</TableHead>
                  <TableHead className="text-right">التصنيف</TableHead>
                  <TableHead className="text-right">الأولوية</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {telegramDisplaySerial(item)}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <Link
                        href={`/telegrams/${item.id}`}
                        className="line-clamp-1 font-medium hover:text-primary"
                      >
                        {item.subject}
                      </Link>
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {item.body}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate">
                      {item.recipient}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {TELEGRAM_CLASSIFICATION_LABELS[item.classification]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${priorityTone(item.priority)}`}
                      >
                        {TELEGRAM_PRIORITY_LABELS[item.priority]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${statusTone(item.status)}`}
                      >
                        {TELEGRAM_STATUS_LABELS[item.status]}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(item.createdAt, { dateOnly: true })}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        onClick={() => setLocation(`/telegrams/${item.id}`)}
                      >
                        عرض
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-sm">
          <span className="text-muted-foreground">
            {listQuery.data
              ? `${listQuery.data.total.toLocaleString("ar-SY")} برقية · صفحة ${listQuery.data.page}`
              : "—"}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(current => Math.max(1, current - 1))}
            >
              السابق
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!listQuery.data?.hasNext}
              onClick={() => setPage(current => current + 1)}
            >
              التالي
            </Button>
          </div>
        </div>
      </Card>

      <TelegramComposerDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onCreated={id => setLocation(`/telegrams/${id}`)}
      />
      <TelegramExcelDialog
        open={excelOpen}
        onOpenChange={setExcelOpen}
        filters={queryInput}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}
      >
        {icon}
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value.toLocaleString("ar-SY")}</p>
      </div>
    </Card>
  );
}
