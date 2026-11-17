import { afterEach, describe, expect, it, vi } from "vitest";

const APPWRITE_ENVIRONMENT_VARIABLES = [
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
  "APPWRITE_DATABASE_ID",
  "APPWRITE_BUCKET_ID",
] as const;

type AppwriteEnvironmentVariable =
  (typeof APPWRITE_ENVIRONMENT_VARIABLES)[number];

const loadAppwriteModule = async (
  values: Partial<Record<AppwriteEnvironmentVariable, string>> = {}
) => {
  vi.resetModules();

  for (const name of APPWRITE_ENVIRONMENT_VARIABLES) {
    vi.stubEnv(name, values[name] ?? "");
  }

  return import("./appwrite");
};

const captureErrorMessage = (callback: () => unknown): string => {
  try {
    callback();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  return "";
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
    expect(
      captureErrorMessage(() => appwrite.getAppwriteAdminClient())
    ).toContain(
      "APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY"
    );
  });

  it(
    "requires all server credentials without exposing their values",
    async () => {
      const appwrite = await loadAppwriteModule({
        APPWRITE_ENDPOINT: "https://fra.cloud.appwrite.io/v1",
        APPWRITE_PROJECT_ID: "wathaeqi",
      });

      expect(appwrite.isAppwriteConfigured()).toBe(false);

      const errorMessage = captureErrorMessage(() =>
        appwrite.getAppwriteAdminClient()
      );

      expect(errorMessage).toContain("APPWRITE_API_KEY");
      expect(errorMessage).not.toContain("not-a-server-secret");
    }
  );

  it("rejects insecure or malformed endpoints", async () => {
    const appwrite = await loadAppwriteModule({
      APPWRITE_ENDPOINT: "http://fra.cloud.appwrite.io/v1",
      APPWRITE_PROJECT_ID: "wathaeqi",
      APPWRITE_API_KEY: "test-key",
    });

    expect(appwrite.isAppwriteConfigured()).toBe(false);
    expect(
      captureErrorMessage(() => appwrite.getAppwriteAdminClient())
    ).toContain("valid absolute HTTPS URL ending in /v1");
  });

  it(
    "creates and reuses server SDK services with valid configuration",
    async () => {
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
    }
  );

  it(
    "requires database and bucket identifiers only when those services are used",
    async () => {
      const appwrite = await loadAppwriteModule({
        APPWRITE_ENDPOINT: "https://fra.cloud.appwrite.io/v1",
        APPWRITE_PROJECT_ID: "wathaeqi",
        APPWRITE_API_KEY: "test-key",
      });

      expect(appwrite.isAppwriteConfigured()).toBe(true);
      expect(
        captureErrorMessage(() => appwrite.getAppwriteDatabaseId())
      ).toContain("APPWRITE_DATABASE_ID");
      expect(
        captureErrorMessage(() => appwrite.getAppwriteBucketId())
      ).toContain("APPWRITE_BUCKET_ID");
    }
  );
});
