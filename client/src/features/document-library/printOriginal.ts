import { fileKind } from "./types";

function waitForImages(document: Document): Promise<void> {
  return Promise.all(
    Array.from(document.images).map(image =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            image.onload = () => resolve();
            image.onerror = () => resolve();
          })
    )
  ).then(() => undefined);
}

function waitForLoad(target: Window): Promise<void> {
  if (target.document.readyState === "complete") return Promise.resolve();
  return new Promise(resolve => {
    target.addEventListener("load", () => resolve(), { once: true });
  });
}

export async function openOriginalPrintWindow(options: {
  url: string;
  fileName: string;
  mimeType: string;
}): Promise<void> {
  const kind = fileKind(options.fileName, options.mimeType);
  if (kind !== "pdf" && kind !== "word") {
    throw new Error("الطباعة الأصلية متاحة لملفات PDF وWord فقط");
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error(
      "منع المتصفح نافذة الطباعة؛ اسمح بالنوافذ المنبثقة ثم أعد المحاولة"
    );
  }
  printWindow.opener = null;

  if (kind === "pdf") {
    printWindow.document.open();
    printWindow.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>طباعة ${escapeHtml(options.fileName)}</title><style>@page{size:auto;margin:0}html,body,iframe{width:100%;height:100%;margin:0;border:0;overflow:hidden}</style></head><body><iframe title="${escapeHtml(options.fileName)}" src="${escapeAttribute(options.url)}"></iframe></body></html>`
    );
    printWindow.document.close();
    await waitForLoad(printWindow);
    await new Promise(resolve => printWindow.setTimeout(resolve, 250));
    printWindow.focus();
    printWindow.print();
    return;
  }

  const response = await fetch(options.url, { credentials: "omit" });
  if (!response.ok) {
    printWindow.close();
    throw new Error("تعذر تنزيل ملف Word للطباعة");
  }
  const buffer = await response.arrayBuffer();
  const [{ renderAsync }] = await Promise.all([import("docx-preview")]);
  printWindow.document.open();
  printWindow.document.write(
    `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>طباعة ${escapeHtml(options.fileName)}</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0;background:#fff}body{padding:0}.docx-wrapper{background:#fff!important;padding:0!important}.docx{box-shadow:none!important;margin:0 auto!important;page-break-after:always;break-after:page}@media print{.docx{box-shadow:none!important}}</style></head><body><div id="docx-print-host" dir="rtl"></div></body></html>`
  );
  printWindow.document.close();
  const host = printWindow.document.getElementById("docx-print-host");
  if (!host) {
    printWindow.close();
    throw new Error("تعذر تجهيز مساحة طباعة Word");
  }
  await renderAsync(buffer, host, undefined, {
    className: "docx",
    inWrapper: true,
    breakPages: true,
    ignoreLastRenderedPageBreak: false,
    renderHeaders: true,
    renderFooters: true,
    useBase64URL: true,
  });
  await printWindow.document.fonts?.ready;
  await waitForImages(printWindow.document);
  await new Promise(resolve => printWindow.setTimeout(resolve, 250));
  printWindow.focus();
  printWindow.print();
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    character =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character
  );
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
