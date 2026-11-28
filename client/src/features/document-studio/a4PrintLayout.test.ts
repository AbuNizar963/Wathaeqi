import { describe, expect, it } from "vitest";
import { countA4Pages, measureA4Page } from "./a4PrintLayout";
import {
  A4_PAGE_HEIGHT_RATIO,
  A4_PAGE_ROUNDING_TOLERANCE_PX,
} from "./documentPageLayout";

describe("A4 print layout", () => {
  it("includes the frame in the captured width and keeps rounded A4 on one sheet", () => {
    const page = measureA4Page(
      {
        clientWidth: 791,
        clientHeight: 1120,
        offsetWidth: 794,
        offsetHeight: 1123,
        scrollHeight: 1120,
      },
      { horizontal: 3, vertical: 3 }
    );

    expect(page.width).toBe(794);
    expect(countA4Pages(page.height, page.width)).toBe(1);
  });

  it("preserves an additional page when content genuinely exceeds A4", () => {
    expect(countA4Pages(1125, 794)).toBe(2);
    expect(countA4Pages(2246, 794)).toBe(2);
    expect(countA4Pages(794 * A4_PAGE_HEIGHT_RATIO, 794)).toBe(1);
    expect(countA4Pages(794 * A4_PAGE_HEIGHT_RATIO * 2, 794)).toBe(2);
  });

  it("uses the same page-count threshold as the document preview", () => {
    const pageHeight = 794 * A4_PAGE_HEIGHT_RATIO;

    expect(countA4Pages(pageHeight, 794)).toBe(1);
    expect(countA4Pages(pageHeight + A4_PAGE_ROUNDING_TOLERANCE_PX, 794)).toBe(1);
    expect(countA4Pages(pageHeight + A4_PAGE_ROUNDING_TOLERANCE_PX + 1, 794)).toBe(2);
    expect(countA4Pages(pageHeight * 2, 794)).toBe(2);
    expect(countA4Pages(pageHeight * 2 + A4_PAGE_ROUNDING_TOLERANCE_PX, 794)).toBe(2);
    expect(countA4Pages(pageHeight * 2 + A4_PAGE_ROUNDING_TOLERANCE_PX + 1, 794)).toBe(3);
  });

  it("includes editor overflow and border widths in the measured page", () => {
    const page = measureA4Page(
      {
        clientWidth: 791,
        clientHeight: 1120,
        offsetWidth: 794,
        offsetHeight: 1123,
        scrollHeight: 1120,
      },
      { horizontal: 3, vertical: 3 },
      24
    );

    expect(page).toEqual({ width: 794, height: 1147 });
    expect(countA4Pages(page.height, page.width)).toBe(2);
  });
});
