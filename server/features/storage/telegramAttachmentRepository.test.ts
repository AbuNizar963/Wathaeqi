import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRow: vi.fn(),
  listRows: vi.fn(),
}));

vi.mock("../../_core/appwrite", () => ({
  getAppwriteDatabaseId: () => "wathaeqi-db",
  getAppwriteTablesDB: () => mocks,
}));

import {
  createTelegramAttachment,
  getTelegramAttachmentById,
  getTelegramAttachmentByStorageKey,
  listTelegramAttachments,
} from "./telegramAttachmentRepository";

const attachment = {
  id: 12345,
  telegramId: 42,
  storageOrganizationId: "00000000-0000-4000-8000-000000000010",
  storageKey:
    "organizations/00000000-0000-4000-8000-000000000010/telegrams/42/attachments/00000000-0000-4000-8000-000000000011-report.pdf",
  originalName: "report.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024,
  sha256: "a".repeat(64),
  uploadedByUserId: 7,
  scanStatus: "unavailable",
  createdAt: "2026-11-18T00:00:00.000Z",
};

const row = { $id: "attachment-row", data: attachment };

describe("Appwrite telegram attachment repository", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createRow.mockResolvedValue(row);
    mocks.listRows.mockResolvedValue({ rows: [row] });
  });

  it("creates attachment metadata in Appwrite", async () => {
    await createTelegramAttachment({
      telegramId: attachment.telegramId,
      storageOrganizationId: attachment.storageOrganizationId,
      storageKey: attachment.storageKey,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      sha256: attachment.sha256,
      uploadedByUserId: attachment.uploadedByUserId,
    });

    expect(mocks.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: "wathaeqi-db",
        tableId: "telegram_attachments",
        rowId: expect.any(String),
        data: expect.objectContaining({
          telegramId: attachment.telegramId,
          storageKey: attachment.storageKey,
          scanStatus: "unavailable",
          createdAt: expect.any(String),
        }),
      })
    );
  });

  it("loads attachment metadata by numeric id", async () => {
    await expect(getTelegramAttachmentById(attachment.id)).resolves.toEqual(
      attachment
    );
    expect(mocks.listRows).toHaveBeenCalledOnce();
  });

  it("loads attachment metadata by unique storage key", async () => {
    await expect(
      getTelegramAttachmentByStorageKey(attachment.storageKey)
    ).resolves.toEqual(attachment);
  });

  it("lists all attachment metadata for a telegram", async () => {
    await expect(
      listTelegramAttachments(attachment.telegramId)
    ).resolves.toEqual([attachment]);
    expect(mocks.listRows).toHaveBeenCalledOnce();
  });

  it(
    "rejects duplicate storage-key rows instead of choosing an arbitrary one",
    async () => {
    mocks.listRows.mockResolvedValue({ rows: [row, row] });
    await expect(
      getTelegramAttachmentByStorageKey(attachment.storageKey)
    ).rejects.toThrow("Duplicate telegram attachment storage keys");
    }
  );

  it("surfaces Appwrite read errors", async () => {
    mocks.listRows.mockRejectedValue(new Error("permission denied"));
    await expect(getTelegramAttachmentById(attachment.id)).rejects.toThrow(
      "permission denied"
    );
  });
});
