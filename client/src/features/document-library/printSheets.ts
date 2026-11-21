import type { PagesPerSheet, PrintOptions, SourcePage } from "./types";

export function duplicatePages(
  pages: SourcePage[],
  copiesPerPage: 1 | 2 | 4
): SourcePage[] {
  return pages.flatMap(page =>
    Array.from({ length: copiesPerPage }, () => page)
  );
}

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
  const sheets = groupPages(pages, options.pagesPerSheet);
  const margin = Math.min(20, Math.max(0, options.marginMm));
  const header = options.headerText.trim();
  const footer = options.footerText.trim();
  const sheetMarkup = sheets
    .map((sheet, sheetIndex) => {
      const cells = sheet
        .map(
          page => `<div class="cell"><img src="${page.dataUrl}" alt="" /></div>`
        )
        .join("");
      const counter = options.showPageNumbers
        ? `<span class="counter">ورقة ${sheetIndex + 1} من ${sheets.length}</span>`
        : "";
      return `<section class="sheet">
        ${header ? `<header class="sheet-header">${escapeHtml(header)}</header>` : ""}
        <div class="grid per-${options.pagesPerSheet}">${cells}</div>
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
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body { font-family: "Cairo", "Noto Naskh Arabic", "Segoe UI", Tahoma, sans-serif; color: #0f172a; }
  .sheet {
    width: 210mm;
    height: 297mm;
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
  .grid { flex: 1 1 auto; display: grid; gap: 3mm; min-height: 0; }
  .per-1 { grid-template-columns: 1fr; grid-template-rows: 1fr; }
  .per-2 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr; }
  .per-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
  .per-6 { grid-template-columns: 1fr 1fr; grid-template-rows: repeat(3, 1fr); }
  .per-8 { grid-template-columns: 1fr 1fr; grid-template-rows: repeat(4, 1fr); }
  .cell {
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 0.2mm solid #e2e8f0;
    background: #ffffff;
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
  html: string,
  targetWindow?: Window
): Promise<void> {
  const printWindow = targetWindow ?? window.open("", "_blank");
  if (!printWindow) {
    throw new Error(
      "منع المتصفح نافذة الطباعة؛ اسمح بالنوافذ المنبثقة ثم أعد المحاولة"
    );
  }
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  const images = Array.from(printWindow.document.images);
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
