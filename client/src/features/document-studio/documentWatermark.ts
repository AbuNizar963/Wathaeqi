export const OFFICIAL_ORGANIZATION_NAME = "وثائقي";
export const DOCUMENT_WATERMARK_ROWS = 33;
export const DOCUMENT_WATERMARK_COLUMNS = 13;
export const DOCUMENT_WATERMARK_DEFAULT_OPACITY = 0.12;

/** The same physical A4 geometry and staggered Ruqaa pattern as the reference. */
export function buildDocumentWatermarkCss(opacity: number): string {
  const safeOpacity = Number.isFinite(opacity)
    ? Math.min(0.6, Math.max(0, opacity))
    : DOCUMENT_WATERMARK_DEFAULT_OPACITY;
  return `
    .document-a4-page {
      background-color: white;
      background-image: linear-gradient(
        to bottom,
        #fff 0,
        #fff calc(var(--document-page-height, 1122.52px) - 12px),
        #e2e8f0 calc(var(--document-page-height, 1122.52px) - 12px),
        #e2e8f0 var(--document-page-height, 1122.52px)
      );
      background-size: 100% var(--document-page-height, 1122.52px);
      background-repeat: repeat-y;
    }
    @media print {
      .document-a4-page {
        background-image: none;
        background-color: white;
      }
      .document-a4-page .document-watermark-layer {
        position: fixed;
        top: 0;
        left: 0;
        width: 210mm;
        height: 297mm;
        overflow: hidden;
      }
      .document-a4-page .document-watermark-layer .page-watermark:not(:first-child) {
        display: none;
      }
      .document-a4-page .document-watermark-layer .page-watermark:first-child {
        top: 0 !important;
        width: 210mm !important;
        height: 297mm !important;
      }
    }
    .page-watermark {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      overflow: hidden;
      pointer-events: none;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page-watermark .watermark-logo {
      position: absolute;
      z-index: 1;
      top: 50%;
      left: 50%;
      width: 93.75%;
      height: 93.75%;
      transform: translate(-50%, -50%);
      object-fit: contain;
      opacity: ${safeOpacity};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page-watermark .watermark-text-pattern {
      position: absolute;
      z-index: 0;
      inset: 2.4mm 3.2mm 3mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      gap: 0;
      overflow: hidden;
      opacity: ${safeOpacity};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page-watermark .watermark-text-row {
      display: flex;
      flex: 0 0 auto;
      width: max-content;
      gap: 6.16mm;
      white-space: nowrap;
    }
    .page-watermark .watermark-text-row-offset {
      transform: translateX(-10.3mm);
    }
    .page-watermark .watermark-text-pattern span {
      color: #73777d;
      text-align: center;
      font-family: "Aref Ruqaa", serif;
      font-size: 11pt;
      font-weight: 400;
      line-height: 1;
      white-space: nowrap;
    }
  `;
}

/**
 * Returns how many vertically stacked A4 sheets are needed for a measured
 * preview.
 */
export function getA4PreviewPageCount(
  width: number,
  contentHeight: number,
): number {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(contentHeight) ||
    width <= 0 ||
    contentHeight <= 0
  ) {
    return 1;
  }
  const pageHeight = (width * 297) / 210;
  return Math.max(
    1,
    Math.ceil(Math.max(0, contentHeight - 1) / pageHeight),
  );
}
