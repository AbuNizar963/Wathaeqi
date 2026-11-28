import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRINT_PIXEL_RATIO,
  MAX_RASTER_EDGE,
  MAX_RASTER_PIXELS,
  getBoundedPixelRatio,
} from "./renderQuality";

describe("document raster quality limits", () => {
  it("keeps the full high-quality ratio for ordinary A4 pages", () => {
    expect(getBoundedPixelRatio(794, 1123)).toBe(DEFAULT_PRINT_PIXEL_RATIO);
    expect(getBoundedPixelRatio(595, 842, 5)).toBe(5);
  });

  it("caps large page output to the browser canvas pixel budget", () => {
    const ratio = getBoundedPixelRatio(
      10_000,
      10_000,
      DEFAULT_PRINT_PIXEL_RATIO
    );
    expect(ratio).toBeLessThan(DEFAULT_PRINT_PIXEL_RATIO);
    expect(10_000 * ratio * (10_000 * ratio)).toBeLessThanOrEqual(
      MAX_RASTER_PIXELS
    );
  });

  it("caps unusually long pages to the maximum canvas edge", () => {
    const ratio = getBoundedPixelRatio(50_000, 100, 5);
    expect(50_000 * ratio).toBeLessThanOrEqual(MAX_RASTER_EDGE);
  });

  it("uses a safe default for invalid dimensions", () => {
    expect(getBoundedPixelRatio(0, 100)).toBe(DEFAULT_PRINT_PIXEL_RATIO);
    expect(getBoundedPixelRatio(Number.NaN, 100)).toBe(
      DEFAULT_PRINT_PIXEL_RATIO
    );
  });
});
