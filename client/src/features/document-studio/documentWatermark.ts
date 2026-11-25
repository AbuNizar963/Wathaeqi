export const OFFICIAL_ORGANIZATION_NAME = "وزارة الداخلية";
export const DOCUMENT_WATERMARK_ROWS = 33;
export const DOCUMENT_WATERMARK_COLUMNS = 13;
export const DOCUMENT_WATERMARK_DEFAULT_OPACITY = 0.12;

/** The same physical A4 geometry and staggered Ruqaa pattern as the reference. */
export function buildDocumentWatermarkCss(opacity: number, scale = 1): string {
  const safeOpacity = Number.isFinite(opacity)
    ? Math.min(0.6, Math.max(0, opacity))
    : DOCUMENT_WATERMARK_DEFAULT_OPACITY;
  const safeScale = Number.isFinite(scale)
    ? Math.min(1.8, Math.max(0.4, scale))
    : 1;
  return [
    ".document-watermark-layer {",
    `  --document-watermark-opacity: ${safeOpacity};`,
    `  --document-watermark-scale: ${safeScale};`,
    "}",
  ].join("\n");
}

/**
 * Returns how many vertically stacked A4 sheets are needed for a measured
 * preview.
 */
export function getA4PreviewPageCount(
  width: number,
  contentHeight: number
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
  return Math.max(1, Math.ceil(Math.max(0, contentHeight - 1) / pageHeight));
}
