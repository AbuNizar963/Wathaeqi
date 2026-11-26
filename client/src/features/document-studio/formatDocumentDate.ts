import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  DOCUMENT_DATE_FORMATS,
  type DocumentDateFormat,
} from "@shared/features/platform-settings/platformDocumentSettings";

export function isDocumentDateFormat(
  value: unknown
): value is DocumentDateFormat {
  return (
    typeof value === "string" &&
    DOCUMENT_DATE_FORMATS.some(format => format === value)
  );
}

export function formatDocumentDate(
  value: string,
  format: DocumentDateFormat = DEFAULT_PLATFORM_DOCUMENT_SETTINGS.documentDateFormat
): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;

  // The stored date is an ISO timestamp created at noon UTC. Prefer its date
  // portion so the selected calendar day never shifts with the viewer's zone.
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/u);
  const year = isoDate ? Number(isoDate[1]) : parsed.getFullYear();
  const month = isoDate ? Number(isoDate[2]) : parsed.getMonth() + 1;
  const day = isoDate ? Number(isoDate[3]) : parsed.getDate();
  const monthDate = new Date(Date.UTC(year, month - 1, 15, 12));
  const monthLong = new Intl.DateTimeFormat("ar", {
    month: "long",
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: "UTC",
  }).format(monthDate);

  const tokens: Record<string, string> = {
    yyyy: String(year).padStart(4, "0"),
    yy: String(year).slice(-2),
    MMMM: monthLong,
    MMM: monthLong,
    MM: String(month).padStart(2, "0"),
    M: String(month),
    dd: String(day).padStart(2, "0"),
    d: String(day),
  };

  return format.replace(/yyyy|MMMM|MMM|MM|dd|yy|M|d/gu, token => tokens[token]);
}
