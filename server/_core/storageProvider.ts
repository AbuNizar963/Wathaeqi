import { createHash } from "node:crypto";
import { InputFile } from "node-appwrite/file";
import { ENV } from "./env";
import {
  getAppwriteBucketId,
  getAppwriteStorage,
  getAppwriteTokens,
} from "./appwrite";

export interface StorageProvider {
  upload(
    key: string,
    body: Buffer,
    options: { contentType: string; cacheControl: string }
  ): Promise<void>;
  createSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  createSignedUploadUrl(
    key: string,
    metadata: { fileName: string; contentType: string; sizeBytes: number }
  ): Promise<string>;
  getObjectInfo(key: string): Promise<{ size: number; contentType: string }>;
  download(key: string): Promise<{ body: Buffer; contentType: string }>;
  remove?(key: string): Promise<void>;
}

type StorageKeyParts = {
  fileId: string;
  fileName: string;
  folder: string;
};

function parseStorageKey(key: string): StorageKeyParts {
  const segments = key.split("/");
  if (
    segments.length < 2 ||
    segments.some(
      segment =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("\\")
    )
  ) {
    throw new Error("Invalid Appwrite storage key");
  }

  const fileName = segments[segments.length - 1];
  const folder = segments.slice(0, -1).join("/");
  const fileId = createHash("sha256").update(key).digest("hex").slice(0, 32);

  return { fileId, fileName, folder };
}

function getAppwriteFileTokenUrl(fileId: string, token: string): string {
  const endpoint = new URL(ENV.appwriteEndpoint);
  const basePath = endpoint.pathname.replace(/\/+$/, "");
  const url = new URL(
    `${basePath}/storage/buckets/${encodeURIComponent(
      getAppwriteBucketId()
    )}/files/${encodeURIComponent(fileId)}/view`,
    endpoint.origin
  );
  url.searchParams.set("project", ENV.appwriteProjectId);
  url.searchParams.set("token", token);
  return url.toString();
}

class AppwriteStorageProvider implements StorageProvider {
  async upload(
    key: string,
    body: Buffer,
    options: { contentType: string; cacheControl: string }
  ): Promise<void> {
    const { fileId, fileName, folder } = parseStorageKey(key);
    await getAppwriteStorage().createFile({
      bucketId: getAppwriteBucketId(),
      fileId,
      file: InputFile.fromBuffer(body, fileName),
      folder,
      permissions: [],
    });
  }

  async createSignedUrl(
    key: string,
    expiresInSeconds: number
  ): Promise<string> {
    const { fileId } = parseStorageKey(key);
    const expire = new Date(
      Date.now() + expiresInSeconds * 1000
    ).toISOString();
    const token = await getAppwriteTokens().createFileToken({
      bucketId: getAppwriteBucketId(),
      fileId,
      expire,
    });

    if (!token.secret) {
      throw new Error("Appwrite did not return a file access token");
    }

    return getAppwriteFileTokenUrl(fileId, token.secret);
  }

  async createSignedUploadUrl(
    key: string,
    metadata: { fileName: string; contentType: string; sizeBytes: number }
  ): Promise<string> {
    const match = key.match(
      /^organizations\/([0-9a-f-]{36})\/telegrams\/([1-9]\d*)\/attachments\/[0-9a-f-]{36}-(.+)$/i
    );
    if (!match) {
      throw new Error("Invalid organization attachment storage key");
    }

    const [, , telegramId] = match;
    const query = new URLSearchParams({
      key,
      fileName: metadata.fileName,
      contentType: metadata.contentType,
      sizeBytes: String(metadata.sizeBytes),
    });

    return `/api/telegrams/${telegramId}/attachments/upload?${query.toString()}`;
  }

  async getObjectInfo(
    key: string
  ): Promise<{ size: number; contentType: string }> {
    const { fileId } = parseStorageKey(key);
    const file = await getAppwriteStorage().getFile({
      bucketId: getAppwriteBucketId(),
      fileId,
    });

    return {
      size: file.sizeOriginal,
      contentType: file.mimeType || "application/octet-stream",
    };
  }

  async download(key: string): Promise<{ body: Buffer; contentType: string }> {
    const { fileId } = parseStorageKey(key);
    const storage = getAppwriteStorage();
    const [file, data] = await Promise.all([
      storage.getFile({
        bucketId: getAppwriteBucketId(),
        fileId,
      }),
      storage.getFileDownload({
        bucketId: getAppwriteBucketId(),
        fileId,
      }),
    ]);

    return {
      body: Buffer.from(data as ArrayBuffer),
      contentType: file.mimeType || "application/octet-stream",
    };
  }

  async remove(key: string): Promise<void> {
    const { fileId } = parseStorageKey(key);
    await getAppwriteStorage().deleteFile({
      bucketId: getAppwriteBucketId(),
      fileId,
    });
  }
}

let provider: StorageProvider | undefined;

export function getStorageProvider(): StorageProvider {
  provider ??= new AppwriteStorageProvider();
  return provider;
}

export function resetStorageProviderForTests(): void {
  provider = undefined;
}
