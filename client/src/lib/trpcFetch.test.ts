import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithCredentials, LOGIN_REQUEST_TIMEOUT_MS } from "./trpcFetch";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchWithCredentials", () => {
  it("includes the application session cookie on tRPC requests", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithCredentials("https://api.example.test/api/trpc/auth.me");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/trpc/auth.me",
      { credentials: "include" }
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

    const request = fetchWithCredentials(
      "https://api.example.test/api/trpc/auth.login?batch=1"
    );
    const rejection = expect(request).rejects.toMatchObject({
      name: "TimeoutError",
    });

    await vi.advanceTimersByTimeAsync(LOGIN_REQUEST_TIMEOUT_MS);
    await rejection;

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe("include");
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
