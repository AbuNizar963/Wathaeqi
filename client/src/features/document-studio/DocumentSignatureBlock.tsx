import type { PlatformDocumentSettings } from "@shared/features/platform-settings/platformDocumentSettings";

export type DocumentSignatureBlockProps = {
  organizationName: string;
  unitName: string;
  chiefRank: string;
  chiefName: string;
  settings?: PlatformDocumentSettings;
};

/**
 * Renders the two editable responsible-person lines after the document body.
 * Existing settings keys are reused to preserve compatibility with saved data.
 */
export default function DocumentSignatureBlock({
  settings,
}: DocumentSignatureBlockProps) {
  const firstLine =
    settings?.headerTitle.trim() || "المقدم غسان صالح كنو";
  const configuredSecondLine =
    settings?.headerSubtitle.trim() || "رئيس قسم الشهباء";
  const secondLine = configuredSecondLine.startsWith("رئيس")
    ? configuredSecondLine
    : `رئيس ${configuredSecondLine}`;
  const lines = [firstLine, secondLine].filter(
    value => value.trim().length > 0
  );

  if (lines.length === 0) return null;

  return (
    <footer
      className="mt-8 space-y-1 text-center text-[12pt] font-semibold leading-[1.7]"
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
