export const A4_PREVIEW_WIDTH = 794;
export const A4_PAGE_HEIGHT_RATIO = 297 / 210;
export const A4_PREVIEW_PAGE_HEIGHT = A4_PREVIEW_WIDTH * A4_PAGE_HEIGHT_RATIO;
export const A4_PAGE_ROUNDING_TOLERANCE_PX = 1;

export function getDocumentPreviewPageHeight(contentHeight: number): number {
  if (!Number.isFinite(contentHeight)) return A4_PREVIEW_PAGE_HEIGHT;

  const pages = Math.max(
    1,
    Math.ceil(
      Math.max(0, contentHeight - A4_PAGE_ROUNDING_TOLERANCE_PX) /
        A4_PREVIEW_PAGE_HEIGHT
    )
  );
  return pages * A4_PREVIEW_PAGE_HEIGHT;
}

export function getDocumentPageBreakOffsets(
  pageHeight: number,
  scale: number
): number[] {
  const safeHeight = Number.isFinite(pageHeight)
    ? Math.max(A4_PREVIEW_PAGE_HEIGHT, pageHeight)
    : A4_PREVIEW_PAGE_HEIGHT;
  const safeScale = Number.isFinite(scale) ? Math.max(0, scale) : 1;
  const pageCount = Math.ceil(
    Math.max(0, safeHeight - A4_PAGE_ROUNDING_TOLERANCE_PX) /
      A4_PREVIEW_PAGE_HEIGHT
  );

  return Array.from(
    { length: Math.max(0, pageCount - 1) },
    (_, index) => (index + 1) * A4_PREVIEW_PAGE_HEIGHT * safeScale
  );
}

/**
 * Calculate each page boundary from its absolute position. Rounding each
 * boundary avoids accumulating a fractional-pixel error across printed pages.
 */
export function getA4PagePixelBounds(
  pageIndex: number,
  pixelScale: number
): { top: number; bottom: number; height: number } {
  const safePageIndex = Number.isFinite(pageIndex)
    ? Math.max(0, Math.floor(pageIndex))
    : 0;
  const safeScale = Number.isFinite(pixelScale) ? Math.max(0, pixelScale) : 1;
  const top = Math.round(safePageIndex * A4_PREVIEW_PAGE_HEIGHT * safeScale);
  const bottom = Math.round(
    (safePageIndex + 1) * A4_PREVIEW_PAGE_HEIGHT * safeScale
  );

  return { top, bottom, height: Math.max(1, bottom - top) };
}
