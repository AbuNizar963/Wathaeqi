import { useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { buildPrintHtml, groupPages, openPrintWindow } from "./printSheets";
import { renderDocumentPages } from "./renderPages";
import type { PagesPerSheet, PrintOptions, SourcePage } from "./types";

const LAYOUTS: { value: PagesPerSheet; label: string; hint: string }[] = [
  { value: 1, label: "صفحة واحدة", hint: "أقصى وضوح" },
  { value: 2, label: "صفحتان", hint: "توفير الورق" },
  { value: 4, label: "٤ صفحات", hint: "أرشيف مضغوط" },
];

function LayoutGlyph({ value }: { value: PagesPerSheet }) {
  return (
    <span className={`layout-glyph layout-glyph-${value}`} aria-hidden="true">
      {Array.from({ length: value }).map((_, index) => (
        <span key={index} />
      ))}
    </span>
  );
}

function SheetThumb({
  pages,
  perSheet,
  index,
  total,
}: {
  pages: SourcePage[];
  perSheet: PagesPerSheet;
  index: number;
  total: number;
}) {
  return (
    <div className="w-[150px] shrink-0">
      <div
        className="relative mx-auto flex w-full flex-col gap-[2px] border border-slate-300 bg-white p-[4px] shadow-sm"
        style={{ aspectRatio: "210 / 297" }}
      >
        <div
          className="grid min-h-0 flex-1 gap-[2px]"
          style={{
            gridTemplateColumns: perSheet === 4 ? "1fr 1fr" : "1fr",
            gridTemplateRows: perSheet === 1 ? "1fr" : "1fr 1fr",
          }}
        >
          {pages.map((page, pageIndex) => (
            <div
              key={pageIndex}
              className="flex min-h-0 items-center justify-center overflow-hidden border border-slate-200"
            >
              <img
                src={page.dataUrl}
                alt=""
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ))}
        </div>
        <span className="pt-[2px] text-center text-[7px] text-slate-400">
          {index + 1} / {total}
        </span>
      </div>
    </div>
  );
}

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
  const [pages, setPages] = useState<SourcePage[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<PrintOptions>({
    pagesPerSheet: 1,
    marginMm: 8,
    headerText: "",
    footerText: "",
    showPageNumbers: true,
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPages([]);
    setProgress({ done: 0, total: 0 });
    renderDocumentPages({
      url,
      fileName,
      mimeType,
      onProgress: (done, total) => {
        if (!cancelled) setProgress({ done, total });
      },
    })
      .then(result => {
        if (!cancelled) setPages(result);
      })
      .catch(renderError => {
        if (!cancelled) {
          setError(
            renderError instanceof Error
              ? renderError.message
              : "تعذر تجهيز صفحات الوثيقة للطباعة"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, url, fileName, mimeType]);

  const sheets = useMemo(
    () => groupPages(pages, options.pagesPerSheet),
    [pages, options.pagesPerSheet]
  );

  const handlePrint = async () => {
    try {
      await openPrintWindow(buildPrintHtml(pages, options));
    } catch (printError) {
      setError(
        printError instanceof Error
          ? printError.message
          : "تعذر فتح نافذة الطباعة"
      );
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
            {title} — اختر توزيع الصفحات على الورقة ثم اطبع أو احفظ PDF من نافذة
            الطباعة.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">توزيع الصفحات على الورقة</Label>
              <div className="grid grid-cols-3 gap-2">
                {LAYOUTS.map(layout => (
                  <button
                    key={layout.value}
                    type="button"
                    onClick={() =>
                      setOptions(current => ({
                        ...current,
                        pagesPerSheet: layout.value,
                      }))
                    }
                    className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition ${
                      options.pagesPerSheet === layout.value
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <LayoutGlyph value={layout.value} />
                    <span className="text-xs font-semibold">
                      {layout.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {layout.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="print-margin">الهامش (مم)</Label>
                <Input
                  id="print-margin"
                  type="number"
                  min={0}
                  max={20}
                  value={options.marginMm}
                  onChange={event =>
                    setOptions(current => ({
                      ...current,
                      marginMm: Math.min(
                        20,
                        Math.max(0, Number(event.target.value) || 0)
                      ),
                    }))
                  }
                  className="mt-1.5"
                />
              </div>
              <label className="flex items-end justify-between gap-2 pb-2 text-sm">
                ترقيم الأوراق
                <Switch
                  checked={options.showPageNumbers}
                  onCheckedChange={checked =>
                    setOptions(current => ({
                      ...current,
                      showPageNumbers: checked,
                    }))
                  }
                />
              </label>
              <div>
                <Label htmlFor="print-header">ترويسة الورقة (اختياري)</Label>
                <Input
                  id="print-header"
                  value={options.headerText}
                  onChange={event =>
                    setOptions(current => ({
                      ...current,
                      headerText: event.target.value,
                    }))
                  }
                  className="mt-1.5"
                  placeholder="اسم الجهة أو عنوان الوثيقة"
                />
              </div>
              <div>
                <Label htmlFor="print-footer">تذييل الورقة (اختياري)</Label>
                <Input
                  id="print-footer"
                  value={options.footerText}
                  onChange={event =>
                    setOptions(current => ({
                      ...current,
                      footerText: event.target.value,
                    }))
                  }
                  className="mt-1.5"
                  placeholder="ملاحظة أو رقم القيد"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                جارٍ تجهيز الصفحات…
                {progress.total > 0
                  ? ` (${progress.done}/${progress.total})`
                  : ""}
              </div>
            ) : null}
            {error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <aside className="rounded-xl border bg-muted/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold">معاينة الأوراق</span>
              <span className="text-[10px] text-muted-foreground">
                {sheets.length} ورقة
              </span>
            </div>
            <div className="flex max-h-[360px] gap-2 overflow-x-auto pb-1">
              {sheets.slice(0, 8).map((sheet, index) => (
                <SheetThumb
                  key={index}
                  pages={sheet}
                  perSheet={options.pagesPerSheet}
                  index={index}
                  total={sheets.length}
                />
              ))}
              {sheets.length === 0 && !loading ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  لا توجد صفحات للمعاينة.
                </p>
              ) : null}
            </div>
            <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
              كل ورقة تُطبع على A4. عند اختيار صفحتين أو أربع صفحات يتقلّص حجم
              كل صفحة لتناسب الورقة مع الحفاظ على نسبتها.
            </p>
          </aside>
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            onClick={handlePrint}
            disabled={loading || pages.length === 0}
            className="gap-2"
          >
            <Printer className="size-4" />
            طباعة
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
