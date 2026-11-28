import { describe, expect, it } from "vitest";
import {
  A4_PREVIEW_PAGE_HEIGHT,
  getA4PagePixelBounds,
  getDocumentPageBreakOffsets,
  getDocumentPreviewPageHeight,
} from "./documentPageLayout";

describe("document preview page layout", () => {
  it("uses the same physical A4 ratio as print rendering", () => {
    expect(A4_PREVIEW_PAGE_HEIGHT).toBeCloseTo((794 * 297) / 210, 8);
    expect(getDocumentPreviewPageHeight(900)).toBe(A4_PREVIEW_PAGE_HEIGHT);
    expect(getDocumentPreviewPageHeight(1123)).toBe(A4_PREVIEW_PAGE_HEIGHT);
    expect(getDocumentPageBreakOffsets(A4_PREVIEW_PAGE_HEIGHT, 0.5)).toEqual(
      []
    );
  });

  it("allocates full A4 sheets and a marker at every page boundary", () => {
    expect(getDocumentPreviewPageHeight(1124)).toBeCloseTo(
      A4_PREVIEW_PAGE_HEIGHT * 2,
      8
    );
    expect(
      getDocumentPageBreakOffsets(A4_PREVIEW_PAGE_HEIGHT * 2, 0.5)
    ).toEqual([A4_PREVIEW_PAGE_HEIGHT * 0.5]);
    expect(getDocumentPageBreakOffsets(A4_PREVIEW_PAGE_HEIGHT * 3, 1)).toEqual([
      A4_PREVIEW_PAGE_HEIGHT,
      A4_PREVIEW_PAGE_HEIGHT * 2,
    ]);
  });

  it("rounds absolute pixel boundaries without accumulating page drift", () => {
    expect(getA4PagePixelBounds(0, 1)).toEqual({
      top: 0,
      bottom: 1123,
      height: 1123,
    });
    expect(getA4PagePixelBounds(1, 1)).toEqual({
      top: 1123,
      bottom: 2246,
      height: 1123,
    });
    expect(getA4PagePixelBounds(2, 1)).toEqual({
      top: 2246,
      bottom: 3369,
      height: 1123,
    });
  });
});
