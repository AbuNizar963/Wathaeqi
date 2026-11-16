export type WatermarkOptions = {
  text?: string;
  imageUrl?: string;
  opacity?: number;
};

/** Builds a centered, full physical-A4 watermark without margin-based offsets. */
export function getDocumentWatermarkStyle(options: WatermarkOptions = {}) {
  const opacity = Number.isFinite(options.opacity)
    ? Math.min(1, Math.max(0, options.opacity ?? 0.1))
    : 0.1;
  return {
    opacity,
    backgroundImage: options.imageUrl
      ? `url("${options.imageUrl.replace(/["\\\\]/g, "")}")`
      : undefined,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center center",
    backgroundSize: "93.75% 93.75%",
    color: `rgba(80, 92, 106, ${opacity})`,
  } as const;
}
