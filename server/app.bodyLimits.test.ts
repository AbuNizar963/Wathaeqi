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
import { ENV } from "./_core/env";

async function getHealth(): Promise<{ status: number; body: unknown }> {
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
      `http://127.0.0.1:${address.port}/api/health`
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

describe("Appwrite owner application", () => {
  it(
    "reports Appwrite as the active authentication and database provider",
    async () => {
    const response = await getHealth();
    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        ok: true,
        service: "wathaeqi-owner-api",
        auth: "appwrite-auth",
        database: "appwrite",
      })
    );
    }
  );

  it(
    "keeps the retired Telegram routes outside the owner API",
    async () => {
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
        `http://127.0.0.1:${address.port}/api/trpc/telegrams.list`
      );
      expect(response.status).toBe(404);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
    }
    }
  );

  it("configures one trusted proxy hop only in production", () => {
    expect(createApp().get("trust proxy")).toBe(ENV.isProduction ? 1 : false);
  });
});
