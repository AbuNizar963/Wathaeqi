import { describe, expect, it } from "vitest";
import {
  DOCUMENT_FRAME_STYLES,
  LEGACY_DOCUMENT_FRAME_STYLES,
  WORD_DOCUMENT_FRAME_STYLES,
  getWordDocumentFrameStyle,
  isDocumentFrameStyle,
} from "./documentFrameCatalog";

describe("Word-style document frame catalog", () => {
  it("exposes only the five supported page-border choices", () => {
    expect(WORD_DOCUMENT_FRAME_STYLES).toEqual([
      "none",
      "box",
      "shadow",
      "three-dimensional",
      "double",
    ]);
  });

  it("accepts current presets and legacy saved values for compatibility", () => {
    expect(DOCUMENT_FRAME_STYLES).toContain("box");
    expect(LEGACY_DOCUMENT_FRAME_STYLES).toContain("classic");
    expect(isDocumentFrameStyle("box")).toBe(true);
    expect(isDocumentFrameStyle("f10s")).toBe(true);
    expect(isDocumentFrameStyle("unknown-frame")).toBe(false);
  });

  it.each([
    ["none", "none"],
    ["box", "box"],
    ["shadow", "shadow"],
    ["three-dimensional", "three-dimensional"],
    ["double", "double"],
    ["single", "box"],
    ["classic", "box"],
    ["triple", "three-dimensional"],
    ["ornate", "double"],
    ["f01g", "box"],
    ["f02n", "double"],
    ["f03e", "three-dimensional"],
  ])("maps saved frame value %s to %s", (savedValue, expected) => {
    expect(getWordDocumentFrameStyle(savedValue)).toBe(expected);
  });

  it("falls back to the standard box border for unknown values", () => {
    expect(getWordDocumentFrameStyle("invalid")).toBe("box");
    expect(getWordDocumentFrameStyle(null)).toBe("box");
  });
});
