import type { PlatformDocumentSettings } from "@shared/features/platform-settings/platformDocumentSettings";

export type DocumentLetterheadProps = {
  logoUrl: string | null;
  dividerColor: string;
  headerSettings?: PlatformDocumentSettings;
  serial?: string;
  date?: string;
};

/**
 * A4 document header shared by preview, printing and PNG export.
 * Signatory and organization text is intentionally rendered after the
 * document body by DocumentSignatureBlock, not in this header.
 */
export default function DocumentLetterhead({
  logoUrl,
  dividerColor,
  headerSettings,
  serial,
  date,
}: DocumentLetterheadProps) {
  const showLogo = headerSettings?.headerShowLogo !== false;
  const logoSize = headerSettings?.headerLogoSize ?? 200;

  return (
    <header
      className="document-letterhead"
      style={{
        borderBottom:
          headerSettings?.headerDividerStyle === "tricolor-stars"
            ? "none"
            : `${headerSettings?.headerDividerWidthPt ?? 2.25}pt ${headerSettings?.headerDividerStyle === "double" ? "double" : (headerSettings?.headerDividerStyle ?? "solid")} ${dividerColor}`,
        paddingTop: `${headerSettings?.headerTopPaddingMm ?? 0}mm`,
        paddingInline: `${headerSettings?.headerHorizontalPaddingMm ?? 0}mm`,
        paddingBottom: `${headerSettings?.headerBottomPaddingMm ?? 6}mm`,
      }}
      dir="rtl"
    >
      {headerSettings?.pageHeaderRows?.some(
        row => row.right.trim() || row.left.trim()
      ) ? (
        <div
          className="mb-2 space-y-1 text-[10pt] font-semibold leading-[1.4]"
          dir="rtl"
          data-testid="document-custom-header-rows"
        >
          {headerSettings.pageHeaderRows.map((row, index) =>
            row.right.trim() || row.left.trim() ? (
              <div
                key={`custom-header-${index}`}
                className="grid grid-cols-2 gap-4"
              >
                <span className="text-right">{row.right}</span>
                <span className="text-left" dir="ltr">
                  {row.left}
                </span>
              </div>
            ) : null
          )}
        </div>
      ) : null}
      <div className="document-letterhead__row">
        <div
          className="document-letterhead__cell document-letterhead__logo-cell"
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
          }}
        >
          {showLogo && logoUrl ? (
            <img
              src={logoUrl}
              alt="الشعار الرسمي"
              className="block object-contain"
              style={{ width: logoSize, height: logoSize }}
            />
          ) : null}
        </div>
      </div>
      {headerSettings?.headerDividerStyle === "tricolor-stars" ? (
        <div
          className="document-tricolor-stars-divider"
          aria-label="فاصل أسود وأخضر مع ثلاث نجوم حمراء"
        >
          <span className="document-tricolor-stars-divider__line document-tricolor-stars-divider__line--black" />
          <svg
            className="document-tricolor-stars-divider__stars"
            viewBox="0 0 58 18"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M8.5 1.2 10.4 6l5.8.4-4.4 3.7 1.4 5.6-4.7-3-4.7 3 1.4-5.6L.8 6.4 6.6 6l1.9-4.8Z" />
            <path d="M29 1.2 30.9 6l5.8.4-4.4 3.7 1.4 5.6-4.7-3-4.7 3 1.4-5.6-4.4-3.7 5.8-.4L29 1.2Z" />
            <path d="M49.5 1.2 51.4 6l5.8.4-4.4 3.7 1.4 5.6-4.7-3-4.7 3 1.4-5.6-4.4-3.7 5.8-.4 1.9-4.8Z" />
          </svg>
          <span className="document-tricolor-stars-divider__line document-tricolor-stars-divider__line--green" />
        </div>
      ) : null}
      {serial || date ? (
        <div
          className="mt-1 text-right text-[12pt] font-semibold leading-[1.6]"
          dir="rtl"
          data-testid="document-letterhead-metadata"
        >
          {serial ? (
            <p className="whitespace-nowrap">
              <strong>الرقم:</strong> {serial}
            </p>
          ) : null}
          {date ? (
            <p className="whitespace-nowrap">
              <strong>التاريخ:</strong> {date}
            </p>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
