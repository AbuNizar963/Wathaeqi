import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSessionToken, setSessionToken } from "./sessionToken";
import { fetchWithSession, LOGIN_REQUEST_TIMEOUT_MS } from "./trpcFetch";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearSessionToken();
});

describe("fetchWithSession", () => {
  it("omits cookies from unauthenticated API requests", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithSession("https://api.example.test/api/trpc/auth.me");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/trpc/auth.me",
      { headers: new Headers(), credentials: "omit" }
    );
  });

  it("sends the tab session as a Bearer token, never as a cookie", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    setSessionToken("signed-session-token");

    await fetchWithSession("https://api.example.test/api/trpc/auth.me");

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.credentials).toBe("omit");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer signed-session-token"
    );
  });

  it("aborts and reports a login request that exceeds its timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true }
          );
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = fetchWithSession(
      "https://api.example.test/api/trpc/auth.login?batch=1"
    );
    const rejection = expect(request).rejects.toMatchObject({
      name: "TimeoutError",
    });

    await vi.advanceTimersByTimeAsync(LOGIN_REQUEST_TIMEOUT_MS);
    await rejection;

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe("omit");
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
