import { appwriteApiUrl } from "@/lib/appwriteApi";
import { fetchWithSession } from "@/lib/trpcFetch";
import { fileKind } from "../document-library/types";
import {
  DEFAULT_PRINT_PIXEL_RATIO,
  getBoundedPixelRatio,
} from "../document-library/renderQuality";

export type ShareResult = "shared" | "copied";

export function documentStudioUrl(documentId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/studio?document=${encodeURIComponent(documentId)}`;
}

export function documentFileUrl(documentId: string): string {
  return appwriteApiUrl(
    `/api/documents/${encodeURIComponent(documentId)}/file`
  );
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.rel = "noopener";
  link.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export async function downloadDocumentFile(
  url: string,
  fileName: string
): Promise<void> {
  const response = await fetchWithSession(url);
  if (!response.ok) throw new Error("تعذر تنزيل الملف");
  if (!fileKind(fileName, response.headers.get("content-type") ?? "")) {
    throw new Error("تعذر تنزيل الملف: نوع الاستجابة غير صالح");
  }
  triggerBlobDownload(await response.blob(), fileName);
}

export async function downloadA4PageAsPng(
  element: HTMLElement,
  fileName: string
): Promise<void> {
  // html2canvas re-implements text layout and breaks Arabic shaping and table
  // geometry; html-to-image serializes the real DOM into an SVG foreignObject,
  // so the export matches the browser rendering exactly.
  const { toBlob } = await import("html-to-image");
  const hidden = Array.from(
    element.querySelectorAll<HTMLElement>(
      ".document-studio-no-print, .document-editor-input, .document-editor-warning"
    )
  );
  const printCopies = Array.from(
    element.querySelectorAll<HTMLElement>(".document-editor-print-copy")
  );
  const previousHidden = hidden.map(node => node.style.display);
  const previousPrintCopies = printCopies.map(node => node.style.display);
  hidden.forEach(node => {
    node.style.display = "none";
  });
  printCopies.forEach(node => {
    node.style.display = "block";
  });
  try {
    const width = Math.max(element.clientWidth, element.scrollWidth);
    const height = Math.max(element.clientHeight, element.scrollHeight);
    const blob = await toBlob(element, {
      pixelRatio: getBoundedPixelRatio(
        width,
        height,
        DEFAULT_PRINT_PIXEL_RATIO
      ),
      cacheBust: true,
      width,
      height,
      // Preview scaling and clipping are for the viewport only, not the export.
      style: {
        transform: "none",
        position: "static",
        left: "auto",
        top: "auto",
        margin: "0",
      },
    });
    if (!blob) throw new Error("تعذر تجهيز صورة PNG للتنزيل");
    triggerBlobDownload(blob, fileName);
  } finally {
    hidden.forEach((node, index) => {
      node.style.display = previousHidden[index] ?? "";
    });
    printCopies.forEach((node, index) => {
      node.style.display = previousPrintCopies[index] ?? "";
    });
  }
}

export async function shareDocument(input: {
  documentId: string;
  title: string;
  text?: string;
}): Promise<ShareResult> {
  const url = documentStudioUrl(input.documentId);
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    await navigator.share({
      title: input.title,
      text: input.text || input.title,
      url,
    });
    return "shared";
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return "copied";
  }

  throw new Error(
    "تعذر نسخ رابط الوثيقة بأمان؛ استخدم متصفحًا يدعم المشاركة أو النسخ"
  );
}

export async function downloadOfficialDocumentAsWord(input: {
  title: string;
  subject: string;
  serialCode: string;
  documentDate: string;
  content: Record<string, unknown>;
}): Promise<void> {
  const { buildOfficialDocumentDocx } = await import("./docxExport");
  const blob = await buildOfficialDocumentDocx(input);
  const baseName = (input.title || "وثيقة")
    .replace(/[\\\\/:*?"<>|]+/g, "-")
    .trim();
  triggerBlobDownload(blob, `${baseName || "وثيقة"}.docx`);
}
