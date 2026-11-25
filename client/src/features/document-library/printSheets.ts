import { createPrintRoot, invokePagePrint } from "./printDom";
import type { DocumentOperationOptions } from "../document-progress/documentProgress";
import type {
  PagesPerSheet,
  PrintLayoutMode,
  PrintOptions,
  PrintOrientation,
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

export interface PrintWindowContent extends DocumentOperationOptions {
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

/** Fit one rasterized PDF page on each standard A4 print sheet. */
export function buildSinglePdfPagesHtml(
  pages: Array<SourcePage & { widthPt: number; heightPt: number }>,
  orientation: PrintOrientation = "portrait"
): string {
  const pageWidth = orientation === "landscape" ? 842 : 595;
  const pageHeight = orientation === "landscape" ? 595 : 842;
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
      return `@page pdfpage${index} { size: A4 ${orientation}; margin: 0; }
        .page${index} { page: pdfpage${index}; width: ${pageWidth}pt; height: ${pageHeight}pt; }`;
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
    .page img { width: 100%; height: 100%; object-fit: contain; display: block; }
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

/** Print generated markup in an isolated root within the current page. */
export async function printHtmlDocument(
  targetWindow: Window,
  html: string,
  options: DocumentOperationOptions = {},
  release?: () => void
): Promise<void> {
  if (targetWindow !== window)
    throw new Error("الطباعة متاحة داخل الصفحة الحالية فقط");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const css = Array.from(
    parsed.querySelectorAll("style"),
    style => style.textContent ?? ""
  ).join("\n");
  const landscape = /size:\s*A4 landscape/.test(css);
  const session = createPrintRoot(
    parsed.title || "طباعة الوثيقة",
    css,
    landscape ? 297 : 210
  );
  if (release) session.addCleanup(release);
  try {
    session.root.append(
      ...Array.from(parsed.body.childNodes, node =>
        document.importNode(node, true)
      )
    );
    await invokePagePrint(session.root, options);
  } catch (error) {
    session.cleanup();
    throw error;
  }
}

/** Compatibility name: this never opens a new browsing context. */
export async function openPrintWindow(
  content: PrintWindowContent,
  targetWindow: Window = window
): Promise<void> {
  const { pages, options } = content;
  if (!pages.length) throw new Error("لا توجد صفحات قابلة للطباعة");
  const singleOriginal =
    (options.layoutMode ?? "sequential") === "sequential" &&
    options.pagesPerSheet === 1 &&
    options.marginMm === 0 &&
    !options.headerText &&
    !options.footerText &&
    !options.showPageNumbers;
  const hasPdfPageSizes = pages.every(
    page =>
      "widthPt" in page &&
      "heightPt" in page &&
      Number.isFinite(page.widthPt) &&
      Number.isFinite(page.heightPt)
  );
  const html =
    hasPdfPageSizes && singleOriginal
      ? buildSinglePdfPagesHtml(
          pages as Array<SourcePage & { widthPt: number; heightPt: number }>,
          options.orientation
        )
      : buildPrintHtml(pages, options);
  const titledHtml = html.replace(
    "<title>طباعة الوثيقة</title>",
    `<title>${escapeHtml(content.title ?? "طباعة الوثيقة")}</title>`
  );
  const urls = new Set(
    pages.map(page => page.src).filter(src => src.startsWith("blob:"))
  );
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    urls.forEach(url => URL.revokeObjectURL(url));
  };
  try {
    await printHtmlDocument(targetWindow, titledHtml, content, release);
  } catch (error) {
    release();
    throw error;
  }
}
