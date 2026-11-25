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
import {
  openPrintWindow,
  showPrintPreparingPage,
} from "../document-library/printSheets";
import PrintSettingsPanel from "../document-library/PrintSettingsPanel";
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
  const pageCount = Math.max(
    1,
    Math.ceil(Math.max(0, height - 1) / pageHeight)
  );
  const pages: SourcePage[] = [];
  try {
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  pageElement: HTMLElement | null;
}) {
  const [layoutMode, setLayoutMode] = useState<PrintLayoutMode>("sequential");
  const [pagesPerSheet, setPagesPerSheet] = useState<PagesPerSheet>(1);
  const [copiesPerSheet, setCopiesPerSheet] = useState<PagesPerSheet>(2);
  const [orientation, setOrientation] = useState<PrintOrientation>("portrait");
  const [marginMm, setMarginMm] = useState(0);
  const [showPageNumbers, setShowPageNumbers] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLayoutMode("sequential");
    setPagesPerSheet(1);
    setCopiesPerSheet(2);
    setOrientation("portrait");
    setMarginMm(0);
    setShowPageNumbers(false);
  }, [open, title]);

  async function handlePrint() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError(
        "منع المتصفح نافذة الطباعة؛ اسمح بالنوافذ المنبثقة ثم أعد المحاولة"
      );
      return;
    }
    showPrintPreparingPage(printWindow);

    setLoading(true);
    setError(null);
    try {
      if (!pageElement || !pageElement.isConnected) {
        throw new Error("تعذر العثور على صفحة الوثيقة الحالية");
      }
      const pages = await renderA4Pages(pageElement);
      await openPrintWindow(
        {
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
        },
        printWindow
      );
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
