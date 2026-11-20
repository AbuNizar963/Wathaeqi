import {
  TELEGRAM_CATEGORY_LABELS,
  TELEGRAM_CLASSIFICATION_LABELS,
  TELEGRAM_PRIORITY_LABELS,
  TELEGRAM_STATUS_LABELS,
  type TelegramCategory,
  type TelegramClassification,
  type TelegramPriority,
  type TelegramRecord,
  type TelegramStatus,
} from "@shared/telegrams";
import { getTelegramSerialCode } from "@shared/telegramSerial";

export {
  TELEGRAM_CATEGORY_LABELS,
  TELEGRAM_PRIORITY_LABELS,
  TELEGRAM_STATUS_LABELS,
};

export function classificationLabel(value: TelegramClassification): string {
  return TELEGRAM_CLASSIFICATION_LABELS[value] ?? value;
}

export function categoryLabel(value: TelegramCategory): string {
  return TELEGRAM_CATEGORY_LABELS[value] ?? value;
}

export function priorityLabel(value: TelegramPriority): string {
  return TELEGRAM_PRIORITY_LABELS[value] ?? value;
}

export function statusLabel(value: TelegramStatus): string {
  return TELEGRAM_STATUS_LABELS[value] ?? value;
}

const STATUS_TONES: Record<TelegramStatus, string> = {
  draft: "border-slate-300 bg-slate-100 text-slate-700",
  submitted: "border-sky-300 bg-sky-100 text-sky-800",
  in_review: "border-indigo-300 bg-indigo-100 text-indigo-800",
  approved: "border-emerald-300 bg-emerald-100 text-emerald-800",
  returned: "border-amber-300 bg-amber-100 text-amber-900",
  rejected: "border-rose-300 bg-rose-100 text-rose-800",
  forwarded: "border-cyan-300 bg-cyan-100 text-cyan-900",
  pending: "border-orange-300 bg-orange-100 text-orange-900",
  in_progress: "border-blue-300 bg-blue-100 text-blue-900",
  resolved: "border-teal-300 bg-teal-100 text-teal-900",
  completed: "border-green-300 bg-green-100 text-green-900",
  archived: "border-zinc-300 bg-zinc-100 text-zinc-700",
};

const PRIORITY_TONES: Record<TelegramPriority, string> = {
  slow: "border-slate-300 bg-slate-50 text-slate-600",
  normal: "border-sky-200 bg-sky-50 text-sky-700",
  urgent: "border-rose-300 bg-rose-50 text-rose-700",
};

export function statusTone(status: TelegramStatus): string {
  return STATUS_TONES[status] ?? STATUS_TONES.draft;
}

export function priorityTone(priority: TelegramPriority): string {
  return PRIORITY_TONES[priority] ?? PRIORITY_TONES.normal;
}

export function formatDateTime(
  value: string | null | undefined,
  options: { timeZone?: string; dateOnly?: boolean } = {}
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SY", {
      timeZone: options.timeZone,
      ...(options.dateOnly
        ? { dateStyle: "medium" }
        : { dateStyle: "medium", timeStyle: "short" }),
    }).format(date);
  } catch {
    return date.toLocaleString("ar-SY");
  }
}

export function telegramDisplaySerial(telegram: TelegramRecord): string {
  return (
    telegram.originalSerial?.trim() ||
    getTelegramSerialCode({
      serialCode: telegram.serialCode,
      organizationSerialCode: telegram.organizationSerialCode,
      serialNumber: telegram.serialNumber,
      organizationSerialNumber: telegram.organizationSerialNumber,
    })
  );
}

export function isOutgoing(telegram: TelegramRecord): boolean {
  return telegram.organizationId === telegram.currentOrganizationId;
}

export function toSpreadsheetRow(
  telegram: TelegramRecord,
  timeZone: string
): {
  serial: string;
  time: string;
  sender: string;
  date: string;
  body: string;
  recipient: string;
  signature: string;
  notes: string;
  direction: "صادر" | "وارد";
} {
  const date = new Date(telegram.telegramDate ?? telegram.createdAt);
  const dateParts = Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date)
    : "";
  const timeParts = Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(date)
    : "";
  return {
    serial: telegramDisplaySerial(telegram),
    time: timeParts,
    sender: telegram.creatorName,
    date: dateParts,
    body: telegram.body,
    recipient: telegram.recipient,
    signature: telegram.creatorName,
    notes: telegram.importNotes ?? "",
    direction: isOutgoing(telegram) ? "صادر" : "وارد",
  };
}

export function downloadBase64File(
  base64: string,
  fileName: string,
  contentType: string
): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function readFileAsBase64(
  file: File
): Promise<{ base64: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذر قراءة الملف"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const commaIndex = result.indexOf(",");
      if (commaIndex < 0) {
        reject(new Error("تعذر قراءة الملف"));
        return;
      }
      resolve({
        base64: result.slice(commaIndex + 1),
        dataUrl: result,
      });
    };
    reader.readAsDataURL(file);
  });
}
