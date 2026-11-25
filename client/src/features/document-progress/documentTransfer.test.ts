import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSessionToken, setSessionToken } from "@/lib/sessionToken";
import { fetchDocumentBlob, resolveDocumentRequest } from "./documentTransfer";

describe("document transfer trust boundary", () => {
  beforeEach(() => {
    clearSessionToken();
    vi.stubGlobal("window", {
      location: {
        origin: "https://app.example",
        href: "https://app.example/documents",
      },
    });
    vi.stubGlobal("location", { href: "https://app.example/documents" });
    vi.stubEnv("VITE_APPWRITE_API_URL", "https://api.example");
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    clearSessionToken();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("maps relative API URLs to the Appwrite origin and sends only the current session", async () => {
    setSessionToken("synthetic-session");
    vi.mocked(fetch).mockResolvedValue(
      new Response("PDF", { headers: { "Content-Type": "application/pdf" } })
    );
    await fetchDocumentBlob("/api/documents/fixture/file", "fixture.pdf");
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("https://api.example/api/documents/fixture/file");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer synthetic-session"
    );
    expect(init).toMatchObject({
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
    });
  });
  it("never sends a session to signed storage URLs even if their path is /api", async () => {
    setSessionToken("synthetic-session");
    vi.mocked(fetch).mockResolvedValue(
      new Response("PDF", { headers: { "Content-Type": "application/pdf" } })
    );
    await fetchDocumentBlob(
      "https://storage.example/api/file?signature=synthetic",
      "fixture.pdf"
    );
    expect(
      new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).has(
        "Authorization"
      )
    ).toBe(false);
  });
  it.each([
    "javascript:alert(1)",
    "http://storage.example/file",
    "https://user:pass@api.example/api/file",
    "file:///private.pdf",
  ])("rejects unsafe input %s before fetching", async url => {
    await expect(fetchDocumentBlob(url, "fixture.pdf")).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects insecure API configuration but permits local development HTTP", () => {
    vi.stubEnv("VITE_APPWRITE_API_URL", "http://api.example");
    expect(() => resolveDocumentRequest("/api/file")).toThrow();
    vi.stubEnv("VITE_APPWRITE_API_URL", "http://localhost:3000");
    expect(resolveDocumentRequest("/api/file")).toMatchObject({
      authenticated: true,
    });
  });
  it.each([401, 403, 404, 502])(
    "rejects denied or unavailable files (%s) without a ready callback",
    async status => {
      vi.mocked(fetch).mockResolvedValue(
        new Response("private diagnostic", { status })
      );
      const progress = vi.fn();
      await expect(
        fetchDocumentBlob("/api/file", "fixture.pdf", { onProgress: progress })
      ).rejects.toThrow();
      expect(
        progress.mock.calls.some(([value]) => value.phase === "ready")
      ).toBe(false);
    }
  );
  it("reports actual streamed bytes when Content-Length is known", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("1234"));
        controller.enqueue(encoder.encode("567890"));
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(stream, {
        headers: { "Content-Type": "application/pdf", "Content-Length": "10" },
      })
    );
    const progress = vi.fn();
    expect(
      (
        await fetchDocumentBlob("/api/file", "fixture.pdf", {
          onProgress: progress,
        })
      ).size
    ).toBe(10);
    const transfer = progress.mock.calls
      .map(([value]) => value)
      .filter(value => value.phase === "transfer");
    expect(transfer.map(value => value.percent)).toEqual([0, 40, 100, 100]);
    expect(transfer[1]).toMatchObject({ loaded: 4, total: 10 });
  });
  it("does not invent byte totals for unknown or compressed responses", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("1234567890", {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": "4",
          "Content-Encoding": "gzip",
        },
      })
    );
    const progress = vi.fn();
    await fetchDocumentBlob("/api/file", "fixture.pdf", {
      onProgress: progress,
    });
    expect(
      progress.mock.calls
        .filter(([value]) => value.phase === "transfer")
        .every(([value]) => value.percent === undefined)
    ).toBe(true);
  });
  it("rejects truncated streams and reader failures", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("123", {
        headers: { "Content-Type": "application/pdf", "Content-Length": "10" },
      })
    );
    await expect(fetchDocumentBlob("/api/file", "fixture.pdf")).rejects.toThrow(
      "كاملاً"
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("private storage detail"));
          },
        }),
        { headers: { "Content-Type": "application/pdf" } }
      )
    );
    await expect(fetchDocumentBlob("/api/file", "fixture.pdf")).rejects.toThrow(
      "كاملاً"
    );
  });
  it("propagates cancellation and never returns a file after abort", async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockResolvedValue(
      new Response("12345", {
        headers: { "Content-Type": "application/pdf", "Content-Length": "5" },
      })
    );
    await expect(
      fetchDocumentBlob("/api/file", "fixture.pdf", {
        signal: controller.signal,
        onProgress: progress => {
          if (progress.phase === "transfer" && progress.loaded! > 0)
            controller.abort();
        },
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    vi.mocked(fetch).mockClear();
    await expect(
      fetchDocumentBlob("/api/file", "fixture.pdf", {
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
