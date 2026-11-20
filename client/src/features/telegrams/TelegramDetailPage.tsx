import { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileUp,
  History,
  MapPin,
  Paperclip,
  Printer,
  RefreshCcw,
  Send,
  Trash2,
  Workflow,
} from "lucide-react";
import { Link } from "wouter";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ownerTrpc as trpc } from "@/lib/ownerTrpc";
import {
  TELEGRAM_CATEGORIES,
  TELEGRAM_CATEGORY_LABELS,
  TELEGRAM_CLASSIFICATIONS,
  TELEGRAM_CLASSIFICATION_LABELS,
  TELEGRAM_PRIORITIES,
  TELEGRAM_PRIORITY_LABELS,
  TELEGRAM_ROUTE_STATUS_LABELS,
  TELEGRAM_STATUS_LABELS,
  type TelegramCategory,
  type TelegramClassification,
  type TelegramPriority,
  type TelegramStatus,
} from "@shared/telegrams";
import {
  downloadBase64File,
  formatDateTime,
  priorityTone,
  readFileAsBase64,
  statusTone,
  telegramDisplaySerial,
} from "./telegramUi";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export default function TelegramDetailPage({ id }: { id: string }) {
  const utils = trpc.useUtils();
  const telegramId = Number(id);
  const detailQuery = trpc.telegrams.get.useQuery(
    { id: telegramId },
    { enabled: Number.isSafeInteger(telegramId) && telegramId > 0 }
  );
  const versionsQuery = trpc.telegrams.versions.useQuery(
    { telegramId },
    { enabled: Number.isSafeInteger(telegramId) }
  );
  const actionsQuery = trpc.telegrams.actions.useQuery(
    { telegramId },
    { enabled: Number.isSafeInteger(telegramId) }
  );
  const attachmentsQuery = trpc.telegrams.attachments.useQuery(
    { telegramId },
    { enabled: Number.isSafeInteger(telegramId) }
  );
  const routesQuery = trpc.telegrams.routes.useQuery(
    { telegramId },
    { enabled: Number.isSafeInteger(telegramId) }
  );
  const targetsQuery = trpc.organizations.routingTargets.useQuery();
  const contextQuery = trpc.organizations.context.useQuery();

  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    subject: "",
    recipient: "",
    body: "",
    classification: "normal" as TelegramClassification,
    priority: "normal" as TelegramPriority,
    category: "administrative" as TelegramCategory,
    originalSerial: "",
  });
  const [reasonDialog, setReasonDialog] = useState<{
    toStatus: TelegramStatus;
    title: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeTarget, setRouteTarget] = useState("");
  const [routeNote, setRouteNote] = useState("");
  const [reissueOpen, setReissueOpen] = useState(false);
  const [reissueReason, setReissueReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const invalidate = async () => {
    await Promise.all([
      utils.telegrams.get.invalidate({ id: telegramId }),
      utils.telegrams.versions.invalidate({ telegramId }),
      utils.telegrams.actions.invalidate({ telegramId }),
      utils.telegrams.attachments.invalidate({ telegramId }),
      utils.telegrams.routes.invalidate({ telegramId }),
      utils.telegrams.list.invalidate(),
      utils.dashboard.stats.invalidate(),
    ]);
  };

  const transitionMutation = trpc.telegrams.transition.useMutation({
    onSuccess: async () => {
      toast.success("تم تحديث حالة البرقية");
      setReasonDialog(null);
      setReason("");
      await invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const updateMutation = trpc.telegrams.update.useMutation({
    onSuccess: async () => {
      toast.success("تم حفظ التعديلات");
      setEditing(false);
      await invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const routeMutation = trpc.telegrams.route.useMutation({
    onSuccess: async () => {
      toast.success("تمت إحالة البرقية");
      setRouteOpen(false);
      setRouteTarget("");
      setRouteNote("");
      await invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const approveRouteMutation = trpc.telegrams.approveRoute.useMutation({
    onSuccess: async () => {
      toast.success("تم تسجيل قرار الاعتماد");
      await invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const receiveRouteMutation = trpc.telegrams.receiveRoute.useMutation({
    onSuccess: async result => {
      toast.success(
        result.incomingSerialCode
          ? `تم استلام البرقية برقم وارد ${result.incomingSerialCode}`
          : "تم استلام البرقية"
      );
      await invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const decideRouteMutation = trpc.telegrams.decideRouteAsReceiver.useMutation({
    onSuccess: async () => {
      toast.success("تم تسجيل قرار الجهة المستلمة");
      await invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const reissueMutation = trpc.telegrams.reissue.useMutation({
    onSuccess: async result => {
      toast.success(`تم إنشاء الإصدار ${result.versionNumber}`);
      setReissueOpen(false);
      setReissueReason("");
      await invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const deleteMutation = trpc.telegrams.delete.useMutation({
    onSuccess: async () => {
      toast.success("تم حذف البرقية نهائياً");
      await utils.telegrams.list.invalidate();
      window.location.href = "/telegrams";
    },
    onError: error => toast.error(error.message),
  });

  const telegram = detailQuery.data;
  const settingsQuery = trpc.departmentSettings.get.useQuery(undefined, {
    enabled: Boolean(telegram),
  });

  const startEditing = () => {
    if (!telegram) return;
    setEditValues({
      subject: telegram.subject,
      recipient: telegram.recipient,
      body: telegram.body,
      classification: telegram.classification,
      priority: telegram.priority,
      category: telegram.category,
      originalSerial: telegram.originalSerial ?? "",
    });
    setEditing(true);
  };

  const targets = useMemo(() => targetsQuery.data ?? [], [targetsQuery.data]);

  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center" dir="rtl">
        <p className="text-destructive">معرّف البرقية غير صالح.</p>
        <Link href="/telegrams" className="text-primary underline">
          العودة إلى السجل
        </Link>
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-2" dir="rtl">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (detailQuery.isError || !telegram) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-8 text-center" dir="rtl">
        <p className="text-destructive">
          {detailQuery.error?.message ?? "البرقية غير موجودة"}
        </p>
        <Link href="/telegrams" className="text-primary underline">
          العودة إلى السجل
        </Link>
      </div>
    );
  }

  const canAct = contextQuery.data?.canManageTelegrams === true;

  return (
    <div className="mx-auto max-w-6xl space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/telegrams"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" />
          سجل البرقيات
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="me-2 h-4 w-4" />
            طباعة
          </Button>
          {telegram.canEdit && canAct ? (
            <Button
              variant="outline"
              size="sm"
              onClick={startEditing}
              disabled={editing}
            >
              تعديل المحتوى
            </Button>
          ) : null}
          {canAct &&
          ["approved", "completed", "forwarded", "archived"].includes(
            telegram.status
          ) ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReissueOpen(true)}
            >
              <RefreshCcw className="me-2 h-4 w-4" />
              إعادة إصدار
            </Button>
          ) : null}
          {canAct &&
          ["draft", "approved", "submitted"].includes(telegram.status) ? (
            <Button
              size="sm"
              onClick={() => {
                setRouteTarget(targets[0]?.id ?? "");
                setRouteOpen(true);
              }}
            >
              <Send className="me-2 h-4 w-4" />
              إحالة
            </Button>
          ) : null}
          {telegram.canDelete ? (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="me-2 h-4 w-4" />
              حذف
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-mono text-sm text-muted-foreground">
              {telegramDisplaySerial(telegram)}
            </p>
            <h1 className="text-2xl font-bold leading-snug">
              {telegram.subject}
            </h1>
            <p className="text-sm text-muted-foreground">
              من {telegram.senderOrganizationName ?? "—"} إلى{" "}
              {telegram.currentOrganizationName ?? "—"} · المستلم:{" "}
              {telegram.recipient}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-md border px-2.5 py-1 text-xs ${statusTone(telegram.status)}`}
            >
              {TELEGRAM_STATUS_LABELS[telegram.status]}
            </span>
            <span
              className={`rounded-md border px-2.5 py-1 text-xs ${priorityTone(telegram.priority)}`}
            >
              {TELEGRAM_PRIORITY_LABELS[telegram.priority]}
            </span>
            <Badge variant="outline">
              {TELEGRAM_CLASSIFICATION_LABELS[telegram.classification]}
            </Badge>
            <Badge variant="secondary">
              {TELEGRAM_CATEGORY_LABELS[telegram.category]}
            </Badge>
          </div>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <Meta
            label="تاريخ الإنشاء"
            value={formatDateTime(telegram.createdAt)}
          />
          <Meta
            label="تاريخ البرقية"
            value={formatDateTime(telegram.telegramDate)}
          />
          <Meta label="المنشئ" value={telegram.creatorName} />
          <Meta label="الإصدار الحالي" value={String(telegram.revision)} />
          <Meta
            label="الرقم التنظيمي"
            value={telegram.organizationSerialCode ?? "—"}
          />
          <Meta label="آخر تحديث" value={formatDateTime(telegram.updatedAt)} />
        </div>

        {telegram.workflowReason ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            ملاحظة سير العمل: {telegram.workflowReason}
          </div>
        ) : null}
      </Card>

      {canAct && telegram.nextStatuses.length > 0 ? (
        <Card className="flex flex-row flex-wrap items-center justify-start gap-2 p-4 print:hidden">
          <span className="text-sm font-medium">إجراءات الحالة:</span>
          {telegram.nextStatuses.map(status => (
            <Button
              key={status}
              size="sm"
              variant={
                status === "rejected" || status === "returned"
                  ? "outline"
                  : "default"
              }
              className={
                status === "rejected" || status === "returned"
                  ? "text-destructive"
                  : ""
              }
              onClick={() => {
                if (status === "returned" || status === "rejected") {
                  setReason("");
                  setReasonDialog({
                    toStatus: status,
                    title: TELEGRAM_STATUS_LABELS[status],
                  });
                  return;
                }
                transitionMutation.mutate({
                  id: telegramId,
                  toStatus: status,
                  expectedRevision: telegram.revision,
                });
              }}
              disabled={transitionMutation.isPending}
            >
              {TELEGRAM_STATUS_LABELS[status]}
            </Button>
          ))}
        </Card>
      ) : null}

      <Tabs defaultValue="content" className="space-y-3">
        <TabsList className="print:hidden">
          <TabsTrigger value="content">المحتوى</TabsTrigger>
          <TabsTrigger value="workflow">سير العمل</TabsTrigger>
          <TabsTrigger value="versions">الإصدارات</TabsTrigger>
          <TabsTrigger value="attachments">المرفقات</TabsTrigger>
          <TabsTrigger value="routes">الإحالات</TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <Card className="space-y-4 p-5">
            {editing ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>الموضوع</Label>
                    <Input
                      value={editValues.subject}
                      onChange={event =>
                        setEditValues(current => ({
                          ...current,
                          subject: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>المستلم</Label>
                    <Input
                      value={editValues.recipient}
                      onChange={event =>
                        setEditValues(current => ({
                          ...current,
                          recipient: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>الرقم الأصلي</Label>
                    <Input
                      value={editValues.originalSerial}
                      onChange={event =>
                        setEditValues(current => ({
                          ...current,
                          originalSerial: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>التصنيف</Label>
                    <Select
                      value={editValues.classification}
                      onValueChange={value =>
                        setEditValues(current => ({
                          ...current,
                          classification: value as TelegramClassification,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TELEGRAM_CLASSIFICATIONS.map(value => (
                          <SelectItem key={value} value={value}>
                            {TELEGRAM_CLASSIFICATION_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>الأولوية</Label>
                    <Select
                      value={editValues.priority}
                      onValueChange={value =>
                        setEditValues(current => ({
                          ...current,
                          priority: value as TelegramPriority,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TELEGRAM_PRIORITIES.map(value => (
                          <SelectItem key={value} value={value}>
                            {TELEGRAM_PRIORITY_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>التصنيف الموضوعي</Label>
                    <Select
                      value={editValues.category}
                      onValueChange={value =>
                        setEditValues(current => ({
                          ...current,
                          category: value as TelegramCategory,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TELEGRAM_CATEGORIES.map(value => (
                          <SelectItem key={value} value={value}>
                            {TELEGRAM_CATEGORY_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>النص</Label>
                  <Textarea
                    rows={10}
                    value={editValues.body}
                    onChange={event =>
                      setEditValues(current => ({
                        ...current,
                        body: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() =>
                      updateMutation.mutate({
                        id: telegramId,
                        expectedRevision: telegram.revision,
                        subject: editValues.subject.trim(),
                        recipient: editValues.recipient.trim(),
                        body: editValues.body.trim(),
                        classification: editValues.classification,
                        priority: editValues.priority,
                        category: editValues.category,
                        originalSerial:
                          editValues.originalSerial.trim() || null,
                      })
                    }
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? "جارٍ الحفظ..." : "حفظ"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setEditing(false)}
                    disabled={updateMutation.isPending}
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <article className="whitespace-pre-wrap break-words rounded-xl border bg-muted/20 p-4 leading-8">
                  {telegram.body}
                </article>
                {telegram.gpsLatitude && telegram.gpsLongitude ? (
                  <a
                    className="inline-flex items-center gap-1 text-sm text-primary underline"
                    href={`https://maps.google.com/?q=${telegram.gpsLatitude},${telegram.gpsLongitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MapPin className="h-4 w-4" />
                    الموقع الجغرافي المرفق
                  </a>
                ) : null}
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="workflow">
          <Card className="p-5">
            {actionsQuery.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (actionsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لا توجد إجراءات مسجلة.
              </p>
            ) : (
              <ol className="space-y-3">
                {(actionsQuery.data ?? []).map(action => (
                  <li
                    key={action.id}
                    className="flex gap-3 rounded-xl border p-3 text-sm"
                  >
                    <span className="mt-0.5 text-primary">
                      <Workflow className="h-4 w-4" />
                    </span>
                    <div className="space-y-1">
                      <p className="font-medium">
                        {action.action}
                        {action.toStatus
                          ? ` → ${TELEGRAM_STATUS_LABELS[action.toStatus]}`
                          : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        المستخدم {action.actorUserId} ·{" "}
                        {formatDateTime(action.createdAt, {
                          timeZone: settingsQuery.data?.timezone,
                        })}
                      </p>
                      {action.reason ? <p>{action.reason}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="versions">
          <Card className="p-5">
            {versionsQuery.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (versionsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد إصدارات.</p>
            ) : (
              <ul className="space-y-3">
                {(versionsQuery.data ?? []).map(version => (
                  <li
                    key={version.id}
                    className="rounded-xl border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        الإصدار {version.versionNumber} · {version.changeReason}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(version.createdAt, {
                          timeZone: settingsQuery.data?.timezone,
                        })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="attachments">
          <Card className="space-y-4 p-5">
            {canAct ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="file"
                  className="max-w-sm"
                  disabled={uploading}
                  onChange={async event => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    if (file.size > MAX_ATTACHMENT_BYTES) {
                      toast.error("حجم المرفق يتجاوز 10 ميغابايت.");
                      return;
                    }
                    setUploading(true);
                    try {
                      const { base64 } = await readFileAsBase64(file);
                      await utils.client.telegrams.uploadAttachment.mutate({
                        telegramId,
                        fileName: file.name,
                        contentType: file.type || "application/octet-stream",
                        base64,
                      });
                      toast.success("تم رفع المرفق");
                      await utils.telegrams.attachments.invalidate({
                        telegramId,
                      });
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "تعذر رفع المرفق"
                      );
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  الحد الأقصى 10 ميغابايت · PDF، صور، Word، Excel
                </span>
              </div>
            ) : null}
            {attachmentsQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (attachmentsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مرفقات.</p>
            ) : (
              <ul className="space-y-2">
                {(attachmentsQuery.data ?? []).map(attachment => (
                  <li
                    key={attachment.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      {attachment.originalName}
                      <span className="text-xs text-muted-foreground">
                        {(attachment.sizeBytes / 1024).toFixed(1)} كيلوبايت
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const file =
                            await utils.client.telegrams.downloadAttachment.query(
                              { attachmentId: attachment.id }
                            );
                          downloadBase64File(
                            file.base64,
                            file.fileName,
                            file.contentType
                          );
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "تعذر تنزيل المرفق"
                          );
                        }
                      }}
                    >
                      <Download className="me-2 h-4 w-4" />
                      تنزيل
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="routes">
          <Card className="space-y-3 p-5">
            {routesQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (routesQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد إحالات.</p>
            ) : (
              (routesQuery.data ?? []).map(route => {
                const isReceiver =
                  route.toOrganizationId === contextQuery.data?.organizationId;
                return (
                  <div
                    key={route.id}
                    className="space-y-2 rounded-xl border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {route.routeSerialCode ?? route.id} · إلى الجهة{" "}
                        {route.toOrganizationName ?? route.toOrganizationId}
                      </span>
                      <div className="flex gap-2">
                        <Badge variant="outline">
                          {TELEGRAM_ROUTE_STATUS_LABELS[route.status]}
                        </Badge>
                        {route.approvalStatus === "pending" ? (
                          <Badge
                            className="bg-amber-100 text-amber-900"
                            variant="outline"
                          >
                            بانتظار الاعتماد
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    {route.note ? <p>{route.note}</p> : null}
                    {route.incomingSerialCode ? (
                      <p className="text-xs text-muted-foreground">
                        رقم الوارد: {route.incomingSerialCode}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 print:hidden">
                      {route.approvalStatus === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() =>
                              approveRouteMutation.mutate({
                                routeId: route.id,
                                decision: "approved",
                              })
                            }
                            disabled={approveRouteMutation.isPending}
                          >
                            <CheckCircle2 className="me-2 h-4 w-4" />
                            اعتماد الإحالة
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() =>
                              approveRouteMutation.mutate({
                                routeId: route.id,
                                decision: "rejected",
                                reason: "رفض من السلطة الأعلى",
                              })
                            }
                            disabled={approveRouteMutation.isPending}
                          >
                            رفض
                          </Button>
                        </>
                      ) : null}
                      {isReceiver && route.status === "sent" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            receiveRouteMutation.mutate({ routeId: route.id })
                          }
                          disabled={receiveRouteMutation.isPending}
                        >
                          تسجيل الاستلام
                        </Button>
                      ) : null}
                      {isReceiver &&
                      (route.status === "sent" ||
                        route.status === "received") &&
                      route.receiverDecisionStatus === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() =>
                              decideRouteMutation.mutate({
                                routeId: route.id,
                                decision: "accepted",
                              })
                            }
                            disabled={decideRouteMutation.isPending}
                          >
                            قبول وتنفيذ
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() =>
                              decideRouteMutation.mutate({
                                routeId: route.id,
                                decision: "rejected",
                                reason: "غير مختص بالجهة",
                              })
                            }
                            disabled={decideRouteMutation.isPending}
                          >
                            رفض وإعادة
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={reasonDialog !== null}
        onOpenChange={open => {
          if (!open) setReasonDialog(null);
        }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{reasonDialog?.title ?? "سبب الإجراء"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="transition-reason">السبب (إلزامي)</Label>
            <Textarea
              id="transition-reason"
              value={reason}
              rows={4}
              onChange={event => setReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={
                reason.trim().length < 3 || transitionMutation.isPending
              }
              onClick={() => {
                if (!reasonDialog) return;
                transitionMutation.mutate({
                  id: telegramId,
                  toStatus: reasonDialog.toStatus,
                  reason: reason.trim(),
                  expectedRevision: telegram.revision,
                });
              }}
            >
              تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={routeOpen} onOpenChange={setRouteOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إحالة البرقية</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>الجهة المستلمة</Label>
              <Select value={routeTarget} onValueChange={setRouteTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر جهة" />
                </SelectTrigger>
                <SelectContent>
                  {targets.map(target => (
                    <SelectItem key={target.id} value={target.id}>
                      {target.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ملاحظة الإحالة</Label>
              <Textarea
                rows={3}
                value={routeNote}
                onChange={event => setRouteNote(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!routeTarget || routeMutation.isPending}
              onClick={() =>
                routeMutation.mutate({
                  id: telegramId,
                  toOrganizationId: routeTarget,
                  ...(routeNote.trim() ? { note: routeNote.trim() } : {}),
                })
              }
            >
              <FileUp className="me-2 h-4 w-4" />
              إحالة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reissueOpen} onOpenChange={setReissueOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إعادة إصدار البرقية</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>سبب إعادة الإصدار</Label>
            <Textarea
              rows={3}
              value={reissueReason}
              onChange={event => setReissueReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={
                reissueReason.trim().length < 3 || reissueMutation.isPending
              }
              onClick={() =>
                reissueMutation.mutate({
                  id: telegramId,
                  reason: reissueReason.trim(),
                })
              }
            >
              إنشاء إصدار جديد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف البرقية نهائياً؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف البرقية وكل إصداراتها ومرفقاتها وإحالاتها. لا يمكن
              التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate({ id: telegramId })}
            >
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="hidden print:block">
        <p className="text-xs text-muted-foreground">
          {telegram.serialCode} · {formatDateTime(telegram.createdAt)}
        </p>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
