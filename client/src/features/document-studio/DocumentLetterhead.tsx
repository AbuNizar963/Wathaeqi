import type { PlatformDocumentSettings } from "@shared/features/platform-settings/platformDocumentSettings";
import { normalizePlatformDocumentSettings } from "../platform-settings/normalizePlatformDocumentSettings";

export type DocumentLetterheadProps = {
  logoUrl: string | null;
  dividerColor: string;
  headerSettings?: PlatformDocumentSettings;
  serial?: string;
  date?: string;
};

const REFERENCE_LOGO_SIZE = 120;

/**
 * A4 document header shared by preview, printing and PNG export.
 * Side heading rows and the logo share one three-column line, matching the
 * telegram reference. Signatory text remains below the document body.
 */
export default function DocumentLetterhead({
  logoUrl,
  dividerColor,
  headerSettings,
  serial,
  date,
}: DocumentLetterheadProps) {
  const settings = normalizePlatformDocumentSettings(headerSettings);
  const headerRows = settings.pageHeaderRows.filter(
    row => row.right.trim() || row.left.trim()
  );
  const showLogo = settings.headerShowLogo !== false;

  return (
    <header
      className="document-letterhead"
      style={{
        borderBottom:
          settings.headerDividerStyle === "tricolor-stars"
            ? "none"
            : `${settings.headerDividerWidthPt}pt ${settings.headerDividerStyle === "double" ? "double" : settings.headerDividerStyle} ${dividerColor}`,
        paddingTop: `${settings.headerTopPaddingMm}mm`,
        paddingInline: `${settings.headerHorizontalPaddingMm}mm`,
        paddingBottom: `${settings.headerBottomPaddingMm}mm`,
      }}
      dir="rtl"
    >
      <div
        className="document-letterhead__row"
        data-testid="document-letterhead-row"
      >
        <div
          className="document-letterhead__cell document-letterhead__side document-letterhead__side--right"
          data-testid={
            headerRows.length ? "document-custom-header-rows-right" : undefined
          }
          dir="rtl"
        >
          {headerRows.map((row, index) => (
            <p
              key={`right-header-${index}`}
              className="document-letterhead__side-line"
              aria-hidden={!row.right.trim() || undefined}
            >
              {row.right.trim() || "\u00a0"}
            </p>
          ))}
        </div>
        <div
          className="document-letterhead__cell document-letterhead__logo-cell"
          data-testid="document-letterhead-logo-cell"
        >
          {showLogo && logoUrl ? (
            <img
              src={logoUrl}
              alt="الشعار الرسمي"
              className="block object-contain"
              width={REFERENCE_LOGO_SIZE}
              height={REFERENCE_LOGO_SIZE}
              style={{
                width: REFERENCE_LOGO_SIZE,
                height: REFERENCE_LOGO_SIZE,
              }}
            />
          ) : null}
        </div>
        <div
          className="document-letterhead__cell document-letterhead__side document-letterhead__side--left"
          data-testid={
            headerRows.length ? "document-custom-header-rows-left" : undefined
          }
          dir="ltr"
        >
          {headerRows.map((row, index) => (
            <p
              key={`left-header-${index}`}
              className="document-letterhead__side-line"
              aria-hidden={!row.left.trim() || undefined}
            >
              {row.left.trim() || "\u00a0"}
            </p>
          ))}
        </div>
      </div>
      {settings.headerDividerStyle === "tricolor-stars" ? (
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
