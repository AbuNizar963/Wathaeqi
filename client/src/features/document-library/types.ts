export type PagesPerSheet = 1 | 2 | 4 | 6 | 8;
export type PrintLayoutMode = "sequential" | "repeat";
export type PrintOrientation = "portrait" | "landscape";

export const DEFAULT_CUT_MARGIN_MM = 3;
export const MAX_CUT_MARGIN_MM = 20;

export function normalizeCutMarginMm(value?: number): number {
  const numericValue =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : DEFAULT_CUT_MARGIN_MM;
  return Math.min(MAX_CUT_MARGIN_MM, Math.max(0, numericValue));
}

export function getPrintGridDimensions(
  count: PagesPerSheet,
  orientation: PrintOrientation
): { columns: number; rows: number } {
  const columns =
    orientation === "landscape"
      ? count === 1
        ? 1
        : count <= 2
          ? count
          : count <= 4
            ? 2
            : count <= 6
              ? 3
              : 4
      : count <= 2
        ? 1
        : 2;
  return { columns, rows: Math.ceil(count / columns) };
}

export type DocumentFileKind = "word" | "pdf" | "image";

export interface SourcePage {
  src: string;
  width: number;
  height: number;
}

export interface PrintOptions {
  pagesPerSheet: PagesPerSheet;
  layoutMode?: PrintLayoutMode;
  copiesPerSheet?: PagesPerSheet;
  orientation?: PrintOrientation;
  marginMm: number;
  cutMarginMm?: number;
  headerText: string;
  footerText: string;
  showPageNumbers: boolean;
  showCutMarks?: boolean;
}

export const DOCUMENT_CATEGORIES = [
  { value: "general", label: "عام" },
  { value: "administrative", label: "إداري" },
  { value: "personnel", label: "شؤون الموظفين" },
  { value: "correspondence", label: "مراسلات" },
] as const;

export function fileKind(
  fileName: string,
  mimeType: string
): DocumentFileKind | null {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const mime = mimeType.toLowerCase().split(";", 1)[0]?.trim();
  if (extension === "pdf" && mime === "application/pdf") return "pdf";
  if (
    extension === "docx" &&
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "word";
  const imageMimeByExtension: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  if (imageMimeByExtension[extension] === mime) return "image";
  return null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 ب";
  const units = ["ب", "ك.ب", "م.ب", "غ.ب"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / 1024 ** index;
  return `${value.toLocaleString("ar", {
    maximumFractionDigits: value >= 10 || index === 0 ? 0 : 1,
  })} ${units[index]}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
