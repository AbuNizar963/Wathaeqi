import { describe, expect, it } from "vitest";
import {
  buildDocumentWatermarkCss,
  DOCUMENT_WATERMARK_COLUMNS,
  DOCUMENT_WATERMARK_DEFAULT_OPACITY,
  DOCUMENT_WATERMARK_ROWS,
} from "./documentWatermark";

describe("official document watermark", () => {
  it("uses the reference A4 geometry and dense repeated pattern", () => {
    const css = buildDocumentWatermarkCss(0.12);
    expect(DOCUMENT_WATERMARK_ROWS).toBe(33);
    expect(DOCUMENT_WATERMARK_COLUMNS).toBe(13);
    expect(css).toContain("width: 210mm;");
    expect(css).toContain("height: 297mm;");
    expect(css).toContain("inset: 2.4mm 3.2mm 3mm;");
    expect(css).toContain('font-family: "Aref Ruqaa", serif;');
    expect(css).toContain("font-size: 11pt;");
    expect(css).toContain("gap: 6.16mm;");
    expect(css).toContain("width: 93.75%;");
    expect(css).toContain("opacity: 0.12;");
  });

  it("clamps malformed opacity values without disabling the watermark", () => {
    expect(buildDocumentWatermarkCss(2)).toContain("opacity: 0.6;");
    expect(buildDocumentWatermarkCss(-1)).toContain("opacity: 0;");
    expect(buildDocumentWatermarkCss(Number.NaN)).toContain(
      `opacity: ${DOCUMENT_WATERMARK_DEFAULT_OPACITY};`
    );
  });
});
