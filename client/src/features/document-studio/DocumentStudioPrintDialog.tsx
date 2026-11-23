import { useState } from "react";
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
import {
  buildPrintHtml,
  openPrintWindow,
} from "../document-library/printSheets";
import type { PagesPerSheet, SourcePage } from "../document-library/types";

const PAGE_COUNTS: PagesPerSheet[] = [1, 2, 4, 6, 8];

async function renderA4Pages(element: HTMLElement): Promise<SourcePage[]> {
  const width = element.clientWidth;
  const editorOverflow = Array.from(
    element.querySelectorAll<HTMLTextAreaElement>(".document-editor-input")
  ).reduce(
    (total, editor) =>
      total + Math.max(0, editor.scrollHeight - editor.clientHeight),
    0
  );
  const height = Math.max(
    element.scrollHeight,
    element.clientHeight + editorOverflow
  );
  if (width <= 0 || height <= 0) {
    throw new Error("تعذر تحديد أبعاد صفحة الوثيقة للطباعة");
  }

  // html-to-image renders the real DOM through an SVG foreignObject, so Arabic
  // shaping and the letterhead layout match the on-screen page exactly.
  const { toCanvas } = await import("html-to-image");
  const inputs = Array.from(
    element.querySelectorAll<HTMLElement>(".document-editor-input")
  );
  const warnings = Array.from(
    element.querySelectorAll<HTMLElement>(".document-editor-warning")
  );
  const printCopies = Array.from(
    element.querySelectorAll<HTMLElement>(".document-editor-print-copy")
  );
  const previous = [...inputs, ...warnings, ...printCopies].map(
    node => node.style.display
  );
  [...inputs, ...warnings].forEach(node => {
    node.style.display = "none";
  });
  printCopies.forEach(node => {
    node.style.display = "block";
  });
  let canvas: HTMLCanvasElement;
  try {
    canvas = await toCanvas(element, {
      pixelRatio: 3,
      cacheBust: true,
      width,
      height,
      style: {
        transform: "none",
        position: "static",
        left: "auto",
        top: "auto",
        margin: "0",
        minHeight: `${height}px`,
      },
    });
  } finally {
    [...inputs, ...warnings, ...printCopies].forEach((node, index) => {
      node.style.display = previous[index] ?? "";
    });
  }

  const scale = canvas.width / width;
  const pageHeight = (width * 297) / 210;
  const pageHeightPixels = Math.max(1, Math.round(pageHeight * scale));
  const pageCount = Math.max(
    1,
    Math.ceil(Math.max(0, height - 1) / pageHeight)
  );
  const pages: SourcePage[] = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const sourceTop = pageIndex * pageHeightPixels;
    if (sourceTop >= canvas.height) break;
    const sourceHeight = Math.min(pageHeightPixels, canvas.height - sourceTop);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = pageHeightPixels;
    const context = pageCanvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("تعذر تجهيز صفحة الوثيقة للطباعة");
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(
      canvas,
      0,
      sourceTop,
      canvas.width,
      sourceHeight,
      0,
      0,
      canvas.width,
      sourceHeight
    );
    pages.push({
      dataUrl: pageCanvas.toDataURL("image/png"),
      width: pageCanvas.width,
      height: pageCanvas.height,
    });
  }

  if (pages.length === 0) {
    throw new Error("لم يتم العثور على صفحات قابلة للطباعة");
  }
  return pages;
}

export default function DocumentStudioPrintDialog({
  open,
  onOpenChange,
  title,
  pageElement,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  pageElement: HTMLElement | null;
}) {
  const [pagesPerSheet, setPagesPerSheet] = useState<PagesPerSheet>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePrint() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError(
        "منع المتصفح نافذة الطباعة؛ اسمح بالنوافذ المنبثقة ثم أعد المحاولة"
      );
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (!pageElement || !pageElement.isConnected) {
        throw new Error("تعذر العثور على صفحة الوثيقة الحالية");
      }
      const pages = await renderA4Pages(pageElement);
      const html = buildPrintHtml(pages, {
        pagesPerSheet,
        marginMm: 0,
        headerText: "",
        footerText: "",
        showPageNumbers: false,
      });
      await openPrintWindow(html, printWindow);
    } catch (printError) {
      printWindow.close();
      setError(
        printError instanceof Error
          ? printError.message
          : "تعذرت تهيئة الوثيقة للطباعة"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (!nextOpen) setError(null);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="max-h-[92vh] max-w-lg overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="text-right">إعداد طباعة الوثيقة</DialogTitle>
          <DialogDescription className="text-right">
            {title} — اختر عدد صفحات الوثيقة التي تريد وضعها في كل ورقة A4.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="rounded-lg border bg-muted/30 p-3">
          <legend className="px-1 text-sm font-medium">
            عدد الصفحات في الورقة
          </legend>
          <div
            className="grid grid-cols-3 gap-2 sm:grid-cols-5"
            role="radiogroup"
            aria-label="عدد الصفحات في الورقة"
          >
            {PAGE_COUNTS.map(value => {
              const selected = pagesPerSheet === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPagesPerSheet(value)}
                  className={`rounded-md border px-2 py-3 text-sm font-semibold transition ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {value}
                  <span className="mt-1 block text-[11px] font-normal">
                    {value === 1 ? "صفحة واحدة" : "صفحات"}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            onClick={() => void handlePrint()}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Printer className="size-4" />
            )}
            {loading ? "جارٍ تجهيز الطباعة..." : "متابعة الطباعة / حفظ PDF"}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
