/**
 * Shared telegram (برقية) domain model.
 *
 * This module is the single source for the workflow vocabulary used by the web
 * client, the Appwrite-backed API and the Flutter client contract. It contains
 * no persistence or transport code so it can be imported by both sides.
 */

export const TELEGRAM_CLASSIFICATIONS = ["normal", "secret"] as const;
export type TelegramClassification = (typeof TELEGRAM_CLASSIFICATIONS)[number];

export const TELEGRAM_PRIORITIES = ["slow", "normal", "urgent"] as const;
export type TelegramPriority = (typeof TELEGRAM_PRIORITIES)[number];

export const TELEGRAM_CATEGORIES = [
  "criminal",
  "administrative",
  "traffic",
  "security",
  "tactical",
  "intelligence",
  "emergency",
  "public_order",
  "personnel",
  "logistics",
  "training",
  "community",
  "other",
] as const;
export type TelegramCategory = (typeof TELEGRAM_CATEGORIES)[number];

export const TELEGRAM_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "approved",
  "returned",
  "rejected",
  "forwarded",
  "pending",
  "in_progress",
  "resolved",
  "completed",
  "archived",
] as const;
export type TelegramStatus = (typeof TELEGRAM_STATUSES)[number];

export const TELEGRAM_DIRECTIONS = ["outgoing", "incoming"] as const;
export type TelegramDirection = (typeof TELEGRAM_DIRECTIONS)[number];

export const TELEGRAM_ROUTE_STATUSES = [
  "sent",
  "received",
  "accepted",
  "completed",
  "rejected",
  "cancelled",
] as const;
export type TelegramRouteStatus = (typeof TELEGRAM_ROUTE_STATUSES)[number];

export const TELEGRAM_ROUTE_APPROVAL_STATUSES = [
  "not_required",
  "pending",
  "approved",
  "rejected",
] as const;
export type TelegramRouteApprovalStatus =
  (typeof TELEGRAM_ROUTE_APPROVAL_STATUSES)[number];

export const TELEGRAM_RECEIVER_DECISIONS = [
  "pending",
  "accepted",
  "rejected",
] as const;
export type TelegramReceiverDecision =
  (typeof TELEGRAM_RECEIVER_DECISIONS)[number];

/** Roles allowed to act on a telegram owned by their active organization. */
export const TELEGRAM_ACTOR_ROLES = [
  "system_admin",
  "organization_admin",
  "regional_admin",
  "reviewer",
  "dispatcher",
] as const;
export type TelegramActorRole = (typeof TELEGRAM_ACTOR_ROLES)[number];

/** Roles allowed to approve a route that needs higher-authority consent. */
export const TELEGRAM_APPROVER_ROLES = [
  "system_admin",
  "organization_admin",
  "regional_admin",
] as const;

/** Roles allowed to import or administrate telegram settings. */
export const TELEGRAM_ADMIN_ROLES = [
  "system_admin",
  "organization_admin",
  "regional_admin",
] as const;

export const TELEGRAM_CLASSIFICATION_LABELS: Record<
  TelegramClassification,
  string
> = {
  normal: "عادية",
  secret: "سرية",
};

export const TELEGRAM_PRIORITY_LABELS: Record<TelegramPriority, string> = {
  slow: "بطيئة",
  normal: "عادية",
  urgent: "عاجلة",
};

export const TELEGRAM_CATEGORY_LABELS: Record<TelegramCategory, string> = {
  criminal: "جنائية",
  administrative: "إدارية",
  traffic: "مرور",
  security: "أمنية",
  tactical: "تكتيكية",
  intelligence: "استخباراتية",
  emergency: "طارئة",
  public_order: "نظام عام",
  personnel: "أفراد",
  logistics: "لوجستية",
  training: "تدريب",
  community: "علاقات عامة",
  other: "أخرى",
};

export const TELEGRAM_STATUS_LABELS: Record<TelegramStatus, string> = {
  draft: "مسودة",
  submitted: "مرسلة للمراجعة",
  in_review: "قيد المراجعة",
  approved: "معتمدة",
  returned: "معادة للتعديل",
  rejected: "مرفوضة",
  forwarded: "محالة",
  pending: "قيد الانتظار",
  in_progress: "قيد التنفيذ",
  resolved: "منجزة",
  completed: "مكتملة",
  archived: "مؤرشفة",
};

export const TELEGRAM_ROUTE_STATUS_LABELS: Record<TelegramRouteStatus, string> =
  {
    sent: "مرسلة",
    received: "مستلمة",
    accepted: "مقبولة",
    completed: "مكتملة",
    rejected: "مرفوضة",
    cancelled: "ملغاة",
  };

/**
 * Workflow matrix enforced by the server and mirrored by the clients.
 * Every other transition is rejected rather than silently coerced.
 */
