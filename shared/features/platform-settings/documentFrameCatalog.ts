/**
 * Word-inspired page-border presets.
 *
 * Legacy frame values remain supported when reading saved settings. The
 * settings interface exposes only WORD_DOCUMENT_FRAME_STYLES.
 */
export const WORD_DOCUMENT_FRAME_STYLES = [
  "none",
  "box",
  "shadow",
  "three-dimensional",
  "double",
] as const;

export type WordDocumentFrameStyle =
  (typeof WORD_DOCUMENT_FRAME_STYLES)[number];

export const LEGACY_DOCUMENT_FRAME_STYLES = [
  "none",
  "single",
  "double",
  "ornate",
  "classic",
  "triple",
] as const;

export type LegacyDocumentFrameStyle =
  (typeof LEGACY_DOCUMENT_FRAME_STYLES)[number];

type LegacyFrameFamilyCode =
  "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10";
type LegacyFramePaletteCode = "g" | "n" | "e" | "b" | "s";
export type LegacyDocumentFramePresetId =
  `f${LegacyFrameFamilyCode}${LegacyFramePaletteCode}`;

export type DocumentFrameStyle =
  | WordDocumentFrameStyle
  | LegacyDocumentFrameStyle
  | LegacyDocumentFramePresetId;

export const DOCUMENT_FRAME_STYLES: readonly DocumentFrameStyle[] = [
  ...WORD_DOCUMENT_FRAME_STYLES,
  ...LEGACY_DOCUMENT_FRAME_STYLES,
];

export function isDocumentFrameStyle(
  value: unknown
): value is DocumentFrameStyle {
  if (typeof value !== "string") return false;
  return (
    DOCUMENT_FRAME_STYLES.includes(value as DocumentFrameStyle) ||
    /^f(?:0[1-9]|10)[gnebs]$/.test(value)
  );
}

export function getWordDocumentFrameStyle(
  value: unknown
): WordDocumentFrameStyle {
  if (
    typeof value === "string" &&
    WORD_DOCUMENT_FRAME_STYLES.includes(value as WordDocumentFrameStyle)
  ) {
    return value as WordDocumentFrameStyle;
  }

  if (value === "none") return "none";
  if (value === "double" || value === "ornate") return "double";
  if (value === "triple") return "three-dimensional";

  if (typeof value === "string" && /^f(?:0[1-9]|10)[gnebs]$/.test(value)) {
    const paletteCode = value.slice(-1);
    if (paletteCode === "e") return "three-dimensional";
    if (paletteCode === "n" || paletteCode === "b") return "double";
    return "box";
  }

  return "box";
}
