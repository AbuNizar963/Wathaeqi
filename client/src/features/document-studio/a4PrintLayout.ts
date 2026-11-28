import { A4_PAGE_HEIGHT_RATIO } from "./documentPageLayout";

export type A4PageBoxMetrics = Pick<
  HTMLElement,
  | "clientHeight"
  | "clientWidth"
  | "offsetHeight"
  | "offsetWidth"
  | "scrollHeight"
>;

export type A4BorderWidths = {
  horizontal: number;
  vertical: number;
};

const A4_HEIGHT_TO_WIDTH_RATIO = A4_PAGE_HEIGHT_RATIO;
const A4_ROUNDING_TOLERANCE_PX = 2;

/** Measure the full border box so the document frame is not clipped in print. */
export function measureA4Page(
  element: A4PageBoxMetrics,
  borders: A4BorderWidths,
  editorOverflow = 0
) {
  return {
    width: Math.max(
      element.offsetWidth,
      element.clientWidth + borders.horizontal
    ),
    height: Math.max(
      element.offsetHeight,
      element.scrollHeight + borders.vertical,
      element.clientHeight + Math.max(0, editorOverflow) + borders.vertical
    ),
  };
}

/** Ignore sub-pixel/CSS-pixel rounding at the physical A4 boundary. */
export function countA4Pages(height: number, width: number): number {
  const pageHeight = width * A4_HEIGHT_TO_WIDTH_RATIO;
  if (
    !Number.isFinite(height) ||
    !Number.isFinite(pageHeight) ||
    pageHeight <= 0
  ) {
    return 1;
  }

  return Math.max(
    1,
    Math.ceil(Math.max(0, height - A4_ROUNDING_TOLERANCE_PX) / pageHeight)
  );
}
