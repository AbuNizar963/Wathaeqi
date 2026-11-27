import type { PlatformDocumentSettings } from "@shared/features/platform-settings/platformDocumentSettings";
import { normalizePlatformDocumentSettings } from "../platform-settings/normalizePlatformDocumentSettings";

export type DocumentSignatureBlockProps = {
  organizationName: string;
  unitName: string;
  chiefRank: string;
  chiefName: string;
  settings?: PlatformDocumentSettings;
};

function isUnitRoleLine(value: string): boolean {
  return /^(?:رئيس|مدير|قائد)(?:\s|$)/u.test(value.trim());
}

function isRankLine(value: string): boolean {
  return /^(?:المقدم|مقدّم|مقدم|العقيد|عقيد|العميد|عميد|الرائد|رائد|النقيب|نقيب|الملازم|ملازم|اللواء|لواء|مساعد)(?:\s|$)/u.test(
    value.trim()
  );
}

/**
 * Renders the signatory first and the organizational role second, using the
 * legacy-field normalizer so stored settings cannot reverse the printed order.
 */
export default function DocumentSignatureBlock({
  settings,
}: DocumentSignatureBlockProps) {
  const normalizedSettings = normalizePlatformDocumentSettings(settings);
  const firstLine = [
    normalizedSettings.headerTitle.trim(),
    normalizedSettings.headerSubtitle.trim(),
  ]
    .filter(Boolean)
    .join(" ");
  const secondLine = [
    normalizedSettings.headerChiefRank.trim(),
    normalizedSettings.headerChiefName.trim(),
  ]
    .filter(Boolean)
    .join(" ");
  const reversedLegacyOrder =
    isUnitRoleLine(firstLine) && isRankLine(secondLine);
  const lines = reversedLegacyOrder
    ? [secondLine, firstLine]
    : [firstLine, secondLine];
  const visibleLines = lines.filter(value => value.trim().length > 0);

  if (visibleLines.length === 0) return null;

  return (
    <footer
      className="document-signature-block mt-8 space-y-1 text-center text-[12pt] font-semibold leading-[1.7]"
      style={{
        width: "min(48%, 320px)",
        marginRight: "auto",
        marginLeft: 0,
      }}
      dir="rtl"
      data-testid="document-signature-block"
      data-document-print-section="footer"
    >
      {visibleLines.map((line, index) => (
        <p key={index} className="whitespace-pre-wrap">
          {line}
        </p>
      ))}
    </footer>
  );
}
