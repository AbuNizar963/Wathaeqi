import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createFile: vi.fn(),
  createFileToken: vi.fn(),
  deleteFile: vi.fn(),
  getFile: vi.fn(),
  getFileDownload: vi.fn(),
  fromBuffer: vi.fn(),
  legacyCreateSignedUrl: vi.fn(),
  legacyInfo: vi.fn(),
  legacyDownload: vi.fn(),
  legacyFrom: vi.fn(),
}));

vi.mock("./appwrite", () => ({
  getAppwriteBucketId: () => "document-attachments",
  getAppwriteStorage: () => mocks,
  getAppwriteTokens: () => mocks,
}));

vi.mock("./env", () => ({
  ENV: {
    appwriteEndpoint: "https://fra.cloud.appwrite.io/v1",
    appwriteProjectId: "wathaeqi",
    supabaseStorageBucket: "telegram-files",
  },
}));

vi.mock("node-appwrite/file", () => ({
  InputFile: { fromBuffer: mocks.fromBuffer },
}));
vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: mocks.legacyFrom,
    },
  }),
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
    mocks.getFile.mockResolvedValue({
      sizeOriginal: 12,
      mimeType: "application/pdf",
    });
    mocks.getFileDownload.mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer);
    mocks.deleteFile.mockResolvedValue({});
    mocks.legacyCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://legacy.example/signed" },
      error: null,
    });
    mocks.legacyInfo.mockResolvedValue({
      data: { size: 6, contentType: "application/pdf" },
      error: null,
    });
    mocks.legacyDownload.mockResolvedValue({
      data: new Blob([Buffer.from("legacy")], { type: "application/pdf" }),
      error: null,
    });
    mocks.legacyFrom.mockReturnValue({
      createSignedUrl: mocks.legacyCreateSignedUrl,
      info: mocks.legacyInfo,
      download: mocks.legacyDownload,
    });
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

  it("does not hide Appwrite service failures behind the legacy store", async () => {
    const failure = { code: 500, message: "Appwrite unavailable" };
    mocks.getFile.mockRejectedValueOnce(failure);

    await expect(
      getStorageProvider().getObjectInfo("telegrams/7/legacy.pdf")
    ).rejects.toEqual(failure);
    expect(mocks.legacyFrom).not.toHaveBeenCalled();
  });

  it("reads existing Supabase object metadata when Appwrite has no file", async () => {
    mocks.getFile.mockRejectedValueOnce({ code: 404 });

    await expect(
      getStorageProvider().getObjectInfo("telegrams/7/legacy.pdf")
    ).resolves.toEqual({
      size: 6,
      contentType: "application/pdf",
    });

    expect(mocks.legacyFrom).toHaveBeenCalledWith("telegram-files");
    expect(mocks.legacyInfo).toHaveBeenCalledWith("telegrams/7/legacy.pdf");
  });

  it("downloads existing Supabase objects when Appwrite has no file", async () => {
    mocks.getFile.mockRejectedValueOnce({ code: 404 });

    await expect(
      getStorageProvider().download("telegrams/7/legacy.pdf")
    ).resolves.toEqual({
      body: Buffer.from("legacy"),
      contentType: "application/pdf",
    });
    expect(mocks.legacyDownload).toHaveBeenCalledWith("telegrams/7/legacy.pdf");
  });

  it(
    "uses legacy Supabase URLs for missing Appwrite files",
    async () => {
      mocks.createFileToken.mockRejectedValueOnce({ code: 404 });

      await expect(
        getStorageProvider().createSignedUrl("telegrams/7/legacy.pdf", 600)
      ).resolves.toBe("https://legacy.example/signed");

      expect(mocks.legacyCreateSignedUrl).toHaveBeenCalledWith(
        "telegrams/7/legacy.pdf",
        600
      );
    },
  );

  it("never deletes legacy Supabase objects during generic cleanup", async () => {
    mocks.deleteFile.mockRejectedValueOnce({ code: 404 });

    await expect(
      getStorageProvider().remove?.("telegrams/7/legacy.pdf")
    ).resolves.toBeUndefined();

    expect(mocks.legacyFrom).not.toHaveBeenCalled();
  });

  it("rejects unsafe storage paths", async () => {
    await expect(
      getStorageProvider().getObjectInfo("department/../secret.txt")
    ).rejects.toThrow("Invalid Appwrite storage key");
  });
});
