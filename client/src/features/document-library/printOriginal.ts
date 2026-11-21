import { fileKind } from "./types";
import type { PagesPerSheet } from "./types";
import { buildPrintHtml, openPrintWindow } from "./printSheets";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

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
  pagesPerSheet?: PagesPerSheet;
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

  if (kind === "pdf" && (options.pagesPerSheet ?? 1) !== 1) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const response = await fetch(options.url, { credentials: "omit" });
    if (!response.ok) throw new Error("تعذر تنزيل ملف PDF للطباعة");
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(await response.arrayBuffer()),
    }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = window.document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("تعذر تجهيز صفحات PDF للطباعة");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      pages.push({
        dataUrl: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
      });
      page.cleanup();
    }
    await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
    printWindow.document.open();
    printWindow.document.write(
      buildPrintHtml(pages, {
        pagesPerSheet: options.pagesPerSheet ?? 1,
        marginMm: 8,
        headerText: "",
        footerText: "",
        showPageNumbers: false,
      })
    );
    printWindow.document.close();
    await waitForImages(printWindow.document);
    await new Promise(resolve => printWindow.setTimeout(resolve, 250));
    printWindow.focus();
    printWindow.print();
    return;
  }

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
    `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>طباعة ${escapeHtml(options.fileName)}</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}.docx-wrapper{background:#fff!important;padding:0!important}.docx{box-shadow:none!important;margin:0!important}.sheet{width:210mm;height:297mm;padding:8mm;display:grid;gap:3mm;page-break-after:always;break-after:page;overflow:hidden}.sheet:last-child{page-break-after:auto;break-after:auto}.sheet.per-1{grid-template-columns:1fr;grid-template-rows:1fr}.sheet.per-2{grid-template-columns:1fr;grid-template-rows:repeat(2,1fr)}.sheet.per-4{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr)}.sheet.per-6{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(3,1fr)}.sheet.per-8{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(4,1fr)}.cell{position:relative;min-width:0;min-height:0;overflow:hidden;background:#fff}.cell>.docx{position:absolute;inset:0 auto auto 0;width:210mm!important;min-height:297mm!important;transform-origin:top left;box-shadow:none!important}@media print{html,body{width:210mm}}</style></head><body><div id="docx-print-host" dir="rtl"></div></body></html>`
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
  arrangeWordPages(printWindow.document, host, options.pagesPerSheet ?? 1);
  await printWindow.document.fonts?.ready;
  await waitForImages(printWindow.document);
  await new Promise(resolve => printWindow.setTimeout(resolve, 250));
  printWindow.focus();
  printWindow.print();
}

function arrangeWordPages(
  document: Document,
  host: HTMLElement,
  pagesPerSheet: PagesPerSheet
): void {
  const pages = Array.from(
    host.querySelectorAll<HTMLElement>(".docx-wrapper > .docx")
  );
  if (pagesPerSheet === 1 || pages.length === 0) return;
  const rows =
    pagesPerSheet === 2
      ? 2
      : pagesPerSheet === 4
        ? 2
        : pagesPerSheet === 6
          ? 3
          : 4;
  const fragment = document.createDocumentFragment();
  for (let start = 0; start < pages.length; start += pagesPerSheet) {
    const sheet = document.createElement("section");
    sheet.className = `sheet per-${pagesPerSheet}`;
    pages.slice(start, start + pagesPerSheet).forEach(page => {
      const cell = document.createElement("div");
      cell.className = "cell";
      page.style.transform = `scale(${1 / rows})`;
      cell.append(page);
      sheet.append(cell);
    });
    fragment.append(sheet);
  }
  host.replaceChildren(fragment);
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
