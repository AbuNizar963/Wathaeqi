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

export async function openOriginalPrintWindow(options: {
  url: string;
  fileName: string;
  mimeType: string;
  pagesPerSheet?: PagesPerSheet;
  imageTiles?: 1 | 4 | 9 | 16;
}): Promise<void> {
  const kind = fileKind(options.fileName, options.mimeType);
  if (kind !== "pdf" && kind !== "word" && kind !== "image") {
    throw new Error("صيغة الملف غير مدعومة للطباعة");
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error(
      "منع المتصفح نافذة الطباعة؛ اسمح بالنوافذ المنبثقة ثم أعد المحاولة"
    );
  }
  printWindow.opener = null;

  if (kind === "image") {
    try {
      const response = await fetch(options.url, { credentials: "omit" });
      if (!response.ok) throw new Error("تعذر تنزيل الصورة للطباعة");
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("تعذر قراءة الصورة"));
        reader.onerror = () => reject(new Error("تعذر قراءة الصورة"));
        reader.readAsDataURL(blob);
      });
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = window.document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("تعذر تجهيز الصورة للطباعة");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      const tileCount = options.imageTiles ?? 1;
      const columns = Math.sqrt(tileCount);
      const rows = columns;
      const sourceTileWidth = canvas.width / columns;
      const sourceTileHeight = canvas.height / rows;
      const pages = [];

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const tileCanvas = window.document.createElement("canvas");
          tileCanvas.width = Math.ceil(sourceTileWidth);
          tileCanvas.height = Math.ceil(sourceTileHeight);
          const tileContext = tileCanvas.getContext("2d", { alpha: false });
          if (!tileContext) throw new Error("تعذر تجهيز جزء الصورة للطباعة");
          tileContext.fillStyle = "#ffffff";
          tileContext.fillRect(0, 0, tileCanvas.width, tileCanvas.height);
          tileContext.drawImage(
            canvas,
            column * sourceTileWidth,
            row * sourceTileHeight,
            sourceTileWidth,
            sourceTileHeight,
            0,
            0,
            tileCanvas.width,
            tileCanvas.height
          );
          pages.push({
            dataUrl: tileCanvas.toDataURL("image/png"),
            width: tileCanvas.width,
            height: tileCanvas.height,
          });
        }
      }

      await openPrintWindow(
        buildPrintHtml(pages, {
          pagesPerSheet: 1,
          marginMm: 0,
          headerText: "",
          footerText: "",
          showPageNumbers: false,
        }),
        printWindow
      );
      return;
    } catch (error) {
      printWindow.close();
      throw error;
    }
  }

  if (kind === "pdf") {
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
      const viewport = page.getViewport({ scale: 3 });
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
    await openPrintWindow(
      buildPrintHtml(pages, {
        pagesPerSheet: options.pagesPerSheet ?? 1,
        marginMm: 0,
        headerText: "",
        footerText: "",
        showPageNumbers: false,
      }),
      printWindow
    );
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
    `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>طباعة ${escapeHtml(options.fileName)}</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}.docx-wrapper{background:#fff!important;padding:0!important}.docx{box-shadow:none!important;margin:0!important}.sheet{width:210mm;height:297mm;padding:0;display:grid;gap:3mm;direction:ltr;page-break-after:always;break-after:page;overflow:hidden}.sheet:last-child{page-break-after:auto;break-after:auto}.sheet.per-1{grid-template-columns:1fr;grid-template-rows:1fr}.sheet.per-2{grid-template-columns:1fr;grid-template-rows:repeat(2,1fr)}.sheet.per-4{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr)}.sheet.per-6{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(3,1fr)}.sheet.per-8{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(4,1fr)}.cell{position:relative;min-width:0;min-height:0;overflow:hidden;background:#fff;direction:rtl}.cell>.docx{position:absolute;inset:0 auto auto 0;width:210mm!important;min-height:297mm!important;box-shadow:none!important}@media print{html,body{width:210mm}}</style></head><body><div id="docx-print-host" dir="rtl"></div></body></html>`
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
  arrangeWordPages(printWindow.document, host, options.pagesPerSheet ?? 1);
  await new Promise(resolve => printWindow.setTimeout(resolve, 250));
  printWindow.focus();
  printWindow.print();
}

function arrangeWordPages(
  document: Document,
  host: HTMLElement,
  pagesPerSheet: PagesPerSheet
): void {
  const wrapper = host.querySelector<HTMLElement>(".docx-wrapper");
  const pages = Array.from(
    host.querySelectorAll<HTMLElement>(".docx-wrapper > .docx")
  );
  if (pagesPerSheet === 1 || pages.length === 0 || !wrapper) return;
  const fragment = document.createDocumentFragment();
  for (let start = 0; start < pages.length; start += pagesPerSheet) {
    const sheet = document.createElement("section");
    sheet.className = `sheet per-${pagesPerSheet}`;
    pages.slice(start, start + pagesPerSheet).forEach(page => {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.append(page);
      sheet.append(cell);
    });
    fragment.append(sheet);
  }
  // The renderer's styles are siblings of the wrapper and must be retained.
  wrapper.replaceWith(fragment);
  for (const page of pages) {
    const cell = page.parentElement!;
    const pageBounds = page.getBoundingClientRect();
    const cellBounds = cell.getBoundingClientRect();
    const scale = Math.min(
      1,
      cellBounds.width / pageBounds.width,
      cellBounds.height / pageBounds.height
    );
    // Unlike transform, zoom also scales the layout before print pagination.
    page.style.zoom = String(scale);
  }
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
