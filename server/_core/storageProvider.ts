import { createHash } from "node:crypto";
import { InputFile } from "node-appwrite/file";
import { ENV } from "./env";
import {
  getAppwriteBucketId,
  getAppwriteStorage,
  getAppwriteTokens,
} from "./appwrite";
import { getSupabaseAdmin } from "./supabase";

export interface StorageProvider {
  upload(
    key: string,
    body: Buffer,
    options: { contentType: string; cacheControl: string }
  ): Promise<void>;
  createSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
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

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as Record<string, unknown>;
  return (
    value.code === 404 ||
    value.status === 404 ||
    value.status === "404" ||
    value.statusCode === 404 ||
    value.statusCode === "404" ||
    value.code === "404" ||
    value.code === "not_found"
  );
}

function getAppwriteFileTokenUrl(fileId: string, token: string): string {
  const endpoint = new URL(ENV.appwriteEndpoint);
  const basePath = endpoint.pathname.replace(/\\/+$/, "");
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
    _options: { contentType: string; cacheControl: string }
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
    const expire = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
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

/**
 * Supabase is retained as a read/cleanup fallback for objects created before
 * Appwrite became the write target. New objects are never written to Supabase.
 */
class LegacySupabaseStorageProvider {
  async createSignedUrl(
    key: string,
    expiresInSeconds: number
  ): Promise<string> {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(ENV.supabaseStorageBucket)
      .createSignedUrl(key, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new Error(
        `Legacy storage signed URL failed: ${error?.message ?? "empty URL"}`
      );
    }
    return data.signedUrl;
  }

  async getObjectInfo(
    key: string
  ): Promise<{ size: number; contentType: string }> {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(ENV.supabaseStorageBucket)
      .info(key);
    const size = Number(data?.size);
    if (error || !data || !Number.isSafeInteger(size) || size < 0) {
      throw new Error(
        `Legacy storage object info failed: ${error?.message ?? "invalid metadata"}`
      );
    }
    return {
      size,
      contentType: data.contentType || "application/octet-stream",
    };
  }

  async download(key: string): Promise<{ body: Buffer; contentType: string }> {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(ENV.supabaseStorageBucket)
      .download(key);
    if (error || !data) {
      throw new Error(
        `Legacy storage download failed: ${error?.message ?? "empty object"}`
      );
    }
    return {
      body: Buffer.from(await data.arrayBuffer()),
      contentType: data.type || "application/octet-stream",
    };
  }

  async remove(key: string): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .storage.from(ENV.supabaseStorageBucket)
      .remove([key]);
    if (error && !isNotFoundError(error)) {
      throw new Error(`Legacy storage cleanup failed: ${error.message}`);
    }
  }
}

class HybridStorageProvider implements StorageProvider {
  private readonly appwrite = new AppwriteStorageProvider();
  private readonly legacy = new LegacySupabaseStorageProvider();

  upload(
    key: string,
    body: Buffer,
    options: { contentType: string; cacheControl: string }
  ): Promise<void> {
    return this.appwrite.upload(key, body, options);
  }

  async createSignedUrl(
    key: string,
    expiresInSeconds: number
  ): Promise<string> {
    try {
      return await this.appwrite.createSignedUrl(key, expiresInSeconds);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      return this.legacy.createSignedUrl(key, expiresInSeconds);
    }
  }

  async getObjectInfo(
    key: string
  ): Promise<{ size: number; contentType: string }> {
    try {
      return await this.appwrite.getObjectInfo(key);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      return this.legacy.getObjectInfo(key);
    }
  }

  async download(key: string): Promise<{ body: Buffer; contentType: string }> {
    try {
      return await this.appwrite.download(key);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      return this.legacy.download(key);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.appwrite.remove?.(key);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
    try {
      await this.legacy.remove(key);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
}

let provider: StorageProvider | undefined;

export function getStorageProvider(): StorageProvider {
  provider ??= new HybridStorageProvider();
  return provider;
}

export function resetStorageProviderForTests(): void {
  provider = undefined;
}
