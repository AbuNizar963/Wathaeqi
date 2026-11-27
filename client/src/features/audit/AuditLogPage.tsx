import { useState } from "react";
import {
  Archive,
  FilePlus2,
  FileText,
  History,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ownerTrpc as trpc } from "@/lib/ownerTrpc";

const ACTION_LABELS: Record<string, string> = {
  "document.created": "إنشاء وثيقة",
  "document.updated": "تعديل وثيقة",
  "document.print": "طباعة وثيقة",
  "document.issue": "إصدار وثيقة",
  "document.archive": "أرشفة وثيقة",
  "platform.document_settings.update": "تعديل إعدادات الوثيقة",
  "user.created": "إنشاء مستخدم",
  "user.activated": "تفعيل مستخدم",
  "user.deactivated": "إيقاف مستخدم",
  "user.role_changed": "تغيير صلاحية مستخدم",
  "contact.created": "إضافة جهة اتصال",
  "contact.updated": "تعديل جهة اتصال",
  "contact.deleted": "حذف جهة اتصال",
};

const ACTION_FILTERS = [
  ["", "كل الإجراءات"],
  ...Object.entries(ACTION_LABELS),
] as const;

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replaceAll(".", " · ");
}

function actionIcon(action: string) {
  if (action.includes("print")) return Printer;
  if (action.includes("archive")) return Archive;
  if (action.includes("settings")) return Settings2;
  if (action.startsWith("user.")) return UserCog;
  if (action.startsWith("contact.")) return Users;
  if (action.includes("created")) return FilePlus2;
  return FileText;
}

function formatAuditDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "توقيت غير متاح";
  return new Intl.DateTimeFormat("ar", {
    dateStyle: "medium",
    timeStyle: "medium",
    numberingSystem: "latn",
  }).format(date);
}

function metadataSummary(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as Record<string, unknown>;
  const title = typeof metadata.title === "string" ? metadata.title : null;
  const serial =
    typeof metadata.serialCode === "string" ? metadata.serialCode : null;
  const username =
    typeof metadata.username === "string" ? metadata.username : null;
  const role = typeof metadata.role === "string" ? metadata.role : null;
  const name = typeof metadata.name === "string" ? metadata.name : null;
  return (
    [title, serial, name, username ? `@${username}` : null, role]
      .filter(Boolean)
      .join(" · ") || null
  );
}

function deviceLabel(value: string): string {
  switch (value) {
    case "mobile":
      return "هاتف";
    case "tablet":
      return "جهاز لوحي";
    case "desktop":
      return "كمبيوتر";
    default:
      return "جهاز غير محدد";
  }
}

export default function AuditLogPage() {
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState<
    "all" | "document" | "user" | "contact" | "settings"
  >("all");
  const [action, setAction] = useState("");
  const query = trpc.workspace.audit.list.useQuery(
    {
      limit: 100,
      search: search.trim() || undefined,
      entityType,
      action: action || undefined,
    },
    { staleTime: 15_000 }
  );
  const events = query.data?.events ?? [];
  const hasFilters = Boolean(search.trim() || action || entityType !== "all");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-card text-primary">
            <History className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              سجل الحركات
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              سجل زمني للإنشاء والتعديل والطباعة والإصدار والإعدادات
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw
            className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
          />
          تحديث السجل
        </Button>
      </header>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium">الأحداث المسجلة</p>
            <p className="text-xs text-muted-foreground">
              {hasFilters
                ? `${(query.data?.total ?? 0).toLocaleString("en-US")} نتيجة مطابقة من أصل ${(query.data?.availableTotal ?? 0).toLocaleString("en-US")}`
                : "أحدث 100 حركة محفوظة في Appwrite"}
            </p>
          </div>
        </div>
        <p className="text-2xl font-semibold tabular-nums" dir="ltr">
          {(query.data?.total ?? 0).toLocaleString("en-US")}
        </p>
      </Card>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="min-h-11 pr-9"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="ابحث باسم المستخدم أو الإجراء أو الوثيقة..."
          aria-label="البحث في سجل الحركات"
        />
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="grid min-w-[13rem] flex-1 gap-1.5 text-sm">
          <span className="font-medium">نوع السجل</span>
          <select
            className="h-11 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            value={entityType}
            onChange={event =>
              setEntityType(event.target.value as typeof entityType)
            }
            aria-label="تصفية سجل التدقيق حسب نوع السجل"
          >
            <option value="all">كل السجلات</option>
            <option value="document">الوثائق</option>
            <option value="user">المستخدمون</option>
            <option value="contact">جهات الاتصال</option>
            <option value="settings">إعدادات المنصة</option>
          </select>
        </label>
        <label className="grid min-w-[13rem] flex-1 gap-1.5 text-sm">
          <span className="font-medium">الإجراء</span>
          <select
            className="h-11 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            value={action}
            onChange={event => setAction(event.target.value)}
            aria-label="تصفية سجل التدقيق حسب الإجراء"
          >
            {ACTION_FILTERS.map(([value, label]) => (
              <option key={value || "all"} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => {
              setSearch("");
              setAction("");
              setEntityType("all");
            }}
          >
            مسح المرشحات
          </Button>
        ) : null}
      </Card>

      {query.isLoading ? (
        <Card
          className="p-8 text-center text-sm text-muted-foreground"
          role="status"
        >
          جارٍ تحميل سجل الحركات...
        </Card>
      ) : query.isError ? (
        <Card className="space-y-3 p-6 text-center" role="alert">
          <p className="font-semibold">تعذر تحميل سجل الحركات</p>
          <p className="text-sm text-muted-foreground">{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            إعادة المحاولة
          </Button>
        </Card>
      ) : events.length === 0 ? (
        <Card className="space-y-2 border-dashed p-10 text-center">
          <History className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="font-semibold">لا توجد حركات مطابقة</p>
          <p className="text-sm text-muted-foreground">
            ستظهر هنا العمليات الجديدة التي ينفذها المستخدمون.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map(event => {
            const Icon = actionIcon(event.action);
            const summary = metadataSummary(event.metadata);
            return (
              <Card
                key={event.id}
                className="min-w-0 p-4 transition-colors hover:border-primary/25 sm:p-5"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="font-semibold">
                        {actionLabel(event.action)}
                      </h2>
                      <Badge variant="outline" className="font-normal">
                        {event.entityType === "document"
                          ? "وثيقة"
                          : event.entityType === "user"
                            ? "مستخدم"
                            : event.entityType === "contact"
                              ? "جهة اتصال"
                              : "إعدادات"}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {event.actorName}
                      {event.entityId ? ` · رقم السجل: ${event.entityId}` : ""}
                    </p>
                    {summary ? (
                      <p className="break-words text-sm">{summary}</p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <time dateTime={event.createdAt} dir="ltr">
                        {formatAuditDate(event.createdAt)}
                      </time>
                      <span>{deviceLabel(event.deviceType)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        السجل متاح لمالك المنصة فقط، وتُحفظ تفاصيله في الخادم ولا يمكن تعديلها
        من الواجهة.
      </p>
    </div>
  );
}
