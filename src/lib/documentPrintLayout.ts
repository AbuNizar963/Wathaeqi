export const A4_PAGE_WIDTH_PX = 794;
export const A4_PAGE_HEIGHT_PX = 1123;
export const A4_PAGE_WIDTH_MM = 210;
export const A4_PAGE_HEIGHT_MM = 297;
export const A4_PAGE_MARGIN_MM = 10;
export const A4_CONTENT_WIDTH_MM = A4_PAGE_WIDTH_MM - A4_PAGE_MARGIN_MM * 2;
export const A4_CONTENT_HEIGHT_MM = A4_PAGE_HEIGHT_MM - A4_PAGE_MARGIN_MM * 2;
export const A4_PREVIEW_GAP_PX = 18;

/** A4 geometry shared by the on-screen sheet and the print stylesheet. */
export function getA4DocumentLayoutCss(selector = ".document-paper") {
  return `
    ${selector} {
      box-sizing: border-box;
      width: ${A4_PAGE_WIDTH_PX}px;
      min-height: ${A4_PAGE_HEIGHT_PX}px;
      padding: ${A4_PAGE_MARGIN_MM}mm;
      margin: 0 auto;
      position: relative;
      background: #fff;
      overflow: visible;
      isolation: isolate;
    }
    ${selector} .document-paper-content {
      position: relative;
      z-index: 1;
      min-height: calc(297mm - 20mm);
    }
    ${selector} .document-watermark {
      position: absolute;
      z-index: 0;
      inset: 0;
      width: 210mm;
      height: 297mm;
      display: grid;
      place-items: center;
      overflow: hidden;
      pointer-events: none;
      user-select: none;
      color: rgba(80, 92, 106, .10);
      font: 700 42pt Tahoma, Arial, sans-serif;
      transform: none;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @page {
      size: A4 portrait;
      margin: 0;
    }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }
      ${selector} {
        box-sizing: border-box !important;
        width: 210mm !important;
        min-height: 297mm !important;
        height: auto !important;
        max-height: none !important;
        margin: 0 auto !important;
        padding: 10mm !important;
        overflow: visible !important;
        box-shadow: none !important;
        break-after: auto;
        break-inside: auto;
      }
      ${selector} .document-paper-content {
        min-height: 277mm;
      }
      ${selector} .document-watermark {
        position: absolute !important;
        inset: 0 !important;
        width: 210mm !important;
        height: 297mm !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      ${selector} .ProseMirror,
      ${selector} .document-editor {
        overflow: visible !important;
      }
      ${selector} table {
        break-inside: auto;
        page-break-inside: auto;
      }
      ${selector} tr, ${selector} img, ${selector} .keep-together {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  `;
}
