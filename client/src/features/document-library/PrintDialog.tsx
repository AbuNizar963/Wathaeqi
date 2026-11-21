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
import type { PagesPerSheet } from "./types";

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
  const [pagesPerSheet, setPagesPerSheet] = useState<PagesPerSheet>(1);
  const [imageTiles, setImageTiles] = useState<1 | 4 | 9 | 16>(1);
  const kind = fileKind(fileName, mimeType);
  const canPrint = kind !== null;
  const printButtonLabel =
    kind === "image" ? "طباعة الصورة" : "طباعة من الملف الأصلي";

  useEffect(() => {
    if (open) setError(null);
  }, [open, url, fileName, mimeType]);

  const handlePrint = async () => {
    setLoading(true);
    setError(null);
    try {
      await openOriginalPrintWindow({
        url,
        fileName,
        mimeType,
        pagesPerSheet,
        imageTiles,
      });
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
          {canPrint ? (
            <FilePreview url={url} fileName={fileName} mimeType={mimeType} />
          ) : (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              صيغة الملف غير مدعومة للطباعة الأصلية.
            </p>
          )}
          {kind === "image" ? (
            <fieldset className="rounded-lg border bg-muted/30 px-3 py-3">
              <legend className="px-1 text-sm font-medium">
                تقسيم الصورة على أوراق A4
              </legend>
              <div className="grid grid-cols-4 gap-2">
                {([1, 4, 9, 16] as const).map(value => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={imageTiles === value}
                    onClick={() => setImageTiles(value)}
                    className={`rounded-md border px-2 py-2 text-xs font-semibold transition ${
                      imageTiles === value
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {value === 1 ? "ورقة واحدة" : `${value} أوراق`}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                تُقسّم الصورة إلى أجزاء متجاورة؛ اطبع الأوراق ثم رتّبها لتكوين
                الصورة كاملة.
              </p>
            </fieldset>
          ) : (
            <fieldset className="rounded-lg border bg-muted/30 px-3 py-3">
              <legend className="px-1 text-sm font-medium">
                عدد الصفحات في الورقة
              </legend>
              <div className="grid grid-cols-5 gap-2" role="radiogroup">
                {[1, 2, 4, 6, 8].map(value => {
                  const selected = pagesPerSheet === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPagesPerSheet(value as PagesPerSheet)}
                      className={`rounded-md border px-2 py-2 text-xs font-semibold transition ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      {value} {value === 1 ? "صفحة" : "صفحات"}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                يُستخدم الملف الأصلي، ويُنشأ توزيع A4 فقط عند اختيار أكثر من
                صفحة.
              </p>
            </fieldset>
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
            disabled={loading || !canPrint}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Printer className="size-4" />
            )}
            {printButtonLabel}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
