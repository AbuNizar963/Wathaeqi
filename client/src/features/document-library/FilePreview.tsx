import { useEffect, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { FileWarning, Loader2 } from "lucide-react";
import { fileKind } from "./types";

export default function FilePreview({
  url,
  fileName,
  mimeType,
  fitToViewport = true,
}: {
  url: string;
  fileName: string;
  mimeType: string;
  fitToViewport?: boolean;
}) {
  const kind = fileKind(fileName, mimeType);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const wordHost = useRef<HTMLDivElement | null>(null);
  const wordViewport = useRef<HTMLDivElement | null>(null);
  const [wordLayout, setWordLayout] = useState({ scale: 1, height: 0 });

  function measureWordLayout() {
    const viewport = wordViewport.current;
    const host = wordHost.current;
    if (!viewport || !host) return;
    const page = host.querySelector<HTMLElement>(".docx");
    const naturalWidth = Math.max(
      host.scrollWidth,
      page?.scrollWidth ?? 0,
      page?.getBoundingClientRect().width ?? 0
    );
    const naturalHeight = Math.max(host.scrollHeight, page?.scrollHeight ?? 0);
    if (!naturalWidth || !naturalHeight) return;
    const availableWidth = Math.max(1, viewport.clientWidth - 16);
    const scale = fitToViewport
      ? Math.min(1, availableWidth / naturalWidth)
      : 1;
    setWordLayout({ scale, height: Math.ceil(naturalHeight * scale) });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfPages([]);
    setWordLayout({ scale: 1, height: 0 });
    if (!kind) {
      setError("صيغة الملف غير مدعومة للمعاينة");
      setLoading(false);
      return;
    }
    if (kind === "image") {
      setLoading(false);
      return;
    }
    if (kind === "pdf") {
      void (async () => {
        try {
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
          const response = await fetch(url, { credentials: "omit" });
          if (!response.ok) throw new Error("تعذر تنزيل الملف");
          const document = await pdfjs.getDocument({
            data: new Uint8Array(await response.arrayBuffer()),
          }).promise;
          const total = document.numPages;
          const images: string[] = [];
          for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
            const page = await document.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 2.5 });
            const canvas = window.document.createElement("canvas");
            const context = canvas.getContext("2d", { alpha: false });
            if (!context) throw new Error("تعذر تجهيز المعاينة");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvas, canvasContext: context, viewport })
              .promise;
            images.push(canvas.toDataURL("image/png"));
            page.cleanup();
          }
          await (
            document as unknown as { destroy?: () => Promise<void> }
          ).destroy?.();
          if (!cancelled) setPdfPages(images);
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
  }, [url, fileName, mimeType, kind]);

  useEffect(() => {
    if (kind !== "word") return;
    const viewport = wordViewport.current;
    const host = wordHost.current;
    if (!viewport || !host) return;
    const observer = new ResizeObserver(() => measureWordLayout());
    observer.observe(viewport);
    observer.observe(host);
    return () => observer.disconnect();
  }, [kind, fitToViewport, loading]);

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

  if (kind === "pdf") {
    return (
      <div className="relative space-y-3 overflow-x-auto rounded-lg bg-slate-100 p-2 sm:p-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> جارٍ تجهيز معاينة PDF…
          </div>
        ) : null}
        {pdfPages.map((page, index) => (
          <img
            key={index}
            src={page}
            alt={`صفحة ${index + 1}`}
            className="mx-auto block h-auto w-full max-w-[820px] min-w-0 bg-white object-contain shadow sm:min-w-[620px]"
          />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={wordViewport}
      className="document-word-preview-viewport relative overflow-hidden rounded-lg bg-slate-100 p-2 sm:p-3"
      style={{ height: wordLayout.height ? wordLayout.height + 16 : undefined }}
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> جارٍ تجهيز معاينة Word…
        </div>
      ) : null}
      <div
        ref={wordHost}
        dir="rtl"
        className="document-word-preview mx-auto w-max min-w-full bg-white shadow"
        style={{
          transform: `translateX(-50%) scale(${wordLayout.scale})`,
          transformOrigin: "top center",
          position: "relative",
          left: "50%",
        }}
      />
    </div>
  );
}
