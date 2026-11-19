import { describe, expect, it, vi } from "vitest";

vi.mock("./ownerApiRouter", () => ({ ownerApiRouter: {} }));
vi.mock("./_core/context", () => ({ createContext: vi.fn() }));
vi.mock("./_core/static", () => ({ serveStatic: vi.fn() }));
vi.mock("@trpc/server/adapters/express", () => ({
  createExpressMiddleware:
    () =>
    (_request: unknown, _response: unknown, next: (error?: Error) => void) =>
      next(),
}));

import { createApp } from "./app";

describe("retired Telegram verification endpoint", () => {
  it("does not expose the legacy Supabase-backed verification route", async () => {
    const server = createApp().listen(0);
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      await new Promise<void>(resolve => server.close(() => resolve()));
      throw new Error("Test server did not bind to a TCP port");
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/verify/00000000-0000-4000-8000-000000000001`
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("x-powered-by")).toBeNull();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
    }
  });
});
