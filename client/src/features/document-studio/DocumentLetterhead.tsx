import type { PlatformDocumentSettings } from "@shared/features/platform-settings/platformDocumentSettings";

export type DocumentLetterheadProps = {
  organizationName: string;
  unitName: string;
  chiefRank: string;
  chiefName: string;
  logoUrl: string | null;
  dividerColor: string;
  headerSettings?: PlatformDocumentSettings;
  serial?: string;
  date?: string;
};

/**
 * A4 letterhead shared by the live preview, printing and the PNG export.
 *
 * The three columns use a table row instead of CSS grid or flexbox: html2canvas
 * (the PNG exporter) mishandles both grid placement and flex alignment, which
 * used to paint the tricolor divider on top of the serial/date block in
 * downloaded images. Tables keep the same geometry in every renderer.
 */
export default function DocumentLetterhead({
  organizationName,
  unitName,
  chiefRank,
  chiefName,
  logoUrl,
  dividerColor,
  headerSettings,
  serial,
  date,
}: DocumentLetterheadProps) {
  const title = headerSettings?.headerTitle.trim() || organizationName;
  const subtitle = headerSettings?.headerSubtitle.trim() || unitName;
  const rank = headerSettings?.headerChiefRank.trim() || chiefRank;
  const name = headerSettings?.headerChiefName.trim() || chiefName;
  const showLogo = headerSettings?.headerShowLogo !== false;
  const logoSize = headerSettings?.headerLogoSize ?? 120;
  const alignment = headerSettings?.headerAlignment ?? "spread";
  const textAlign =
    alignment === "center"
      ? "center"
      : alignment === "right"
        ? "right"
        : undefined;

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
      <div className="document-letterhead__row">
        <div
          className="document-letterhead__cell text-right"
          style={{ textAlign }}
        >
          <p className="whitespace-nowrap text-[15pt] font-bold leading-[1.5] tracking-[-0.12px] [transform:scaleX(0.86)] [transform-origin:right_center]">
            {title}
          </p>
          {subtitle ? (
            <p className="whitespace-nowrap text-[15pt] font-bold leading-[1.5] tracking-[-0.12px] [transform:scaleX(0.86)] [transform-origin:right_center]">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div
          className="document-letterhead__cell document-letterhead__logo-cell"
          style={{ width: logoSize }}
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
        <div
          className="document-letterhead__cell text-left text-[15pt] font-bold leading-[1.5] tracking-[-0.12px]"
          style={{ textAlign }}
          dir="rtl"
        >
          {serial ? (
            <p className="whitespace-nowrap [transform:scaleX(0.86)] [transform-origin:left_center]">
              <strong>الرقم:</strong> {serial}
            </p>
          ) : null}
          {date ? (
            <p className="whitespace-nowrap [transform:scaleX(0.86)] [transform-origin:left_center]">
              <strong>التاريخ:</strong> {date}
            </p>
          ) : null}
          {rank ? (
            <p className="whitespace-nowrap text-[12pt] font-semibold">
              {rank}
            </p>
          ) : null}
          {name ? (
            <p className="whitespace-nowrap text-[12pt] font-semibold">
              {name}
            </p>
          ) : null}
        </div>
      </div>
      {headerSettings?.pageHeaderRows?.map((row, index) => (
        <div
          key={`custom-header-${index}`}
          className="grid grid-cols-2 gap-4 px-2 text-sm font-semibold leading-6"
        >
          <span className="text-right">{row.right}</span>
          <span className="text-left" dir="ltr">
            {row.left}
          </span>
        </div>
      ))}
      {headerSettings?.pageHeaderRows?.map((row, index) => (
        <div
          key={`custom-header-${index}`}
          className="grid grid-cols-2 gap-4 px-2 text-sm font-semibold leading-6"
        >
          <span className="text-right">{row.right}</span>
          <span className="text-left" dir="ltr">
            {row.left}
          </span>
        </div>
      ))}
      {headerSettings?.pageHeaderRows?.map((row, index) => (
        <div
          key={`custom-header-${index}`}
          className="grid grid-cols-2 gap-4 px-2 text-sm font-semibold leading-6"
        >
          <span className="text-right">{row.right}</span>
          <span className="text-left" dir="ltr">
            {row.left}
          </span>
        </div>
      ))}
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
    </header>
  );
}
