import type {
  PagesPerSheet,
  PrintLayoutMode,
  PrintOptions,
  SourcePage,
} from "./types";

export function groupPages(
  pages: SourcePage[],
  perSheet: PagesPerSheet
): SourcePage[][] {
  const sheets: SourcePage[][] = [];
  for (let index = 0; index < pages.length; index += perSheet) {
    sheets.push(pages.slice(index, index + perSheet));
  }
  return sheets;
}

/** Build sheets without mixing sequential document pages with repeated copies. */
export function buildPrintSheets(
  pages: SourcePage[],
  mode: PrintLayoutMode,
  count: PagesPerSheet
): SourcePage[][] {
  if (mode === "sequential") return groupPages(pages, count);
  return pages.map(page => Array.from({ length: count }, () => page));
}

export interface PrintWindowContent {
  pages: SourcePage[];
  options: PrintOptions;
  title?: string;
}

function safeImageSource(source: string): string {
  if (/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,/i.test(source)) {
    return source;
  }
  try {
    const url = new URL(source, window.location.href);
    if (url.protocol === "blob:" && url.origin === window.location.origin) {
      return source;
    }
  } catch {
    // Invalid and non-image URL schemes are never accepted for print images.
  }
  return "";
}

/** One rasterized PDF page per sheet, preserving its original physical size. */
export function buildSinglePdfPagesHtml(
  pages: Array<SourcePage & { widthPt: number; heightPt: number }>
): string {
  const rules = pages
    .map((page, index) => {
      if (
        !Number.isFinite(page.widthPt) ||
        !Number.isFinite(page.heightPt) ||
        page.widthPt <= 0 ||
        page.heightPt <= 0
      ) {
        throw new Error("أبعاد صفحة PDF غير صالحة للطباعة");
      }
      return `@page pdfpage${index} { size: ${page.widthPt}pt ${page.heightPt}pt; margin: 0; }
        .page${index} { page: pdfpage${index}; width: ${page.widthPt}pt; height: ${page.heightPt}pt; }`;
    })
    .join("\n");
  const content = pages
    .map(
      (page, index) =>
        `<section class="page page${index}"><img src="${escapeHtml(safeImageSource(page.src))}" alt="" /></section>`
    )
    .join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" />
    <title>طباعة الوثيقة</title><style>
    ${rules}
    html, body { margin: 0; padding: 0; background: white; }
    .page { break-after: page; page-break-after: always; overflow: hidden; }
    .page:last-child { break-after: auto; page-break-after: auto; }
    .page img { width: 100%; height: 100%; display: block; }
    </style></head><body>${content}</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPrintHtml(
  pages: SourcePage[],
  options: PrintOptions
): string {
  const mode = options.layoutMode ?? "sequential";
  const count =
    mode === "repeat" ? (options.copiesPerSheet ?? 1) : options.pagesPerSheet;
  const orientation = options.orientation ?? "portrait";
  const isLandscape = orientation === "landscape";
  const sheets = buildPrintSheets(pages, mode, count);
  const margin = Math.min(
    20,
    Math.max(0, Number.isFinite(options.marginMm) ? options.marginMm : 0)
  );
  const header = options.headerText.trim();
  const footer = options.footerText.trim();
  const sheetMarkup = sheets
    .map((sheet, sheetIndex) => {
      const cells = sheet
        .map(
          page =>
            `<div class="cell"><img src="${escapeHtml(safeImageSource(page.src))}" alt="" /></div>`
        )
        .join("");
      const counter = options.showPageNumbers
        ? `<span class="counter">ورقة ${sheetIndex + 1} من ${sheets.length}</span>`
        : "";
      return `<section class="sheet">
        ${header ? `<header class="sheet-header">${escapeHtml(header)}</header>` : ""}
        <div class="grid ${isLandscape ? "landscape" : "portrait"} per-${count}" dir="ltr">${cells}</div>
        ${
          footer || counter
            ? `<footer class="sheet-footer"><span>${escapeHtml(footer)}</span>${counter}</footer>`
            : ""
        }
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>طباعة الوثيقة</title>
<style>
  @page { size: A4 ${orientation}; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body { font-family: "Cairo", "Noto Naskh Arabic", "Segoe UI", Tahoma, sans-serif; color: #0f172a; }
  .sheet {
    width: ${isLandscape ? "297mm" : "210mm"};
    height: ${isLandscape ? "210mm" : "297mm"};
    padding: ${margin}mm;
    display: flex;
    flex-direction: column;
    gap: 2mm;
    page-break-after: always;
    break-after: page;
    overflow: hidden;
    background: #ffffff;
  }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .sheet-header {
    flex: 0 0 auto;
    font-size: 9pt;
    color: #475569;
    text-align: center;
    border-bottom: 0.25mm solid #cbd5e1;
    padding-bottom: 1.5mm;
  }
  .sheet-footer {
    flex: 0 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 4mm;
    font-size: 8pt;
    color: #64748b;
    border-top: 0.25mm solid #cbd5e1;
    padding-top: 1.5mm;
  }
  .counter { margin-inline-start: auto; white-space: nowrap; }
  .grid { flex: 1 1 auto; display: grid; grid-auto-flow: row; gap: 3mm; min-height: 0; direction: ltr; }
  .per-1 { grid-template-columns: 1fr; grid-template-rows: 1fr; }
  .per-2 { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
  .per-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
  .per-6 { grid-template-columns: 1fr 1fr; grid-template-rows: repeat(3, 1fr); }
  .per-8 { grid-template-columns: 1fr 1fr; grid-template-rows: repeat(4, 1fr); }
  .grid.landscape.per-2 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr; }
  .grid.landscape.per-6 { grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr); }
  .grid.landscape.per-8 { grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(2, 1fr); }
  .cell {
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 0.2mm solid #e2e8f0;
    background: #ffffff;
    direction: rtl;
  }
  .cell img { width: 100%; height: 100%; object-fit: contain; display: block; }
  @media screen {
    body { background: #e2e8f0; padding: 8mm 0; }
    .sheet { margin: 0 auto 8mm; box-shadow: 0 2mm 8mm rgba(15, 23, 42, 0.18); }
  }
</style>
</head>
<body>${sheetMarkup}</body>
</html>`;
}

export async function openPrintWindow(
  content: PrintWindowContent,
  targetWindow?: Window
): Promise<void> {
  const printWindow = targetWindow ?? window.open("", "_blank");
  if (!printWindow) {
    throw new Error(
      "منع المتصفح نافذة الطباعة؛ اسمح بالنوافذ المنبثقة ثم أعد المحاولة"
    );
  }
  printWindow.opener = null;
  const { pages, options } = content;
  const mode = options.layoutMode ?? "sequential";
  const count =
    mode === "repeat" ? (options.copiesPerSheet ?? 1) : options.pagesPerSheet;
  const orientation = options.orientation ?? "portrait";
  const landscape = orientation === "landscape";
  const margin = Math.min(
    20,
    Math.max(0, Number.isFinite(options.marginMm) ? options.marginMm : 0)
  );
  const sheets = buildPrintSheets(pages, mode, count);
  const doc = printWindow.document;
  doc.documentElement.lang = "ar";
  doc.documentElement.dir = "rtl";
  doc.head.replaceChildren();
  doc.body.replaceChildren();
  const charset = doc.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  doc.head.append(charset);
  const title = doc.createElement("title");
  title.textContent = content.title ?? "طباعة الوثيقة";
  doc.head.append(title);
  const style = doc.createElement("style");
  style.textContent = `
    @page { size: A4 ${orientation}; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: "Cairo", "Noto Naskh Arabic", "Segoe UI", Tahoma, sans-serif; color: #0f172a; }
    .sheet { width: ${landscape ? "297mm" : "210mm"}; height: ${landscape ? "210mm" : "297mm"}; padding: ${margin}mm; display: flex; flex-direction: column; gap: 2mm; page-break-after: always; break-after: page; overflow: hidden; background: #fff; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    .sheet-header { flex: 0 0 auto; font-size: 9pt; color: #475569; text-align: center; border-bottom: .25mm solid #cbd5e1; padding-bottom: 1.5mm; }
    .sheet-footer { flex: 0 0 auto; display: flex; justify-content: space-between; align-items: center; gap: 4mm; font-size: 8pt; color: #64748b; border-top: .25mm solid #cbd5e1; padding-top: 1.5mm; }
    .counter { margin-inline-start: auto; white-space: nowrap; }
    .grid { flex: 1 1 auto; display: grid; grid-auto-flow: row; gap: 3mm; min-height: 0; direction: ltr; }
    .per-1 { grid-template-columns: 1fr; grid-template-rows: 1fr; }
    .per-2 { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
    .per-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
    .per-6 { grid-template-columns: 1fr 1fr; grid-template-rows: repeat(3, 1fr); }
    .per-8 { grid-template-columns: 1fr 1fr; grid-template-rows: repeat(4, 1fr); }
    .grid.landscape.per-2 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr; }
    .grid.landscape.per-6 { grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr); }
    .grid.landscape.per-8 { grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(2, 1fr); }
    .cell { min-width: 0; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; border: .2mm solid #e2e8f0; background: #fff; direction: rtl; }
    .cell img { width: 100%; height: 100%; object-fit: contain; display: block; }
    @media screen { body { background: #e2e8f0; padding: 8mm 0; } .sheet { margin: 0 auto 8mm; box-shadow: 0 2mm 8mm rgba(15,23,42,.18); } }
  `;
  doc.head.append(style);
  sheets.forEach((sheetPages, sheetIndex) => {
    const sheet = doc.createElement("section");
    sheet.className = "sheet";
    if (options.headerText.trim()) {
      const header = doc.createElement("header");
      header.className = "sheet-header";
      header.textContent = options.headerText.trim();
      sheet.append(header);
    }
    const grid = doc.createElement("div");
    grid.className = `grid ${landscape ? "landscape" : "portrait"} per-${count}`;
    grid.dir = "ltr";
    sheetPages.forEach(page => {
      const cell = doc.createElement("div");
      cell.className = "cell";
      const imageSource = safeImageSource(page.src);
      if (!imageSource) throw new Error("مصدر صورة الطباعة غير مسموح");
      const image = doc.createElement("img");
      image.alt = "";
      image.src = imageSource;
      cell.append(image);
      grid.append(cell);
    });
    sheet.append(grid);
    const footerText = options.footerText.trim();
    if (footerText || options.showPageNumbers) {
      const footer = doc.createElement("footer");
      footer.className = "sheet-footer";
      const text = doc.createElement("span");
      text.textContent = footerText;
      footer.append(text);
      if (options.showPageNumbers) {
        const counter = doc.createElement("span");
        counter.className = "counter";
        counter.textContent = `ورقة ${sheetIndex + 1} من ${sheets.length}`;
        footer.append(counter);
      }
      sheet.append(footer);
    }
    doc.body.append(sheet);
  });
  const images = Array.from(printWindow.document.images);
  const blobUrls = images
    .map(image => image.src)
    .filter(src => src.startsWith("blob:"));
  let released = false;
  const releaseBlobUrls = () => {
    if (released) return;
    released = true;
    blobUrls.forEach(src => URL.revokeObjectURL(src));
  };
  printWindow.addEventListener("beforeunload", releaseBlobUrls, { once: true });
  printWindow.addEventListener("pagehide", releaseBlobUrls, { once: true });
  await Promise.all(
    images.map(
      image =>
        new Promise<void>(resolve => {
          const finish = () => resolve();
          if (!image.complete) {
            image.addEventListener("load", finish, { once: true });
            image.addEventListener("error", finish, { once: true });
            return;
          }
          if (typeof image.decode === "function") {
            void image.decode().then(finish, finish);
          } else {
            finish();
          }
        })
    )
  );
  await new Promise(resolve => window.setTimeout(resolve, 350));
  printWindow.focus();
  printWindow.print();
}
