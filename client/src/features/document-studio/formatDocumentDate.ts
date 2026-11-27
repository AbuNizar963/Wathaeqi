import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  DOCUMENT_DATE_FORMATS,
  type DocumentDateFormat,
} from "@shared/features/platform-settings/platformDocumentSettings";

const DATE_TOKEN_PATTERN = /yyyy|MMMM|MMM|MM|dd|yy|M|d/gu;
const HIJRI_LOCALE = "ar-SA-u-ca-islamic-umalqura-nu-latn";

export function isDocumentDateFormat(
  value: unknown
): value is DocumentDateFormat {
  return (
    typeof value === "string" &&
    DOCUMENT_DATE_FORMATS.some(format => format === value)
  );
}

function formatDatePattern(
  pattern: string,
  tokens: Record<string, string>
): string {
  return pattern.replace(DATE_TOKEN_PATTERN, token => tokens[token]);
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
  const year = isoDate ? Number(isoDate[1]) : parsed.getUTCFullYear();
  const month = isoDate ? Number(isoDate[2]) : parsed.getUTCMonth() + 1;
  const day = isoDate ? Number(isoDate[3]) : parsed.getUTCDate();
  const date = new Date(Date.UTC(year, month - 1, day, 12));
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

  const includesHijri = format.startsWith("both:");
  const pattern = includesHijri ? format.slice("both:".length) : format;
  const gregorianDate = formatDatePattern(pattern, tokens);
  if (!includesHijri) return gregorianDate;

  const hijriParts = new Intl.DateTimeFormat(HIJRI_LOCALE, {
    calendar: "islamic-umalqura",
    numberingSystem: "latn",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(date);
  const getPart = (type: "day" | "month" | "year") =>
    hijriParts.find(part => part.type === type)?.value ?? "";
  const hijriMonthLong = new Intl.DateTimeFormat(HIJRI_LOCALE, {
    calendar: "islamic-umalqura",
    numberingSystem: "latn",
    month: "long",
    timeZone: "UTC",
  }).format(date);
  const hijriTokens: Record<string, string> = {
    yyyy: getPart("year"),
    yy: getPart("year").slice(-2),
    MMMM: hijriMonthLong,
    MMM: hijriMonthLong,
    MM: getPart("month").padStart(2, "0"),
    M: String(Number(getPart("month"))),
    dd: getPart("day").padStart(2, "0"),
    d: String(Number(getPart("day"))),
  };

  return `${gregorianDate} م — ${formatDatePattern(pattern, hijriTokens)} هـ`;
}
