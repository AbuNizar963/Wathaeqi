import type { PlatformDocumentSettings } from "@shared/features/platform-settings/platformDocumentSettings";

export type DocumentSignatureBlockProps = {
  organizationName: string;
  unitName: string;
  chiefRank: string;
  chiefName: string;
  settings?: PlatformDocumentSettings;
};

/**
 * Renders the two configured signatory lines centred after the document body.
 * The first line is the signatory name and the second is the organizational role.
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
