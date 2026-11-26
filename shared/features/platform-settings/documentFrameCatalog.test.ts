import { describe, expect, it } from "vitest";
import {
  DOCUMENT_FRAME_FAMILIES,
  DOCUMENT_FRAME_PALETTES,
  DOCUMENT_FRAME_STYLES,
  LEGACY_DOCUMENT_FRAME_STYLES,
  PROFESSIONAL_DOCUMENT_FRAME_PRESETS,
  isDocumentFrameStyle,
} from "./documentFrameCatalog";

describe("professional document frame catalog", () => {
  it("provides 50 unique professional presets from ten families and five palettes", () => {
    expect(DOCUMENT_FRAME_FAMILIES).toHaveLength(10);
    expect(DOCUMENT_FRAME_PALETTES).toHaveLength(5);
    expect(PROFESSIONAL_DOCUMENT_FRAME_PRESETS).toHaveLength(50);
    expect(
      new Set(PROFESSIONAL_DOCUMENT_FRAME_PRESETS.map(preset => preset.id)).size
    ).toBe(50);
    expect(
      new Set(
        PROFESSIONAL_DOCUMENT_FRAME_PRESETS.map(preset =>
          [preset.motif, preset.lineCount, preset.dash, preset.color].join(":")
        )
      ).size
    ).toBe(50);
    expect(
      PROFESSIONAL_DOCUMENT_FRAME_PRESETS.every(preset => preset.id.length <= 7)
    ).toBe(true);
  });

  it("accepts all catalogued styles and preserves legacy frame values", () => {
    expect(DOCUMENT_FRAME_STYLES).toHaveLength(
      LEGACY_DOCUMENT_FRAME_STYLES.length + 50
    );
    expect(DOCUMENT_FRAME_STYLES.every(isDocumentFrameStyle)).toBe(true);
    expect(isDocumentFrameStyle("f01g")).toBe(true);
    expect(isDocumentFrameStyle("unknown-frame")).toBe(false);
  });
});
