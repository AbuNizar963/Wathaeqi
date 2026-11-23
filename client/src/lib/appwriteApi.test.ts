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

  it("uses the production Function fallback only on the production site", () => {
    vi.stubEnv("VITE_APPWRITE_API_URL", "");
    const originalLocation = globalThis.location;

    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { hostname: "wathaeqi.appwrite.network" },
    });

    expect(appwriteApiUrl("/api/trpc/auth.login")).toBe(
      "https://wathaeqi-api.fra.appwrite.run/api/trpc/auth.login"
    );

    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  });
});
