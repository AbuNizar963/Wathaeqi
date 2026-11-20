import { describe, expect, it } from "vitest";
import {
  buildTelegramSerialCode,
  canTransitionTelegram,
  computeTelegramStats,
  getImportDirection,
  isDeletableTelegramStatus,
  isEditableTelegramStatus,
  makeImportSerialKey,
  nextTelegramStatuses,
  requiresTransitionReason,
  telegramMatchesSearch,
  type TelegramRecord,
} from "./telegrams";

function telegram(overrides: Partial<TelegramRecord> = {}): TelegramRecord {
  return {
    id: "1",
    serialNumber: 1,
    serialCode: "POL-2026-01-05-00001",
    organizationSerialNumber: 1,
    organizationSerialCode: "POL-2026-01-05-00001",
    originalSerial: null,
    verificationToken: "token",
    telegramDate: null,
    createdByUserId: 1,
    organizationId: "org-1",
    currentOrganizationId: "org-1",
    subject: "تعميم أمني",
    recipient: "مديرية الشرطة",
    body: "نص البرقية",
    classification: "normal",
    priority: "normal",
    category: "administrative",
    status: "draft",
    workflowReason: null,
    importNotes: null,
    importDirection: null,
    attachmentManifest: null,
    gpsLatitude: null,
    gpsLongitude: null,
    creatorName: "ضابط",
    creatorEmail: null,
    creatorBadgeId: null,
    creatorIp: null,
    creatorFingerprint: null,
    revision: 1,
    archivedAt: null,
    closedAt: null,
    createdAt: "2026-01-05T10:00:00.000Z",
    updatedAt: "2026-01-05T10:00:00.000Z",
    ...overrides,
  };
}

describe("telegram workflow matrix", () => {
  it("allows the documented happy path and blocks shortcuts", () => {
    expect(canTransitionTelegram("draft", "submitted")).toBe(true);
    expect(canTransitionTelegram("submitted", "in_review")).toBe(true);
    expect(canTransitionTelegram("in_review", "approved")).toBe(true);
    expect(canTransitionTelegram("approved", "forwarded")).toBe(true);
    expect(canTransitionTelegram("forwarded", "pending")).toBe(true);
    expect(canTransitionTelegram("pending", "resolved")).toBe(true);
    expect(canTransitionTelegram("resolved", "archived")).toBe(true);

    expect(canTransitionTelegram("draft", "approved")).toBe(false);
    expect(canTransitionTelegram("rejected", "submitted")).toBe(false);
    expect(canTransitionTelegram("archived", "draft")).toBe(false);
    expect(canTransitionTelegram("completed", "in_progress")).toBe(false);
  });

  it("requires a written reason only for returned and rejected telegrams", () => {
    expect(requiresTransitionReason("returned")).toBe(true);
    expect(requiresTransitionReason("rejected")).toBe(true);
    expect(requiresTransitionReason("approved")).toBe(false);
  });

  it("exposes only valid next statuses for the client", () => {
    expect(nextTelegramStatuses("draft")).toEqual(["submitted"]);
    expect(nextTelegramStatuses("in_review")).toEqual([
      "approved",
      "returned",
      "rejected",
    ]);
    expect(nextTelegramStatuses("archived")).toEqual([]);
  });

  it("limits in-place editing and deletion to safe states", () => {
    expect(isEditableTelegramStatus("draft")).toBe(true);
    expect(isEditableTelegramStatus("returned")).toBe(true);
    expect(isEditableTelegramStatus("approved")).toBe(false);
    expect(isDeletableTelegramStatus("draft")).toBe(true);
    expect(isDeletableTelegramStatus("archived")).toBe(true);
    expect(isDeletableTelegramStatus("forwarded")).toBe(false);
  });
});

describe("telegram numbering and import helpers", () => {
  it("builds the official prefix-date-sequence code in the organization timezone", () => {
    const code = buildTelegramSerialCode({
      serialPrefix: "pol",
      date: new Date("2026-01-05T22:30:00.000Z"),
      serialNumber: 42,
      timeZone: "Asia/Damascus",
    });
    expect(code).toBe("POL-2026-01-06-00042");
  });

  it("maps Excel sheet names to directions and normalizes serial keys", () => {
    expect(getImportDirection("وارد")).toBe("incoming");
    expect(getImportDirection("صادر")).toBe("outgoing");
    expect(getImportDirection(undefined)).toBe("outgoing");
    expect(makeImportSerialKey("incoming", " ١٢٣/أ ")).toBe("incoming:123/ا");
    expect(makeImportSerialKey("outgoing", "123/ا")).toBe("outgoing:123/ا");
  });
});

describe("telegram statistics and search", () => {
  it("counts open, urgent, secret and archived telegrams", () => {
    const stats = computeTelegramStats([
      telegram({ id: "1", status: "draft" }),
      telegram({ id: "2", status: "approved", priority: "urgent" }),
      telegram({ id: "3", status: "archived", classification: "secret" }),
      telegram({ id: "4", status: "completed" }),
    ]);
    expect(stats.total).toBe(4);
    expect(stats.open).toBe(2);
    expect(stats.urgent).toBe(1);
    expect(stats.secret).toBe(1);
    expect(stats.archived).toBe(1);
    expect(stats.byStatus.approved).toBe(1);
  });

  it("searches Arabic text while ignoring diacritics and Arabic-Indic digits", () => {
    const record = telegram({
      subject: "تعميم أمني",
      body: "رقم ١٢٣ مرفق",
      recipient: "مديرية الشرطة",
    });
    expect(telegramMatchesSearch(record, "امني")).toBe(true);
    expect(telegramMatchesSearch(record, "123")).toBe(true);
    expect(telegramMatchesSearch(record, "شرطة")).toBe(true);
    expect(telegramMatchesSearch(record, "مفقود")).toBe(false);
  });
});
