import { useMemo, useState } from "react";
import { FilePlus2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { ownerTrpc as trpc } from "@/lib/ownerTrpc";
import {
  TELEGRAM_CATEGORIES,
  TELEGRAM_CATEGORY_LABELS,
  TELEGRAM_CLASSIFICATIONS,
  TELEGRAM_CLASSIFICATION_LABELS,
  TELEGRAM_PRIORITIES,
  TELEGRAM_PRIORITY_LABELS,
  type TelegramCategory,
  type TelegramClassification,
  type TelegramPriority,
} from "@shared/telegrams";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
};

export default function TelegramComposerDialog({
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const utils = trpc.useUtils();
  const targetsQuery = trpc.organizations.routingTargets.useQuery(undefined, {
    enabled: open,
  });
  const [subject, setSubject] = useState("");
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");
  const [classification, setClassification] =
    useState<TelegramClassification>("normal");
  const [priority, setPriority] = useState<TelegramPriority>("normal");
  const [category, setCategory] = useState<TelegramCategory>("administrative");
  const [destinationId, setDestinationId] = useState<string>("");
  const [originalSerial, setOriginalSerial] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID()
  );

  const targets = useMemo(() => targetsQuery.data ?? [], [targetsQuery.data]);

  const createMutation = trpc.telegrams.create.useMutation({
    onSuccess: async created => {
      toast.success(`تم إنشاء البرقية ${created.serialCode}`);
      await Promise.all([
        utils.telegrams.list.invalidate(),
        utils.dashboard.stats.invalidate(),
      ]);
      reset();
      onOpenChange(false);
      onCreated?.(created.id);
    },
    onError: error => toast.error(error.message),
  });

  function reset() {
    setSubject("");
    setRecipient("");
    setBody("");
    setClassification("normal");
    setPriority("normal");
    setCategory("administrative");
    setDestinationId("");
    setOriginalSerial("");
    setIdempotencyKey(crypto.randomUUID());
  }

  const canSubmit =
    subject.trim().length >= 2 &&
    recipient.trim().length >= 2 &&
    body.trim().length >= 3 &&
    !createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2 className="h-5 w-5 text-primary" />
            إنشاء برقية جديدة
          </DialogTitle>
          <DialogDescription>
            يُخصّص النظام رقم البرقية الرسمي تلقائياً عند الحفظ. الحقول المعلّمة
            بنجمة إلزامية.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="telegram-subject">الموضوع *</Label>
            <Input
              id="telegram-subject"
              value={subject}
              maxLength={255}
              onChange={event => setSubject(event.target.value)}
              placeholder="موضوع البرقية"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telegram-recipient">الجهة المرسل إليها *</Label>
            <Input
              id="telegram-recipient"
              value={recipient}
              maxLength={255}
              onChange={event => setRecipient(event.target.value)}
              placeholder="اسم الجهة أو الشخص المستلم"
            />
          </div>
          <div className="space-y-2">
            <Label>جهة الإحالة</Label>
            <Select
              value={destinationId || "none"}
              onValueChange={value =>
                setDestinationId(value === "none" ? "" : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر جهة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون إحالة فورية</SelectItem>
                {targets.map(target => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {targetsQuery.isError ? (
              <p className="text-xs text-destructive">
                تعذر تحميل جهات الإحالة المتاحة.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>التصنيف *</Label>
            <Select
              value={classification}
              onValueChange={value =>
                setClassification(value as TelegramClassification)
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
            <Label>الأولوية *</Label>
            <Select
              value={priority}
              onValueChange={value => setPriority(value as TelegramPriority)}
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
            <Label>التصنيف الموضوعي *</Label>
            <Select
              value={category}
              onValueChange={value => setCategory(value as TelegramCategory)}
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
          <div className="space-y-2">
            <Label htmlFor="telegram-original-serial">
              رقم برقية أصلي (اختياري)
            </Label>
            <Input
              id="telegram-original-serial"
              value={originalSerial}
              maxLength={120}
              onChange={event => setOriginalSerial(event.target.value)}
              placeholder="للسجلات الورقية المستوردة"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="telegram-body">نص البرقية *</Label>
            <Textarea
              id="telegram-body"
              value={body}
              rows={8}
              maxLength={20000}
              onChange={event => setBody(event.target.value)}
              placeholder="اكتب نص البرقية الرسمي..."
            />
            <p className="text-xs text-muted-foreground">
              {body.length.toLocaleString("ar-SY")} / 20,000 محرف
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              createMutation.mutate({
                subject: subject.trim(),
                recipient: recipient.trim(),
                body: body.trim(),
                classification,
                priority,
                category,
                idempotencyKey,
                ...(destinationId
                  ? { recipientOrganizationId: destinationId }
                  : {}),
                ...(originalSerial.trim()
                  ? { originalSerial: originalSerial.trim() }
                  : {}),
              })
            }
          >
            <Send className="me-2 h-4 w-4" />
            {createMutation.isPending ? "جارٍ الحفظ..." : "حفظ البرقية"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
