export const A4_PREVIEW_WIDTH = 794;
export const A4_PREVIEW_PAGE_HEIGHT = 1123;

export function getDocumentPreviewPageHeight(contentHeight: number): number {
  if (!Number.isFinite(contentHeight)) return A4_PREVIEW_PAGE_HEIGHT;

  const pages = Math.max(
    1,
    Math.ceil(Math.max(0, contentHeight) / A4_PREVIEW_PAGE_HEIGHT)
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
  const pageCount = Math.ceil(safeHeight / A4_PREVIEW_PAGE_HEIGHT);

  return Array.from(
    { length: Math.max(0, pageCount - 1) },
    (_, index) => (index + 1) * A4_PREVIEW_PAGE_HEIGHT * safeScale
  );
}
