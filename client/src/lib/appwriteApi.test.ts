import { afterEach, describe, expect, it, vi } from "vitest";
import { appwriteApiUrl } from "./appwriteApi";

describe("appwriteApiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the configured Appwrite Function origin", () => {
    vi.stubEnv(
      "VITE_APPWRITE_API_URL",
      "https://wathaeqi-api.fra.appwrite.run/"
    );

    expect(appwriteApiUrl("/api/documents/upload")).toBe(
      "https://wathaeqi-api.fra.appwrite.run/api/documents/upload"
    );
  });

  it("preserves a relative path when no Appwrite origin is configured", () => {
    vi.stubEnv("VITE_APPWRITE_API_URL", "");

    expect(appwriteApiUrl("/api/documents/upload")).toBe(
      "/api/documents/upload"
    );
  });
});
