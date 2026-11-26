export const LEGACY_DOCUMENT_FRAME_STYLES = [
  "none",
  "single",
  "double",
  "ornate",
  "classic",
  "triple",
] as const;

export const DOCUMENT_FRAME_FAMILIES = [
  { code: "01", label: "عصري رفيع", motif: "minimal" },
  { code: "02", label: "كلاسيكي مزدوج", motif: "classic" },
  { code: "03", label: "آرت ديكو", motif: "deco" },
  { code: "04", label: "أرابيسك", motif: "arabesque" },
  { code: "05", label: "أكاديمي مزخرف", motif: "academic" },
  { code: "06", label: "هندسي", motif: "geometric" },
  { code: "07", label: "غصون الزيتون", motif: "botanical" },
  { code: "08", label: "دبلوماسي", motif: "diplomatic" },
  { code: "09", label: "إمبراطوري", motif: "imperial" },
  { code: "10", label: "رسمية حديثة", motif: "official" },
] as const;

export const DOCUMENT_FRAME_PALETTES = [
  {
    code: "g",
    label: "ذهبي مفرد",
    color: "#B49A55",
    lineCount: 1,
    dash: "solid",
  },
  {
    code: "n",
    label: "كحلي مزدوج",
    color: "#29466A",
    lineCount: 2,
    dash: "solid",
  },
  {
    code: "e",
    label: "زمردي ثلاثي",
    color: "#26705E",
    lineCount: 3,
    dash: "solid",
  },
  {
    code: "b",
    label: "عنابي متقطع",
    color: "#813D4B",
    lineCount: 2,
    dash: "dashed",
  },
  {
    code: "s",
    label: "فحمي منقّط",
    color: "#59636D",
    lineCount: 1,
    dash: "dotted",
  },
] as const;

export type DocumentFrameFamilyCode =
  (typeof DOCUMENT_FRAME_FAMILIES)[number]["code"];
export type DocumentFramePaletteCode =
  (typeof DOCUMENT_FRAME_PALETTES)[number]["code"];
export type DocumentFramePresetId =
  `f${DocumentFrameFamilyCode}${DocumentFramePaletteCode}`;
export type LegacyDocumentFrameStyle =
  (typeof LEGACY_DOCUMENT_FRAME_STYLES)[number];
export type DocumentFrameStyle =
  LegacyDocumentFrameStyle | DocumentFramePresetId;
export type DocumentFrameMotif =
  | "minimal"
  | "classic"
  | "deco"
  | "arabesque"
  | "academic"
  | "geometric"
  | "botanical"
  | "diplomatic"
  | "imperial"
  | "official";
export type DocumentFrameDash = "solid" | "dashed" | "dotted";

export type DocumentFrameFamily = {
  code: DocumentFrameFamilyCode;
  label: string;
  motif: DocumentFrameMotif;
};

export type ProfessionalDocumentFramePreset = {
  id: DocumentFramePresetId;
  label: string;
  familyCode: DocumentFrameFamilyCode;
  familyLabel: string;
  paletteCode: DocumentFramePaletteCode;
  paletteLabel: string;
  color: string;
  motif: DocumentFrameMotif;
  lineCount: 1 | 2 | 3;
  dash: DocumentFrameDash;
};

export const PROFESSIONAL_DOCUMENT_FRAME_PRESETS: ProfessionalDocumentFramePreset[] =
  DOCUMENT_FRAME_FAMILIES.flatMap(family =>
    DOCUMENT_FRAME_PALETTES.map(palette => ({
      id: `f${family.code}${palette.code}` as DocumentFramePresetId,
      label: `${family.label} · ${palette.label}`,
      familyCode: family.code,
      familyLabel: family.label,
      paletteCode: palette.code,
      paletteLabel: palette.label,
      color: palette.color,
      motif: family.motif,
      lineCount: palette.lineCount,
      dash: palette.dash,
    }))
  );

export const DOCUMENT_FRAME_STYLES: readonly DocumentFrameStyle[] = [
  ...LEGACY_DOCUMENT_FRAME_STYLES,
  ...PROFESSIONAL_DOCUMENT_FRAME_PRESETS.map(preset => preset.id),
];

export function isDocumentFrameStyle(
  value: unknown
): value is DocumentFrameStyle {
  return (
    typeof value === "string" &&
    DOCUMENT_FRAME_STYLES.includes(value as DocumentFrameStyle)
  );
}

export function getProfessionalDocumentFramePreset(
  value: unknown
): ProfessionalDocumentFramePreset | undefined {
  if (typeof value !== "string") return undefined;
  return PROFESSIONAL_DOCUMENT_FRAME_PRESETS.find(
    preset => preset.id === value
  );
}

export function getDocumentFrameFamily(
  code: DocumentFrameFamilyCode
): DocumentFrameFamily {
  const family = DOCUMENT_FRAME_FAMILIES.find(item => item.code === code);
  if (!family) throw new Error(`Unknown document frame family: ${code}`);
  return family;
}
