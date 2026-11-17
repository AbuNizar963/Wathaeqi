import { afterEach, describe, expect, it, vi } from "vitest";

const loadAppwriteModule = async (
  values: Partial<Record<
    | "APPWRITE_ENDPOINT"
    | "APPWRITE_PROJECT_ID"
    | "APPWRITE_API_KEY"
    | "APPWRITE_DATABASE_ID"
    | "APPWRITE_BUCKET_ID",
    string
  >> = {}
) => {
  vi.resetModules();

  for (const name of [
    "APPWRITE_ENDPOINT",
    "APPWRITE_PROJECT_ID",
    "APPWRITE_API_KEY",
    "APPWRITE_DATABASE_ID",
    "APPWRITE_BUCKET_ID",
  ] as const) {
    vi.stubEnv(name, values[name] ?? "");
  }

  return import("./appwrite");
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("server-side Appwrite configuration", () => {
  it("does not treat VITE-prefixed values as server credentials", async () => {
    vi.stubEnv("VITE_APPWRITE_ENDPOINT", "https://fra.cloud.appwrite.io/v1");
    vi.stubEnv("VITE_APPWRITE_PROJECT_ID", "wathaeqi");
    vi.stubEnv("VITE_APPWRITE_API_KEY", "not-a-server-secret");

    const appwrite = await loadAppwriteModule();

    expect(appwrite.isAppwriteConfigured()).toBe(false);
    expect(() => appwrite.getAppwriteAdminClient()).toThrow(
      "APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY"
    );
  });

  it("requires all server credentials without exposing their values", async () => {
    const appwrite = await loadAppwriteModule({
      APPWRITE_ENDPOINT: "https://fra.cloud.appwrite.io/v1",
      APPWRITE_PROJECT_ID: "wathaeqi",
    });

    expect(appwrite.isAppwriteConfigured()).toBe(false);
    expect(() => appwrite.getAppwriteAdminClient()).toThrow(
      "APPWRITE_API_KEY"
    );
    expect(() => appwrite.getAppwriteAdminClient()).not.toThrow(
      "not-a-server-secret"
    );
  });

  it("rejects insecure or malformed endpoints", async () => {
    const appwrite = await loadAppwriteModule({
      APPWRITE_ENDPOINT: "http://fra.cloud.appwrite.io/v1",
      APPWRITE_PROJECT_ID: "wathaeqi",
      APPWRITE_API_KEY: "test-key",
    });

    expect(appwrite.isAppwriteConfigured()).toBe(false);
    expect(() => appwrite.getAppwriteAdminClient()).toThrow(
      "valid absolute HTTPS URL ending in /v1"
    );
  });

  it("creates and reuses server SDK services with valid configuration", async () => {
    const appwrite = await loadAppwriteModule({
      APPWRITE_ENDPOINT: "https://fra.cloud.appwrite.io/v1/",
      APPWRITE_PROJECT_ID: "wathaeqi",
      APPWRITE_API_KEY: "test-key",
      APPWRITE_DATABASE_ID: "wathaeqi-db",
      APPWRITE_BUCKET_ID: "document-attachments",
    });

    expect(appwrite.isAppwriteConfigured()).toBe(true);
    expect(appwrite.getAppwriteAdminClient()).toBe(
      appwrite.getAppwriteAdminClient()
    );
    expect(appwrite.getAppwriteTablesDB()).toBe(
      appwrite.getAppwriteTablesDB()
    );
    expect(appwrite.getAppwriteStorage()).toBe(
      appwrite.getAppwriteStorage()
    );
    expect(appwrite.getAppwriteDatabaseId()).toBe("wathaeqi-db");
    expect(appwrite.getAppwriteBucketId()).toBe("document-attachments");
  });

  it("requires database and bucket identifiers only when those services are used", async () => {
    const appwrite = await loadAppwriteModule({
      APPWRITE_ENDPOINT: "https://fra.cloud.appwrite.io/v1",
      APPWRITE_PROJECT_ID: "wathaeqi",
      APPWRITE_API_KEY: "test-key",
    });

    expect(appwrite.isAppwriteConfigured()).toBe(true);
    expect(() => appwrite.getAppwriteDatabaseId()).toThrow(
      "APPWRITE_DATABASE_ID"
    );
    expect(() => appwrite.getAppwriteBucketId()).toThrow(
      "APPWRITE_BUCKET_ID"
    );
  });
});