export const TELEGRAM_TRANSITIONS: Record<TelegramStatus, TelegramStatus[]> = {
  draft: ["submitted"],
  submitted: ["in_review", "returned", "rejected"],
  in_review: ["approved", "returned", "rejected"],
  returned: ["submitted"],
  rejected: [],
  approved: ["forwarded", "completed"],
  forwarded: ["completed", "pending", "in_progress"],
  pending: ["in_progress", "resolved", "archived"],
  in_progress: ["resolved", "completed", "archived"],
  resolved: ["completed", "archived"],
  completed: ["archived"],
  archived: [],
};

export const TELEGRAM_STATUSES_REQUIRING_REASON: TelegramStatus[] = [
  "returned",
  "rejected",
];

export function isTelegramStatus(value: unknown): value is TelegramStatus {
  return (
    typeof value === "string" &&
    (TELEGRAM_STATUSES as readonly string[]).includes(value)
  );
}

export function canTransitionTelegram(
  from: TelegramStatus,
  to: TelegramStatus
): boolean {
  return TELEGRAM_TRANSITIONS[from].includes(to);
}

export function nextTelegramStatuses(
  from: TelegramStatus
): readonly TelegramStatus[] {
  return TELEGRAM_TRANSITIONS[from];
}

export function requiresTransitionReason(to: TelegramStatus): boolean {
  return TELEGRAM_STATUSES_REQUIRING_REASON.includes(to);
}

export function isTerminalTelegramStatus(status: TelegramStatus): boolean {
  return status === "archived" || status === "rejected";
}

/** Whether a telegram may still be edited in place. */
export function isEditableTelegramStatus(status: TelegramStatus): boolean {
  return status === "draft" || status === "returned";
}

/** Whether a telegram may be permanently deleted by the owner. */
export function isDeletableTelegramStatus(status: TelegramStatus): boolean {
  return status === "draft" || status === "archived";
}

export function getImportDirection(
  sheetName: string | null | undefined
): TelegramDirection {
  return String(sheetName ?? "").trim() === "وارد" ? "incoming" : "outgoing";
}

export function makeImportSerialKey(
  direction: TelegramDirection,
  serial: string
): string {
  const normalizedSerial = String(serial)
    .replace(/[\u0660-\u0669]/g, digit =>
      String(
        "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(
          digit
        )
      )
    )
    .replace(/[\u06f0-\u06f9]/g, digit =>
      String(
        "\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9".indexOf(
          digit
        )
      )
    )
    .replace(/[\u0623\u0625\u0622]/g, "\u0627")
    .replace(/\u0649/g, "\u064a")
    .replace(/[\s\u0640]+/g, "")
    .trim();
  return `${direction}:${normalizedSerial}`;
}

export type TelegramSerialParts = {
  serialPrefix: string;
  date: Date;
  serialNumber: number;
  timeZone: string;
};

/** Builds the official code `PREFIX-YYYY-MM-DD-00001` in the organization timezone. */
export function buildTelegramSerialCode(input: TelegramSerialParts): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.timeZone || "Asia/Damascus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(input.date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const dateCode = `${values.year}-${values.month}-${values.day}`;
  const prefix = (input.serialPrefix || "POL").trim().toUpperCase();
  return `${prefix}-${dateCode}-${String(input.serialNumber).padStart(5, "0")}`;
}

export type TelegramRecord = {
  id: string;
  serialNumber: number;
  serialCode: string;
  organizationSerialNumber: number | null;
  organizationSerialCode: string | null;
  originalSerial: string | null;
  verificationToken: string;
  telegramDate: string | null;
  createdByUserId: number;
  organizationId: string;
  currentOrganizationId: string;
  subject: string;
  recipient: string;
  body: string;
  classification: TelegramClassification;
  priority: TelegramPriority;
  category: TelegramCategory;
  status: TelegramStatus;
  workflowReason: string | null;
  importNotes: string | null;
  importDirection: TelegramDirection | null;
  attachmentManifest: string | null;
  gpsLatitude: string | null;
  gpsLongitude: string | null;
  creatorName: string;
  creatorEmail: string | null;
  creatorBadgeId: string | null;
  creatorIp: string | null;
  creatorFingerprint: string | null;
  revision: number;
  archivedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  senderOrganizationName?: string | null;
};

export type TelegramListFilters = {
  search?: string;
  classification?: TelegramClassification;
  priority?: TelegramPriority;
  category?: TelegramCategory;
  status?: TelegramStatus;
  direction?: TelegramDirection;
  from?: string;
  to?: string;
  organizationScope?: string;
  page?: number;
  pageSize?: number;
};

export type TelegramListResult = {
  items: TelegramRecord[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  stats: TelegramStats;
};

export type TelegramStats = {
  total: number;
  open: number;
  urgent: number;
  secret: number;
  archived: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byCategory: Record<string, number>;
};

function normalizeSearch(value: string): string {
  return value
    .replace(/[\u0640]/g, "")
    .replace(/[\u0623\u0625\u0622]/g, "\u0627")
    .replace(/\u0649/g, "\u064a")
    .replace(/[\u0660-\u0669]/g, digit =>
      String(
        "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(
          digit
        )
      )
    )
    .replace(/[\u06f0-\u06f9]/g, digit =>
      String(
        "\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9".indexOf(
          digit
        )
      )
    )
    .toLowerCase()
    .trim();
}

