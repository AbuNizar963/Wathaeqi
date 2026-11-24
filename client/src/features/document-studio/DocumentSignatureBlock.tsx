import type { PlatformDocumentSettings } from "@shared/features/platform-settings/platformDocumentSettings";

export type DocumentSignatureBlockProps = {
  organizationName: string;
  unitName: string;
  chiefRank: string;
  chiefName: string;
  settings?: PlatformDocumentSettings;
};

/**
 * Renders the four configurable organization/signatory lines after the
 * final paragraph of the document body. Existing settings keys are retained
 * so saved values remain compatible and are not lost.
 */
export default function DocumentSignatureBlock({
  organizationName,
  unitName,
  chiefRank,
  chiefName,
  settings,
}: DocumentSignatureBlockProps) {
  const lines = [
    settings?.headerTitle.trim() || organizationName,
    settings?.headerSubtitle.trim() || unitName,
    settings?.headerChiefRank.trim() || chiefRank,
    settings?.headerChiefName.trim() || chiefName,
  ].filter(value => value.trim().length > 0);

  if (lines.length === 0) return null;

  return (
    <footer
      className="mt-8 space-y-1 text-right text-[12pt] font-semibold leading-[1.7]"
      dir="rtl"
      data-testid="document-signature-block"
    >
      {lines.map((line, index) => (
        <p key={index} className="whitespace-pre-wrap">
          {line}
        </p>
      ))}
    </footer>
  );
}
