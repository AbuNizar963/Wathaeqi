import { describe, expect, it } from "vitest";
import { assertProductionEnvironment, ENV } from "./env";

describe("assertProductionEnvironment", () => {
  const validEnvironment = {
    ...ENV,
    isProduction: true,
    appwriteEndpoint: "https://cloud.appwrite.io/v1",
    appwriteProjectId: "wathaeqi",
    appwriteApiKey: "appwrite_server_key_for_tests",
    appwriteDatabaseId: "wathaeqi-db",
    appwriteBucketId: "telegram-attachments",
    authSessionSecret: "a".repeat(32),
    supabaseUrl: "",
    supabaseSecretKey: "",
  };

  it("accepts a valid Appwrite production environment without Supabase", () => {
    expect(() => assertProductionEnvironment(validEnvironment)).not.toThrow();
  });

  it("does not enforce production secrets in development", () => {
    expect(() =>
      assertProductionEnvironment({
        ...validEnvironment,
        isProduction: false,
        appwriteEndpoint: "",
        appwriteProjectId: "",
        appwriteApiKey: "",
        appwriteDatabaseId: "",
        appwriteBucketId: "",
        authSessionSecret: "",
      })
    ).not.toThrow();
  });

  it("rejects missing Appwrite production configuration", () => {
    expect(() =>
      assertProductionEnvironment({
        ...validEnvironment,
        appwriteApiKey: "",
      })
    ).toThrow("APPWRITE_API_KEY");

    expect(() =>
      assertProductionEnvironment({
        ...validEnvironment,
        appwriteDatabaseId: "",
      })
    ).toThrow("APPWRITE_DATABASE_ID");
  });

  it("rejects a missing or weak session secret", () => {
    expect(() =>
      assertProductionEnvironment({
        ...validEnvironment,
        authSessionSecret: "too-short",
      })
    ).toThrow("AUTH_SESSION_SECRET");
  });

  it("rejects malformed or non-HTTPS Appwrite endpoints", () => {
    expect(() =>
      assertProductionEnvironment({
        ...validEnvironment,
        appwriteEndpoint: "not-a-url",
      })
    ).toThrow("valid absolute HTTPS URL");

    expect(() =>
      assertProductionEnvironment({
        ...validEnvironment,
        appwriteEndpoint: "http://localhost/v1",
      })
    ).toThrow("valid absolute HTTPS URL");

    expect(() =>
      assertProductionEnvironment({
        ...validEnvironment,
        appwriteEndpoint: "https://cloud.appwrite.io",
      })
    ).toThrow("valid absolute HTTPS URL");
  });
});
