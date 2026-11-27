import { useEffect, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { ChevronLeft, ChevronRight, FileWarning, Loader2 } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { fileKind } from "./types";
import { calculatePdfPreviewScale } from "./pdfPreviewSizing";
import { normalizeDocxLayout } from "./normalizeDocxImages";
import { appwriteApiUrl } from "@/lib/appwriteApi";
import { getSessionToken } from "@/lib/sessionToken";

export default function FilePreview({
  url,
  fileName,
  mimeType,
  fitToViewport = true,
  documentId,
}: {
  url: string;
  fileName: string;
  mimeType: string;
  fitToViewport?: boolean;
  documentId?: string;
}) {
  const kind = fileKind(fileName, mimeType);
  const [previewAsPdf, setPreviewAsPdf] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfPageUrl, setPdfPageUrl] = useState<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfPageNumber, setPdfPageNumber] = useState(1);
  const pdfDocument = useRef<PDFDocumentProxy | null>(null);
  const wordHost = useRef<HTMLDivElement | null>(null);
  const wordViewport = useRef<HTMLDivElement | null>(null);
  const [wordLayout, setWordLayout] = useState({
    scale: 1,
    height: 0,
    width: 0,
  });

  function measureWordLayout() {
    const viewport = wordViewport.current;
    const host = wordHost.current;
    if (!viewport || !host) return;
    const pages = Array.from(host.querySelectorAll<HTMLElement>(".docx"));
    const page = pages[0];
    // Measure the native Word sheets, not the wrapper's max-content width.
    // The wrapper can be several thousand pixels wide because docx-preview
    // keeps its internal layout unscaled. Including that wrapper width here
    // made the visual zoom converge to ~12%, hiding logos and fine details.
    const naturalWidth = Math.max(
      ...pages.map(currentPage => currentPage.offsetWidth),
      page?.offsetWidth ?? 0
    );
    const naturalHeight = Math.max(host.offsetHeight, page?.offsetHeight ?? 0);
    if (!naturalWidth || !naturalHeight) return;
    const availableWidth = Math.max(1, viewport.clientWidth - 16);
    const scale = fitToViewport
      ? Math.min(1, availableWidth / naturalWidth)
      : 1;
    const height = Math.ceil(naturalHeight * scale);
    setWordLayout(current =>
      Math.abs(current.scale - scale) < 0.001 &&
      current.height === height &&
      current.width === naturalWidth
        ? current
        : { scale, height, width: naturalWidth }
    );
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfPageUrl(null);
    setPdfPageCount(0);
    setPdfPageNumber(1);
    pdfDocument.current = null;
    setPreviewAsPdf(false);
    setWordLayout({ scale: 1, height: 0, width: 0 });
    if (!kind) {
      setError("صيغة الملف غير مدعومة للمعاينة");
      setLoading(false);
      return;
    }
    if (kind === "image") {
      setLoading(false);
      return;
    }
    if (kind === "pdf" || (kind === "word" && documentId)) {
      void (async () => {
        try {
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
          const sessionToken = getSessionToken();
          const response = await fetch(
            kind === "word" && documentId
              ? appwriteApiUrl(`/api/documents/${documentId}/print-pdf`)
              : url,
            kind === "word" && documentId
              ? {
                  method: "POST",
                  credentials: "include",
                  headers: sessionToken
                    ? { Authorization: `Bearer ${sessionToken}` }
                    : undefined,
                }
              : { credentials: "omit" }
          );
          if (!response.ok) throw new Error("تعذر تنزيل الملف");
          const document = await pdfjs.getDocument({
            data: new Uint8Array(await response.arrayBuffer()),
            cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
            cMapPacked: true,
          }).promise;
          if (!cancelled) {
            setPreviewAsPdf(kind === "word");
            pdfDocument.current = document;
            setPdfPageCount(document.numPages);
          }
        } catch (previewError) {
          if (!cancelled) {
            setError(
              previewError instanceof Error
                ? previewError.message
                : "تعذر عرض الملف"
            );
          }
        } finally {
          if (!cancelled && !pdfDocument.current) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
        void pdfDocument.current?.cleanup();
        pdfDocument.current = null;
      };
    }

    void (async () => {
      try {
        const [{ renderAsync }] = await Promise.all([import("docx-preview")]);
        const response = await fetch(url, { credentials: "omit" });
        if (!response.ok) throw new Error("تعذر تنزيل الملف");
        const buffer = await response.arrayBuffer();
        if (cancelled || !wordHost.current) return;
        wordHost.current.innerHTML = "";
        await renderAsync(buffer, wordHost.current, undefined, {
          className: "docx",
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          useBase64URL: true,
        });
        await Promise.all(
          Array.from(wordHost.current.querySelectorAll("img")).map(image =>
            image.complete
              ? image.decode?.().catch(() => undefined)
              : new Promise<void>(resolve => {
                  image.addEventListener("load", () => resolve(), {
                    once: true,
                  });
                  image.addEventListener("error", () => resolve(), {
                    once: true,
                  });
                })
          )
        );
        await window.document.fonts?.ready;
        normalizeDocxLayout(wordHost.current);
        measureWordLayout();
      } catch (previewError) {
        if (!cancelled) {
          setError(
            previewError instanceof Error
              ? previewError.message
              : "تعذر عرض ملف Word"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, fileName, mimeType, kind, documentId]);

  useEffect(() => {
    if (!(kind === "pdf" || previewAsPdf) || !pdfDocument.current) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    void (async () => {
      try {
        const page = await pdfDocument.current!.getPage(pdfPageNumber);
        const base = page.getViewport({ scale: 1 });
        const scale = calculatePdfPreviewScale(
          base.width,
          base.height,
          Math.max(
            240,
            (wordViewport.current?.clientWidth ?? window.innerWidth) - 24
          )
        );
        const viewport = page.getViewport({ scale });
        const canvas = window.document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("تعذر تجهيز المعاينة");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const blob = await new Promise<Blob | null>(resolve =>
          canvas.toBlob(resolve, "image/jpeg", 0.88)
        );
        if (!blob) throw new Error("تعذر تجهيز صورة المعاينة");
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setPdfPageUrl(objectUrl);
        page.cleanup();
      } catch (previewError) {
        if (!cancelled) {
          setError(
            previewError instanceof Error
              ? previewError.message
              : "تعذر عرض الملف"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [kind, previewAsPdf, pdfPageNumber, pdfPageCount]);

  useEffect(() => {
    if (kind !== "word" || documentId) return;
    const viewport = wordViewport.current;
    const host = wordHost.current;
    if (!viewport || !host) return;
    const observer = new ResizeObserver(() => measureWordLayout());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [kind, documentId, fitToViewport, loading]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-16 text-center">
        <FileWarning className="size-8 text-amber-600" />
        <p className="text-sm font-medium">تعذر عرض المعاينة</p>
        <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (kind === "image") {
    return (
      <div className="flex justify-center rounded-lg border bg-slate-100 p-3">
        <img
          src={url}
          alt={fileName}
          className="max-h-[70vh] max-w-full object-contain shadow"
        />
      </div>
    );
  }

  if (kind === "pdf" || previewAsPdf) {
    return (
      <div className="relative space-y-3 overflow-x-auto rounded-lg bg-slate-100 p-2 sm:p-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> جارٍ تجهيز معاينة PDF…
          </div>
        ) : null}
        {pdfPageUrl ? (
          <img
            src={pdfPageUrl}
            alt={`صفحة ${pdfPageNumber} من ${pdfPageCount}`}
            className="mx-auto block h-auto w-full max-w-[820px] min-w-0 bg-white object-contain shadow"
          />
        ) : null}
        {!loading && pdfPageCount > 0 ? (
          <div className="flex items-center justify-center gap-3" dir="rtl">
            <button
              type="button"
              className="rounded-md border bg-background p-2 disabled:opacity-40"
              aria-label="الصفحة التالية"
              disabled={pdfPageNumber >= pdfPageCount}
              onClick={() =>
                setPdfPageNumber(value => Math.min(pdfPageCount, value + 1))
              }
            >
              <ChevronRight className="size-4" />
            </button>
            <span className="text-sm tabular-nums">
              صفحة {pdfPageNumber} من {pdfPageCount}
            </span>
            <button
              type="button"
              className="rounded-md border bg-background p-2 disabled:opacity-40"
              aria-label="الصفحة السابقة"
              disabled={pdfPageNumber <= 1}
              onClick={() => setPdfPageNumber(value => Math.max(1, value - 1))}
            >
              <ChevronLeft className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={wordViewport}
      className="document-word-preview-viewport relative min-w-0 overflow-hidden rounded-lg bg-slate-100 p-2 sm:p-3"
      style={{ height: wordLayout.height ? wordLayout.height + 16 : undefined }}
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> جارٍ تجهيز معاينة Word…
        </div>
      ) : null}
      <div
        ref={wordHost}
        dir="auto"
        className="document-word-preview mx-auto bg-white shadow"
        style={{
          transform: "translateX(-50%)",
          transformOrigin: "top center",
          zoom: wordLayout.scale,
          width: wordLayout.width ? `${wordLayout.width}px` : undefined,
          position: "absolute",
          left: "50%",
          top: "8px",
        }}
      />
    </div>
  );
}
