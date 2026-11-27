import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { SourcePage } from "./types";
import { fileKind } from "./types";
import {
  DEFAULT_PRINT_PIXEL_RATIO,
  getBoundedPixelRatio,
} from "./renderQuality";
import { normalizeDocxImageLayout } from "./normalizeDocxImages";

const RENDER_SCALE = DEFAULT_PRINT_PIXEL_RATIO;
const MAX_PAGES = 300;

async function renderPdfPages(
  buffer: ArrayBuffer,
  onProgress?: (done: number, total: number) => void
): Promise<SourcePage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const document = await loadingTask.promise;
  const pages: SourcePage[] = [];
  try {
    const total = Math.min(document.numPages, MAX_PAGES);
    for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = getBoundedPixelRatio(
        baseViewport.width,
        baseViewport.height,
        5
      );
      const viewport = page.getViewport({ scale });
      const canvas = window.document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("تعذر تجهيز مساحة رسم الصفحة");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      pages.push({
        src: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
      });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      onProgress?.(pageNumber, total);
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages;
}

async function renderWordPages(
  buffer: ArrayBuffer,
  onProgress?: (done: number, total: number) => void
): Promise<SourcePage[]> {
  const [{ renderAsync }, { toCanvas }] = await Promise.all([
    import("docx-preview"),
    import("html-to-image"),
  ]);
  const host = window.document.createElement("div");
  // Let docx-preview apply paragraph/table bidi settings from the DOCX XML.
  // A forced RTL ancestor changes mixed Arabic/LTR documents during capture.
  host.setAttribute("dir", "auto");
  host.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    "width:794px",
    "background:#ffffff",
    "z-index:-1",
  ].join(";");
  window.document.body.appendChild(host);
  try {
    await renderAsync(buffer, host, undefined, {
      className: "docx",
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      renderHeaders: true,
      renderFooters: true,
      useBase64URL: true,
    });
    normalizeDocxImageLayout(host);
    await window.document.fonts?.ready;
    let sections = Array.from(
      host.querySelectorAll<HTMLElement>("section.docx")
    );
    if (sections.length === 0) {
      sections = Array.from(
        host.querySelectorAll<HTMLElement>(".docx-wrapper > .docx")
      );
    }
    if (sections.length === 0) sections = [host];
    const pages: SourcePage[] = [];
    for (let index = 0; index < sections.length; index += 1) {
      const section = sections[index];
      // html2canvas re-implements text layout and breaks Arabic shaping in
      // rendered Word pages; html-to-image keeps the browser's own layout.
      const canvas = await toCanvas(section, {
        pixelRatio: getBoundedPixelRatio(
          section.scrollWidth,
          section.scrollHeight,
          RENDER_SCALE
        ),
        cacheBust: true,
        width: section.scrollWidth,
        height: section.scrollHeight,
      });
      pages.push({
        src: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
      });
      onProgress?.(index + 1, sections.length);
    }
    return pages;
  } finally {
    host.remove();
  }
}

async function renderImagePage(url: string): Promise<SourcePage[]> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("تعذر فتح الصورة"));
    image.src = url;
  });
  const canvas = window.document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("تعذر تجهيز مساحة رسم الصورة");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  return [
    {
      src: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    },
  ];
}

export async function renderDocumentPages(options: {
  url: string;
  fileName: string;
  mimeType: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<SourcePage[]> {
  const kind = fileKind(options.fileName, options.mimeType);
  if (!kind) throw new Error("صيغة الملف غير مدعومة للمعاينة");
  if (kind === "image") return renderImagePage(options.url);
  const response = await fetch(options.url, { credentials: "omit" });
  if (!response.ok) throw new Error("تعذر تنزيل الملف من التخزين");
  const buffer = await response.arrayBuffer();
  if (kind === "pdf") return renderPdfPages(buffer, options.onProgress);
  return renderWordPages(buffer, options.onProgress);
}

export async function countDocumentPages(options: {
  url: string;
  fileName: string;
  mimeType: string;
}): Promise<number> {
  const kind = fileKind(options.fileName, options.mimeType);
  if (!kind) return 1;
  if (kind === "image") return 1;
  if (kind === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const response = await fetch(options.url, { credentials: "omit" });
    if (!response.ok) return 1;
    const document = await pdfjs.getDocument({
      data: new Uint8Array(await response.arrayBuffer()),
    }).promise;
    const total = Math.max(1, document.numPages);
    await (
      document as unknown as { destroy?: () => Promise<void> }
    ).destroy?.();
    return total;
  }
  const pages = await renderWordPages(
    await (await fetch(options.url, { credentials: "omit" })).arrayBuffer()
  );
  return Math.max(1, pages.length);
}

export async function countLocalFilePages(file: File): Promise<number> {
  const kind = fileKind(file.name, file.type);
  if (!kind || kind === "image") return 1;
  const buffer = await file.arrayBuffer();
  if (kind === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
    }).promise;
    const total = Math.max(1, document.numPages);
    await (
      document as unknown as { destroy?: () => Promise<void> }
    ).destroy?.();
    return total;
  }
  const pages = await renderWordPages(buffer);
  return Math.max(1, pages.length);
}
