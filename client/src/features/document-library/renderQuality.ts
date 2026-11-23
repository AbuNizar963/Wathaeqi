export const DEFAULT_PRINT_PIXEL_RATIO = 4;
export const MAX_RASTER_PIXELS = 24_000_000;
export const MAX_RASTER_EDGE = 16_000;

/**
 * Return the highest requested raster ratio that stays within practical browser
 * canvas limits. At the normal A4 size the target ratio is preserved; unusually
 * large pages are reduced only as much as needed to avoid a failed canvas.
 */
export function getBoundedPixelRatio(
  width: number,
  height: number,
  targetRatio = DEFAULT_PRINT_PIXEL_RATIO
): number {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(targetRatio) ||
    targetRatio <= 0
  ) {
    return DEFAULT_PRINT_PIXEL_RATIO;
  }

  const areaRatio = Math.sqrt(MAX_RASTER_PIXELS / (width * height));
  const edgeRatio = MAX_RASTER_EDGE / Math.max(width, height);
  return Math.min(targetRatio, areaRatio, edgeRatio);
}

export function canvasToPngObjectUrl(
  canvas: HTMLCanvasElement
): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("تعذر إنشاء صورة PNG للطباعة"));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}
