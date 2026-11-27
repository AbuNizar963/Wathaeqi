import { describe, expect, it } from "vitest";
import {
  applyCorsHeaders,
  getRequestHeader,
} from "../appwrite/functions/wathaeqi-api/src/main";

describe("Appwrite function CORS response headers", () => {
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
