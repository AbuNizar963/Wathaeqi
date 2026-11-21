import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import FilePreview from "./FilePreview";
import { openOriginalPrintWindow } from "./printOriginal";
import { fileKind } from "./types";

export default function PrintDialog({
  open,
  onOpenChange,
  title,
  url,
  fileName,
  mimeType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  url: string;
  fileName: string;
  mimeType: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = fileKind(fileName, mimeType);

  useEffect(() => {
    if (open) setError(null);
  }, [open, url, fileName, mimeType]);

  const handlePrint = async () => {
    setLoading(true);
    setError(null);
    try {
      await openOriginalPrintWindow({ url, fileName, mimeType });
    } catch (printError) {
      setError(
        printError instanceof Error
          ? printError.message
          : "تعذر فتح نافذة الطباعة"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] max-w-5xl overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="text-right">طباعة الوثيقة</DialogTitle>
          <DialogDescription className="text-right">
            {title} — تتم الطباعة من الملف الأصلي للحفاظ على الجداول والصور
            والخطوط والتنسيق.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {kind === "pdf" || kind === "word" ? (
            <FilePreview url={url} fileName={fileName} mimeType={mimeType} />
          ) : (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              صيغة الملف غير مدعومة للطباعة الأصلية.
            </p>
          )}
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            onClick={() => void handlePrint()}
            disabled={loading || (kind !== "pdf" && kind !== "word")}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Printer className="size-4" />
            )}
            طباعة من الملف الأصلي
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
