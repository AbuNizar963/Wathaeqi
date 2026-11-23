import { describe, expect, it } from "vitest";
import {
  calculatePdfPreviewScale,
  MAX_PDF_PREVIEW_PIXELS,
} from "./pdfPreviewSizing";

describe("calculatePdfPreviewScale", () => {
  it("fits a page to a narrow phone viewport", () => {
    expect(calculatePdfPreviewScale(600, 800, 320)).toBeCloseTo(0.5333, 3);
  });

  it("caps high-resolution pages to the preview pixel budget", () => {
    const width = 2400;
    const height = 3400;
    const scale = calculatePdfPreviewScale(width, height, 1200);
    expect(width * scale * (height * scale)).toBeLessThanOrEqual(
      MAX_PDF_PREVIEW_PIXELS + 1
    );
  });
});
