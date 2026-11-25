import type { PlatformDocumentSettings } from "@shared/features/platform-settings/platformDocumentSettings";

export type DocumentSignatureBlockProps = {
  organizationName: string;
  unitName: string;
  chiefRank: string;
  chiefName: string;
  settings?: PlatformDocumentSettings;
};

/**
 * Renders two configurable signatory lines after the document body.
 * The four settings are paired into two readable lines and remain editable.
 */
export default function DocumentSignatureBlock({
  settings,
}: DocumentSignatureBlockProps) {
  const firstRank = settings?.headerTitle.trim() || "المقدم";
  const firstName = settings?.headerSubtitle.trim() || "غسان صالح كنو";
  const secondRole = settings?.headerChiefRank.trim() || "رئيس قسم شرطة";
  const secondUnit = settings?.headerChiefName.trim() || "الشهباء";

  const firstLine = [firstRank, firstName].filter(Boolean).join(" ");
  const secondLine = [secondRole, secondUnit].filter(Boolean).join(" ");
  const lines = [firstLine, secondLine].filter(
    value => value.trim().length > 0
  );

  if (lines.length === 0) return null;

  return (
    <footer
      className="mt-8 space-y-1 text-left text-[12pt] font-semibold leading-[1.7]"
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
