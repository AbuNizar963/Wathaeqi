export type ShareResult = "shared" | "copied";

export function documentStudioUrl(documentId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/studio?document=${encodeURIComponent(documentId)}`;
}

export function downloadDocumentFile(url: string, fileName: string): void {
  const link = window.document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.click();
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
