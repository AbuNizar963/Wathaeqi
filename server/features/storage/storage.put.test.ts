import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  upload,
  createSignedUrl,
  createSignedUploadUrl,
  getObjectInfo,
  provider,
} = vi.hoisted(() => {
  const upload = vi.fn();
  const createSignedUrl = vi.fn();
  const createSignedUploadUrl = vi.fn();
  const getObjectInfo = vi.fn();
  const provider = {
    upload,
    createSignedUrl,
    createSignedUploadUrl,
    getObjectInfo,
  };
  return {
    upload,
    createSignedUrl,
    createSignedUploadUrl,
    getObjectInfo,
    provider,
  };
});

vi.mock("../../_core/storageProvider", () => ({
  getStorageProvider: () => provider,
}));

import {
  parseOrganizationAttachmentKey,
  storageCreateOrganizationAttachmentUploadUrl,
  validateStorageProviderUrl,
  storageGetObjectInfo,
  storagePutDepartmentLogo,
  storagePutOrganizationAttachment,
} from "./storage";

describe("stable storage URLs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upload.mockResolvedValue(undefined);
    createSignedUrl.mockResolvedValue("https://storage.example/signed");
    createSignedUploadUrl.mockResolvedValue(
      "https://storage.example/signed-upload?token=opaque"
    );
    getObjectInfo.mockResolvedValue({
      size: 12,
      contentType: "application/pdf",
    });
  });

  it("rejects insecure or malformed provider URLs in production", () => {
    expect(() => {
      validateStorageProviderUrl("http://storage.example/upload", true);
    }).toThrow("Storage URLs must use HTTPS in production");
    expect(() => {
      validateStorageProviderUrl("javascript:alert(1)", true);
    }).toThrow("Storage provider returned an unsafe URL");
    expect(() => {
      validateStorageProviderUrl(
        "https://user:password@storage.example/upload",
        true
      );
    }).toThrow("Storage provider returned an unsafe URL");
  });

  it("allows validated same-origin Appwrite upload routes", () => {
    const uploadUrl =
      "/api/telegrams/7/attachments/upload?key=organizations%2Forg%2Ftelegrams%2F7%2Fattachments%2Ffile.pdf&fileName=file.pdf&contentType=application%2Fpdf&sizeBytes=12";

    expect(validateStorageProviderUrl(uploadUrl, true)).toBe(uploadUrl);
    expect(() =>
      validateStorageProviderUrl(
        "//evil.example/api/telegrams/7/attachments/upload?key=x&fileName=x&contentType=x&sizeBytes=1",
        true
      )
    ).toThrow("Storage provider returned an unsafe internal URL");
  });

  it("allows local HTTP storage URLs only outside production", () => {
    const localUrl = validateStorageProviderUrl(
      "http://127.0.0.1:54321/storage/upload",
      false
    );
    const productionUrl = validateStorageProviderUrl(
      "https://storage.example/upload",
      true
    );

    expect(localUrl).toBe("http://127.0.0.1:54321/storage/upload");
    expect(productionUrl).toBe("https://storage.example/upload");
  });

  it("creates a signed upload URL scoped to one organization and telegram", async () => {
    const organizationId = "550e8400-e29b-41d4-a716-446655440000";
    const metadata = {
      contentType: "application/pdf" as const,
      sizeBytes: 12,
    };
    const result = await storageCreateOrganizationAttachmentUploadUrl(
      organizationId,
      7,
      "report.pdf",
      metadata
    );

    expect(result.key).toMatch(
      new RegExp(
        "^organizations/" +
          organizationId +
          "/telegrams/7/attachments/[0-9a-f-]{36}-report\\.pdf$",
        "i"
      )
    );
    expect(result.uploadUrl).toBe(
      "https://storage.example/signed-upload?token=opaque"
    );
    expect(createSignedUploadUrl).toHaveBeenCalledWith(result.key, {
      fileName: "report.pdf",
      ...metadata,
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it("reads object metadata without downloading file bytes", async () => {
    await expect(
      storageGetObjectInfo("organizations/org/telegrams/7/attachments/file.pdf")
    ).resolves.toEqual({
      size: 12,
      contentType: "application/pdf",
    });
    expect(getObjectInfo).toHaveBeenCalledWith(
      "organizations/org/telegrams/7/attachments/file.pdf"
    );
  });

  it("stores new attachments below their immutable organization and telegram path", async () => {
    const organizationId = "550e8400-e29b-41d4-a716-446655440000";
    const result = await storagePutOrganizationAttachment(
      organizationId,
      7,
      "report.pdf",
      Buffer.from("attachment"),
      "application/pdf"
    );

    expect(result.key).toMatch(
      new RegExp(
        `^organizations/${organizationId}/telegrams/7/attachments/[0-9a-f-]{36}-report\\.pdf$`,
        "i"
      )
    );
    expect(parseOrganizationAttachmentKey(result.key)).toEqual({
      organizationId,
      telegramId: 7,
    });
    expect(result.url).toBe(`/api/storage/${result.key}`);
    expect(upload).toHaveBeenCalledWith(result.key, Buffer.from("attachment"), {
      contentType: "application/pdf",
      cacheControl: "3600",
    });
  });

  it("rejects invalid organization or telegram identifiers before upload", async () => {
    await expect(
      storagePutOrganizationAttachment(
        "not-a-uuid",
        7,
        "report.pdf",
        Buffer.from("attachment"),
        "application/pdf"
      )
    ).rejects.toThrow("Storage access denied");
    await expect(
      storagePutOrganizationAttachment(
        "550e8400-e29b-41d4-a716-446655440000",
        0,
        "report.pdf",
        Buffer.from("attachment"),
        "application/pdf"
      )
    ).rejects.toThrow("Storage access denied");

    expect(upload).not.toHaveBeenCalled();
  });

  it("returns a stable logo URL", async () => {
    const organizationId = "550e8400-e29b-41d4-a716-446655440000";
    const result = await storagePutDepartmentLogo(
      organizationId,
      "badge.png",
      Buffer.from("image"),
      "image/png"
    );

    expect(result.key.startsWith(`department/logos/${organizationId}/`)).toBe(
      true
    );
    expect(result.key.endsWith("-badge.png")).toBe(true);
    expect(result.url).toBe(`/api/storage/${result.key}`);
    expect(upload).toHaveBeenCalledWith(result.key, Buffer.from("image"), {
      contentType: "image/png",
      cacheControl: "3600",
    });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects malformed organization IDs", async () => {
    await expect(
      storagePutDepartmentLogo(
        "not-a-uuid",
        "badge.png",
        Buffer.from("image"),
        "image/png"
      )
    ).rejects.toThrow("Storage access denied");

    expect(upload).not.toHaveBeenCalled();
  });
});
