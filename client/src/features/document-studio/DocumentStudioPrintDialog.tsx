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
import { openPrintWindow } from "../document-library/printSheets";
import DocumentOperationProgress from "../document-progress/DocumentOperationProgress";
import { useDocumentProgress } from "../document-progress/useDocumentProgress";
import {
  measuredProgress,
  throwIfAborted,
  type DocumentOperationOptions,
} from "../document-progress/documentProgress";
import PrintSettingsPanel from "../document-library/PrintSettingsPanel";
import { countA4Pages, measureA4Page } from "./a4PrintLayout";
import { applyDocumentPrintVisibility } from "./documentPrintSections";
import type {
  PagesPerSheet,
  PrintLayoutMode,
  PrintOrientation,
  SourcePage,
} from "../document-library/types";
import {
  DEFAULT_PRINT_PIXEL_RATIO,
  canvasToPngObjectUrl,
  getBoundedPixelRatio,
} from "../document-library/renderQuality";

async function renderA4Pages(
  element: HTMLElement,
  options: DocumentOperationOptions = {}
): Promise<SourcePage[]> {
  throwIfAborted(options.signal);
  options.onProgress?.({
    phase: "preparation",
    message: "جارٍ تحميل خطوط الوثيقة…",
  });
  await document.fonts?.ready;
  throwIfAborted(options.signal);
  const editorOverflow = Array.from(
    element.querySelectorAll<HTMLTextAreaElement>(".document-editor-input")
  ).reduce(
    (total, editor) =>
      total + Math.max(0, editor.scrollHeight - editor.clientHeight),
    0
  );
  const computedStyle = window.getComputedStyle(element);
  const borderWidths = {
    horizontal:
      (Number.parseFloat(computedStyle.borderLeftWidth) || 0) +
      (Number.parseFloat(computedStyle.borderRightWidth) || 0),
    vertical:
      (Number.parseFloat(computedStyle.borderTopWidth) || 0) +
      (Number.parseFloat(computedStyle.borderBottomWidth) || 0),
  };
  const { width, height } = measureA4Page(
    element,
    borderWidths,
    editorOverflow
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
    options.onProgress?.({
      phase: "render",
      message: "جارٍ رسم محتوى الوثيقة؛ نسبة الرسم غير قابلة للقياس",
    });
    canvas = await toCanvas(element, {
      pixelRatio: getBoundedPixelRatio(
        width,
        height,
        DEFAULT_PRINT_PIXEL_RATIO
      ),
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
  const pageCount = countA4Pages(height, width);
  const pages: SourcePage[] = [];
  try {
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      throwIfAborted(options.signal);
      const sourceTop = pageIndex * pageHeightPixels;
      if (sourceTop >= canvas.height) break;
      const sourceHeight = Math.min(
        pageHeightPixels,
        canvas.height - sourceTop
      );
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = pageHeightPixels;
      try {
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
          src: await canvasToPngObjectUrl(pageCanvas),
          width: pageCanvas.width,
          height: pageCanvas.height,
        });
        options.onProgress?.(
          measuredProgress(
            "render",
            "جارٍ تجهيز جميع صفحات A4…",
            pages.length,
            pageCount
          )
        );
      } finally {
        pageCanvas.width = 0;
        pageCanvas.height = 0;
      }
    }

    if (pages.length === 0) {
      throw new Error("لم يتم العثور على صفحات قابلة للطباعة");
    }
    return pages;
  } catch (error) {
    pages.forEach(page => URL.revokeObjectURL(page.src));
    throw error;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export default function DocumentStudioPrintDialog({
  open,
  onOpenChange,
  title,
  pageElement,
  onBeforePrint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  pageElement: HTMLElement | null;
  onBeforePrint?: () => Promise<void>;
}) {
  const [layoutMode, setLayoutMode] = useState<PrintLayoutMode>("sequential");
  const [pagesPerSheet, setPagesPerSheet] = useState<PagesPerSheet>(1);
  const [copiesPerSheet, setCopiesPerSheet] = useState<PagesPerSheet>(2);
  const [orientation, setOrientation] = useState<PrintOrientation>("portrait");
  const [marginMm, setMarginMm] = useState(0);
  const [showPageNumbers, setShowPageNumbers] = useState(false);
  const [showDocumentHeader, setShowDocumentHeader] = useState(true);
  const [showDocumentFooter, setShowDocumentFooter] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useDocumentProgress();

  useEffect(() => {
    if (!open) {
      setShowDocumentHeader(true);
      setShowDocumentFooter(true);
      return;
    }
    setError(null);
    setLayoutMode("sequential");
    setPagesPerSheet(1);
    setCopiesPerSheet(2);
    setOrientation("portrait");
    setMarginMm(0);
    setShowPageNumbers(false);
  }, [open, title]);

  useEffect(() => {
    if (!open || !pageElement) return;
    return applyDocumentPrintVisibility(pageElement, {
      showHeader: showDocumentHeader,
      showFooter: showDocumentFooter,
    });
  }, [open, pageElement, showDocumentHeader, showDocumentFooter]);

  async function handlePrint() {
    setLoading(true);
    setError(null);
    try {
      if (!pageElement || !pageElement.isConnected) {
        throw new Error("تعذر العثور على صفحة الوثيقة الحالية");
      }
      await operation.run(async progressOptions => {
        const pages = await renderA4Pages(pageElement, progressOptions);
        await onBeforePrint?.();
        await openPrintWindow({
          ...progressOptions,
          title,
          pages,
          options: {
            pagesPerSheet,
            layoutMode,
            copiesPerSheet,
            orientation,
            marginMm,
            headerText: "",
            footerText: "",
            showPageNumbers,
          },
        });
      });
    } catch (printError) {
      if (printError instanceof Error && printError.name === "AbortError")
        return;
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
        if (!nextOpen) {
          operation.cancel();
          setError(null);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="max-h-[92vh] max-w-5xl overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="text-right">إعداد طباعة الوثيقة</DialogTitle>
          <DialogDescription className="text-right">
            {title} — اختر الصفحات المختلفة في الورقة أو كرر كل صفحة كنسخ، ثم
            اضبط اتجاه الورقة والهوامش.
          </DialogDescription>
        </DialogHeader>
        <PrintSettingsPanel
          mode={layoutMode}
          onModeChange={setLayoutMode}
          count={layoutMode === "repeat" ? copiesPerSheet : pagesPerSheet}
          onCountChange={
            layoutMode === "repeat" ? setCopiesPerSheet : setPagesPerSheet
          }
          orientation={orientation}
          onOrientationChange={setOrientation}
          marginMm={marginMm}
          onMarginChange={setMarginMm}
          showPageNumbers={showPageNumbers}
          onShowPageNumbersChange={setShowPageNumbers}
        />
        <fieldset className="rounded-xl border bg-card p-4">
          <legend className="px-2 text-sm font-semibold">محتوى الوثيقة</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={showDocumentHeader}
                onChange={event => setShowDocumentHeader(event.target.checked)}
                className="mt-1 size-4 accent-primary"
              />
              <span>
                <span className="block font-medium">إظهار الترويسة</span>
                <span className="block text-xs text-muted-foreground">
                  الشعار والبيانات ورقم الوثيقة وتاريخها.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={showDocumentFooter}
                onChange={event => setShowDocumentFooter(event.target.checked)}
                className="mt-1 size-4 accent-primary"
              />
              <span>
                <span className="block font-medium">إظهار التذييل والتوقيع</span>
                <span className="block text-xs text-muted-foreground">
                  بيانات التوقيع والسطور المخصصة أسفل الوثيقة.
                </span>
              </span>
            </label>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            تتغير معاينة A4 خلف هذا الحوار فوراً، وتُطبّق الخيارات نفسها على
            الطباعة والحفظ بصيغة PDF.
          </p>
        </fieldset>
        <DocumentOperationProgress progress={operation.progress} />
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
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
            onClick={() => {
              operation.cancel();
              onOpenChange(false);
            }}
          >
            {loading ? "إلغاء التجهيز" : "إغلاق"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
