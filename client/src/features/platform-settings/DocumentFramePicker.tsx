import {
  WORD_DOCUMENT_FRAME_STYLES,
  getWordDocumentFrameStyle,
  type DocumentFrameStyle,
  type WordDocumentFrameStyle,
} from "@shared/features/platform-settings/platformDocumentSettings";

const WORD_FRAME_LABELS: Record<WordDocumentFrameStyle, string> = {
  none: "بدون إطار",
  box: "مربع — إطار كامل",
  shadow: "ظل — إطار بظل جانبي",
  "three-dimensional": "ثلاثي الأبعاد",
  double: "مزدوج — خطّان",
};

type DocumentFramePickerProps = {
  value: DocumentFrameStyle;
  onChange: (style: DocumentFrameStyle) => void;
};

export default function DocumentFramePicker({
  value,
  onChange,
}: DocumentFramePickerProps) {
  const selectedStyle = getWordDocumentFrameStyle(value);

  return (
    <label className="block space-y-2 text-sm">
      <span className="block font-medium">نمط إطار الصفحة</span>
      <select
        aria-label="اختيار إطار الصفحة"
        value={selectedStyle}
        onChange={event =>
          onChange(event.target.value as WordDocumentFrameStyle)
        }
        className="w-full rounded-lg border bg-background px-3 py-3"
      >
        {WORD_DOCUMENT_FRAME_STYLES.map(style => (
          <option key={style} value={style}>
            {WORD_FRAME_LABELS[style]}
          </option>
        ))}
      </select>
      <span className="block text-xs text-muted-foreground">
        اختر نمطاً واحداً من أنماط حدود الصفحة المشابهة لبرنامج Microsoft Word.
      </span>
    </label>
  );
}
