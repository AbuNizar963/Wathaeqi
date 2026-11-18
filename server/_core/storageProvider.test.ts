import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createFile: vi.fn(),
  createFileToken: vi.fn(),
  createJWT: vi.fn(),
  deleteFile: vi.fn(),
  getFile: vi.fn(),
  getFileDownload: vi.fn(),
  fromBuffer: vi.fn(),
}));

vi.mock("./appwrite", () => ({
  getAppwriteBucketId: () => "document-attachments",
  getAppwriteStorage: () => mocks,
  getAppwriteTokens: () => mocks,
  getAppwriteUsers: () => mocks,
}));

vi.mock("./env", () => ({
  ENV: {
    appwriteEndpoint: "https://fra.cloud.appwrite.io/v1",
    appwriteProjectId: "wathaeqi",
  },
}));

vi.mock("node-appwrite/file", () => ({
  InputFile: { fromBuffer: mocks.fromBuffer },
}));

import {
  getStorageProvider,
  resetStorageProviderForTests,
} from "./storageProvider";

describe("Appwrite storage provider", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetStorageProviderForTests();
    mocks.fromBuffer.mockReturnValue({ kind: "input-file" });
    mocks.createFile.mockResolvedValue({ $id: "file-id" });
    mocks.createFileToken.mockResolvedValue({ secret: "short-lived-token" });
    mocks.createJWT.mockResolvedValue({ jwt: "short-lived-upload-jwt" });
    mocks.getFile.mockResolvedValue({
      sizeOriginal: 12,
      mimeType: "application/pdf",
    });
    mocks.getFileDownload.mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer);
    mocks.deleteFile.mockResolvedValue({});
  });

  it("uploads files privately using a deterministic Appwrite file ID", async () => {
    const key =
      "organizations/550e8400-e29b-41d4-a716-446655440000/telegrams/7/attachments/report.pdf";
    const body = Buffer.from("report");
    await getStorageProvider().upload(key, body, {
      contentType: "application/pdf",
      cacheControl: "3600",
    });

    const { createHash } = await import("node:crypto");
    const expectedId = createHash("sha256")
      .update(key)
      .digest("hex")
      .slice(0, 32);

    expect(mocks.fromBuffer).toHaveBeenCalledWith(body, "report.pdf");
    expect(mocks.createFile).toHaveBeenCalledWith({
      bucketId: "document-attachments",
      fileId: expectedId,
      file: { kind: "input-file" },
      folder:
        "organizations/550e8400-e29b-41d4-a716-446655440000/telegrams/7/attachments",
      permissions: [],
    });
  });

  it("creates an expiring Appwrite file-token URL", async () => {
    const key =
      "organizations/550e8400-e29b-41d4-a716-446655440000/telegrams/7/attachments/report.pdf";
    const url = new URL(await getStorageProvider().createSignedUrl(key, 600));

    expect(mocks.createFileToken).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketId: "document-attachments",
        fileId: expect.any(String),
        expire: expect.any(String),
      })
    );
    expect(url.origin).toBe("https://fra.cloud.appwrite.io");
    expect(url.pathname).toMatch(
      /^\/v1\/storage\/buckets\/document-attachments\/files\/[a-f0-9]{32}\/view$/
    );
    expect(url.searchParams.get("project")).toBe("wathaeqi");
    expect(url.searchParams.get("token")).toBe("short-lived-token");
  });

  it("creates a short-lived Appwrite user JWT for direct upload", async () => {
    const key =
      "organizations/550e8400-e29b-41d4-a716-446655440000/telegrams/7/attachments/550e8400-e29b-41d4-a716-446655440001-report.pdf";
    const authorization = await getStorageProvider().createSignedUploadUrl(
      key,
      {
        fileName: "report.pdf",
        contentType: "application/pdf",
        sizeBytes: 12,
      },
      "appwrite-user-7"
    );
    const url = new URL(authorization.uploadUrl);

    expect(mocks.createJWT).toHaveBeenCalledWith({
      userId: "appwrite-user-7",
      duration: 300,
    });
    expect(authorization.uploadJwt).toBe("short-lived-upload-jwt");
    expect(authorization.fileId).toMatch(/^[a-f0-9]{32}$/);
    expect(authorization.folder).toBe(
      "organizations/550e8400-e29b-41d4-a716-446655440000/telegrams/7/attachments"
    );
    expect(url.origin).toBe("https://fra.cloud.appwrite.io");
    expect(url.pathname).toBe("/v1/storage/buckets/document-attachments/files");
    expect(url.searchParams.get("project")).toBe("wathaeqi");
  });

  it("reads metadata and downloads bytes from Appwrite", async () => {
    const key =
      "department/logos/550e8400-e29b-41d4-a716-446655440000/badge.png";
    await expect(getStorageProvider().getObjectInfo(key)).resolves.toEqual({
      size: 12,
      contentType: "application/pdf",
    });
    await expect(getStorageProvider().download(key)).resolves.toEqual({
      body: Buffer.from([1, 2, 3]),
      contentType: "application/pdf",
    });
    expect(mocks.getFile).toHaveBeenCalledTimes(2);
    expect(mocks.getFileDownload).toHaveBeenCalledOnce();
  });

  it("deletes an Appwrite file by its deterministic key", async () => {
    const key =
      "department/logos/550e8400-e29b-41d4-a716-446655440000/badge.png";
    await getStorageProvider().remove?.(key);
    expect(mocks.deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketId: "document-attachments",
        fileId: expect.any(String),
      })
    );
  });

  it("rejects unsafe storage paths", async () => {
    await expect(
      getStorageProvider().getObjectInfo("department/../secret.txt")
    ).rejects.toThrow("Invalid Appwrite storage key");
  });
});
