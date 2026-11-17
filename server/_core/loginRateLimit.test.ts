import { afterEach, describe, expect, it, vi } from "vitest";

const loadRateLimiter = async () => {
  vi.resetModules();
  vi.stubEnv(
    "AUTH_SESSION_SECRET",
    "test-only-session-secret-with-more-than-32-chars"
  );
  return import("./loginRateLimit");
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Appwrite login rate limiter", () => {
  it("blocks the eleventh attempt for the same account and IP", async () => {
    const { enforceLoginRateLimit } = await loadRateLimiter();
    const req = {
      ip: "192.0.2.10",
      socket: { remoteAddress: "192.0.2.10" },
    } as never;
    const res = { setHeader: vi.fn() } as never;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        enforceLoginRateLimit(req, res, "AbuNizar")
      ).resolves.toBeTypeOf("string");
    }

    await expect(
      enforceLoginRateLimit(req, res, "AbuNizar")
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "900");
  });

  it("clears the account/IP bucket after successful authentication", async () => {
    const { clearSuccessfulLoginRateLimit, enforceLoginRateLimit } =
      await loadRateLimiter();
    const req = {
      ip: "192.0.2.11",
      socket: { remoteAddress: "192.0.2.11" },
    } as never;
    const res = { setHeader: vi.fn() } as never;

    let key = "";
    for (let attempt = 0; attempt < 10; attempt += 1) {
      key = await enforceLoginRateLimit(req, res, "AbuNizar");
    }
    await clearSuccessfulLoginRateLimit(key);

    await expect(
      enforceLoginRateLimit(req, res, "AbuNizar")
    ).resolves.toBe(key);
  });

  it("enforces the per-IP ceiling across different account names", async () => {
    const { enforceLoginRateLimit } = await loadRateLimiter();
    const req = {
      ip: "192.0.2.12",
      socket: { remoteAddress: "192.0.2.12" },
    } as never;
    const res = { setHeader: vi.fn() } as never;

    for (let attempt = 0; attempt < 60; attempt += 1) {
      await expect(
        enforceLoginRateLimit(req, res, `user-${attempt}`)
      ).resolves.toBeTypeOf("string");
    }

    await expect(
      enforceLoginRateLimit(req, res, "another-user")
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