/** Text search across the fields the workspace exposes. */
export function telegramMatchesSearch(
  telegram: TelegramRecord,
  search: string
): boolean {
  const needle = normalizeSearch(search);
  if (!needle) return true;
  const haystack = normalizeSearch(
    [
      telegram.subject,
      telegram.body,
      telegram.recipient,
      telegram.serialCode,
      telegram.organizationSerialCode ?? "",
      telegram.originalSerial ?? "",
      telegram.creatorName,
    ].join(" ")
  );
  return haystack.includes(needle);
}

export function computeTelegramStats(
  telegrams: readonly TelegramRecord[]
): TelegramStats {
  const stats: TelegramStats = {
    total: telegrams.length,
    open: 0,
    urgent: 0,
    secret: 0,
    archived: 0,
    byStatus: {},
    byPriority: {},
    byCategory: {},
  };
  for (const telegram of telegrams) {
    stats.byStatus[telegram.status] =
      (stats.byStatus[telegram.status] ?? 0) + 1;
    stats.byPriority[telegram.priority] =
      (stats.byPriority[telegram.priority] ?? 0) + 1;
    stats.byCategory[telegram.category] =
      (stats.byCategory[telegram.category] ?? 0) + 1;
    if (telegram.priority === "urgent") stats.urgent += 1;
    if (telegram.classification === "secret") stats.secret += 1;
    if (telegram.status === "archived") stats.archived += 1;
    if (
      !isTerminalTelegramStatus(telegram.status) &&
      telegram.status !== "completed"
    ) {
      stats.open += 1;
    }
  }
  return stats;
}

export type TelegramVersionRecord = {
  id: string;
  telegramId: string;
  versionNumber: number;
  changedByUserId: number;
  changedByName: string | null;
  changeReason: string;
  snapshot: Record<string, unknown>;
  createdAt: string;
};

export type TelegramActionRecord = {
  id: string;
  telegramId: string;
  actorUserId: number;
  actorName: string | null;
  action: string;
  fromStatus: TelegramStatus | null;
  toStatus: TelegramStatus | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type TelegramAttachmentRecord = {
  id: string;
  telegramId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  uploadedByUserId: number;
  scanStatus: string;
  createdAt: string;
};

export type TelegramRouteRecord = {
  id: string;
  telegramId: string;
  fromOrganizationId: string;
  fromOrganizationName: string | null;
  toOrganizationId: string;
  toOrganizationName: string | null;
  forwardedByUserId: number;
  status: TelegramRouteStatus;
  approvalStatus: TelegramRouteApprovalStatus;
  approvedByUserId: number | null;
  approvedAt: string | null;
  approvalReason: string | null;
  receiverDecisionStatus: TelegramReceiverDecision;
  receiverDecisionByUserId: number | null;
  receiverDecisionAt: string | null;
  receiverDecisionReason: string | null;
  routeSerialNumber: number | null;
  routeSerialCode: string | null;
  incomingSerialNumber: number | null;
  incomingSerialCode: string | null;
  note: string | null;
  createdAt: string;
  receivedAt: string | null;
  completedAt: string | null;
};

export type DepartmentSettings = {
  organizationId: string;
  departmentName: string;
  unitName: string;
  unitChiefRank: string;
  unitChiefName: string;
  serialPrefix: string;
  incomingSerialPrefix: string;
  serialStart: number;
  incomingSerialStart: number;
  nextOutgoingSerial: number;
  nextIncomingSerial: number;
  timezone: string;
  dateFormat: string;
  timeFormat: "12" | "24";
  numberSystem: "latin" | "arabic";
  showVerificationQr: boolean;
  logoUrl: string | null;
  updatedByUserId: number | null;
  createdAt: string;
  updatedAt: string;
};

export const DEPARTMENT_SETTINGS_DEFAULTS: Omit<
  DepartmentSettings,
  "organizationId" | "updatedByUserId" | "createdAt" | "updatedAt"
> = {
  departmentName: "إدارة الشرطة",
  unitName: "وحدة العمليات",
  unitChiefRank: "العقيد",
  unitChiefName: "رئيس الوحدة",
  serialPrefix: "POL",
  incomingSerialPrefix: "POL",
  serialStart: 1,
  incomingSerialStart: 1,
  nextOutgoingSerial: 1,
  nextIncomingSerial: 1,
  timezone: "Asia/Damascus",
  dateFormat: "dd/MM/yyyy HH:mm:ss",
  timeFormat: "24",
  numberSystem: "latin",
  showVerificationQr: true,
  logoUrl: null,
};

export const TELEGRAM_TIMEZONES = [
  "Asia/Damascus",
  "Asia/Riyadh",
  "Asia/Amman",
  "Asia/Baghdad",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Dubai",
  "Asia/Muscat",
  "Africa/Cairo",
  "Africa/Tunis",
  "Africa/Algiers",
  "Africa/Casablanca",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
] as const;
