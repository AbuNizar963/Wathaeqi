export const MAX_PDF_PREVIEW_PIXELS = 3_000_000;
export const MAX_PDF_PREVIEW_SCALE = 1.6;

export function calculatePdfPreviewScale(
  pageWidth: number,
  pageHeight: number,
  availableWidth: number,
  maxPixels = MAX_PDF_PREVIEW_PIXELS
): number {
  if (
    !Number.isFinite(pageWidth) ||
    !Number.isFinite(pageHeight) ||
    !Number.isFinite(availableWidth) ||
    pageWidth <= 0 ||
    pageHeight <= 0 ||
    availableWidth <= 0 ||
    maxPixels <= 0
  ) {
    return 1;
  }
  const fitWidth = availableWidth / pageWidth;
  const fitMemory = Math.sqrt(maxPixels / (pageWidth * pageHeight));
  return Math.min(MAX_PDF_PREVIEW_SCALE, fitWidth, fitMemory);
}
