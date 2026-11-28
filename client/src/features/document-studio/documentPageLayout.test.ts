import { describe, expect, it } from "vitest";
import {
  A4_PREVIEW_PAGE_HEIGHT,
  getDocumentPageBreakOffsets,
  getDocumentPreviewPageHeight,
} from "./documentPageLayout";

describe("document preview page layout", () => {
  it("keeps one page for content that fits within A4", () => {
    expect(getDocumentPreviewPageHeight(900)).toBe(A4_PREVIEW_PAGE_HEIGHT);
    expect(getDocumentPageBreakOffsets(A4_PREVIEW_PAGE_HEIGHT, 0.5)).toEqual(
      []
    );
  });

  it("allocates full A4 sheets and a marker at every page boundary", () => {
    expect(getDocumentPreviewPageHeight(1124)).toBe(2246);
    expect(getDocumentPageBreakOffsets(2246, 0.5)).toEqual([561.5]);
    expect(getDocumentPageBreakOffsets(3369, 1)).toEqual([1123, 2246]);
  });
});
