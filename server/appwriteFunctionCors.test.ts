import { describe, expect, it } from "vitest";
import {
  applyCorsHeaders,
  createCorsHeaders,
  getRequestHeader,
} from "../appwrite/functions/wathaeqi-api/src/main";

describe("Appwrite function CORS response headers", () => {
  it("uses the configured production origin when Appwrite omits Origin", () => {
    const previous = process.env.APPWRITE_WEB_ORIGINS;
    process.env.APPWRITE_WEB_ORIGINS = "https://wathaeqi.appwrite.network";

    try {
      const headers = createCorsHeaders(undefined);
      expect(headers.get("Access-Control-Allow-Origin")).toBe(
        "https://wathaeqi.appwrite.network"
      );
      expect(headers.get("Access-Control-Allow-Methods")).toContain("OPTIONS");
    } finally {
      if (previous === undefined) delete process.env.APPWRITE_WEB_ORIGINS;
      else process.env.APPWRITE_WEB_ORIGINS = previous;
    }
  });

  it("does not reflect an unapproved supplied origin", () => {
    const previous = process.env.APPWRITE_WEB_ORIGINS;
    process.env.APPWRITE_WEB_ORIGINS = "https://wathaeqi.appwrite.network";

    try {
      const headers = createCorsHeaders("https://attacker.example");
      expect(headers.has("Access-Control-Allow-Origin")).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.APPWRITE_WEB_ORIGINS;
      else process.env.APPWRITE_WEB_ORIGINS = previous;
    }
  });

  it("reads browser headers without depending on their casing", () => {
    expect(
      getRequestHeader(
        { Origin: "https://wathaeqi.appwrite.network" },
        "origin"
      )
    ).toBe("https://wathaeqi.appwrite.network");
  });

  it("adds credentialed CORS and request-id exposure headers to a 502 response", () => {
    const response = new Response(JSON.stringify({ error: "failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json", Vary: "Accept-Encoding" },
    });
    applyCorsHeaders(
      response,
      new Headers({
        "Access-Control-Allow-Origin": "https://wathaeqi.appwrite.network",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Expose-Headers": "X-Request-Id",
        Vary: "Origin",
      })
    );
    expect(response.status).toBe(502);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://wathaeqi.appwrite.network"
    );
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true"
    );
    expect(response.headers.get("Access-Control-Expose-Headers")).toBe(
      "X-Request-Id"
    );
    expect(response.headers.get("Vary")).toBe("Accept-Encoding, Origin");
  });
});
