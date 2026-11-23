export type ShareResult = "shared" | "copied";

export function documentStudioUrl(documentId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/studio?document=${encodeURIComponent(documentId)}`;
}

export function documentFileUrl(documentId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/documents/${encodeURIComponent(documentId)}/file`;
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
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("تعذر تنزيل الملف");
  triggerBlobDownload(await response.blob(), fileName);
}

export async function downloadA4PageAsPng(
  element: HTMLElement,
  fileName: string
): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    allowTaint: false,
    useCORS: true,
    logging: false,
    scale: 3,
    onclone: clonedDocument => {
      clonedDocument
        .querySelectorAll<HTMLElement>(
          ".document-studio-no-print, .document-editor-input, .document-editor-warning"
        )
        .forEach(node => {
          node.style.display = "none";
        });
      clonedDocument
        .querySelectorAll<HTMLElement>(".document-editor-print-copy")
        .forEach(node => {
          node.style.display = "block";
        });
    },
  });
  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) throw new Error("تعذر إنشاء صورة الوثيقة");
  triggerBlobDownload(blob, fileName);
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
