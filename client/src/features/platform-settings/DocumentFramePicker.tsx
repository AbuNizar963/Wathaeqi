import { useEffect, useState } from "react";
import DocumentFrameDecoration from "@/features/document-studio/DocumentFrameDecoration";
import {
  DOCUMENT_FRAME_FAMILIES,
  LEGACY_DOCUMENT_FRAME_STYLES,
  PROFESSIONAL_DOCUMENT_FRAME_PRESETS,
  getProfessionalDocumentFramePreset,
  type DocumentFrameFamilyCode,
  type DocumentFrameStyle,
} from "@shared/features/platform-settings/platformDocumentSettings";

const LEGACY_LABELS: Record<
  (typeof LEGACY_DOCUMENT_FRAME_STYLES)[number],
  string
> = {
  none: "بدون إطار",
  single: "مفرد",
  double: "مزدوج",
  ornate: "زخرفي",
  classic: "كلاسيكي",
  triple: "ثلاثي",
};

type DocumentFramePickerProps = {
  value: DocumentFrameStyle;
  frameColor: string;
  frameWidthPt: number;
  onChange: (style: DocumentFrameStyle, color: string) => void;
};

export default function DocumentFramePicker({
  value,
  frameColor,
  frameWidthPt,
  onChange,
}: DocumentFramePickerProps) {
  const selectedPreset = getProfessionalDocumentFramePreset(value);
  const [familyCode, setFamilyCode] = useState<DocumentFrameFamilyCode>(
    selectedPreset?.familyCode ?? DOCUMENT_FRAME_FAMILIES[0].code
  );

  useEffect(() => {
    if (selectedPreset) setFamilyCode(selectedPreset.familyCode);
  }, [selectedPreset?.id]);

  const visiblePresets = PROFESSIONAL_DOCUMENT_FRAME_PRESETS.filter(
    preset => preset.familyCode === familyCode
  );

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">الإطارات الاحترافية</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          50 خياراً يجمع 10 زخارف رسمية مع خمسة ألوان ومعالجات مختلفة للخطوط.
        </p>
      </div>

      <div
        role="group"
        aria-label="أنماط الإطار الأساسية"
        className="flex flex-wrap gap-2"
      >
        {LEGACY_DOCUMENT_FRAME_STYLES.map(style => (
          <button
            key={style}
            type="button"
            aria-pressed={value === style}
            onClick={() => onChange(style, frameColor)}
            className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
              value === style
                ? "border-primary bg-primary/10 text-primary"
                : "hover:border-primary/50"
            }`}
          >
            {LEGACY_LABELS[style]}
          </button>
        ))}
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">عائلة التصميم</span>
        <select
          value={familyCode}
          onChange={event =>
            setFamilyCode(event.target.value as DocumentFrameFamilyCode)
          }
          className="w-full rounded-lg border bg-background px-3 py-2"
        >
          {DOCUMENT_FRAME_FAMILIES.map(family => (
            <option key={family.code} value={family.code}>
              {family.label} — 5 ألوان
            </option>
          ))}
        </select>
      </label>

      <div
        role="group"
        aria-label={`ألوان إطارات ${DOCUMENT_FRAME_FAMILIES.find(item => item.code === familyCode)?.label ?? ""}`}
        className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto rounded-lg border p-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        {visiblePresets.map(preset => (
          <button
            key={preset.id}
            type="button"
            aria-label={preset.label}
            aria-pressed={value === preset.id}
            onClick={() => onChange(preset.id, preset.color)}
            className={`min-w-0 rounded-lg border p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              value === preset.id
                ? "border-primary bg-primary/10 ring-1 ring-primary"
                : "hover:border-primary/50 hover:bg-muted/40"
            }`}
          >
            <span className="relative mx-auto block h-20 w-14 overflow-hidden bg-white shadow-sm">
              <DocumentFrameDecoration
                frameStyle={preset.id}
                frameColor={preset.color}
                frameWidthPt={1.4}
              />
            </span>
            <span className="mt-2 block truncate text-xs font-medium">
              {preset.paletteLabel}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
