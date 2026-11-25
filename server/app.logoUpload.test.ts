import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  resolveOrganizationScope: vi.fn(),
  saveOrganizationLogo: vi.fn(),
  getOrganizationLogoUrl: vi.fn(),
}));

vi.mock("./ownerApiRouter", () => ({ ownerApiRouter: {} }));
vi.mock("./_core/context", () => ({ createContext: vi.fn() }));
vi.mock("./_core/static", () => ({ serveStatic: vi.fn() }));
vi.mock("./_core/appwriteAuth", () => ({
  getAppwriteAuthenticatedUserFromRequest: mocks.getUser,
}));
vi.mock("./features/organizations/organizationAccess", () => ({
  resolveOrganizationScope: mocks.resolveOrganizationScope,
}));
vi.mock("./features/organizations/organizationService", () => ({
  getOrganizationLogoUrl: mocks.getOrganizationLogoUrl,
  saveOrganizationLogo: mocks.saveOrganizationLogo,
}));
vi.mock("@trpc/server/adapters/express", () => ({
  createExpressMiddleware:
    () =>
    (_request: unknown, _response: unknown, next: (error?: Error) => void) =>
      next(),
}));

import { createApp } from "./app";

const organizationId = "550e8400-e29b-41d4-a716-446655440000";
function minimalPngHeader(width = 2400, height = 1600): Buffer {
  const bytes = Buffer.alloc(58);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  bytes.writeUInt32BE(0, 29);
  bytes.writeUInt32BE(1, 33);
  bytes.write("IDAT", 37, "ascii");
  bytes[41] = 0;
  bytes.writeUInt32BE(0, 42);
  bytes.writeUInt32BE(0, 46);
  bytes.write("IEND", 50, "ascii");
  bytes.writeUInt32BE(0, 54);
  return bytes;
}

async function withServer<T>(
  callback: (baseUrl: string) => Promise<T>
): Promise<T> {
  const server = createApp().listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>(resolve => server.close(() => resolve()));
    throw new Error("Test API did not bind to TCP");
  }
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  }
}

async function sendLogo(baseUrl: string, origin: string): Promise<Response> {
  return fetch(`${baseUrl}/api/storage/department-logo`, {
    method: "PUT",
    headers: {
      Origin: origin,
      Authorization: "Bearer local-test-token",
      "Content-Type": "image/png",
      "X-Organization-Id": organizationId,
      "X-File-Name": "fixture.png",
    },
    body: minimalPngHeader(),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APPWRITE_WEB_ORIGINS", "https://wathaeqi.appwrite.network");
  mocks.getUser.mockResolvedValue({
    id: 7,
    authUserId: "local-test-auth-user",
    isActive: true,
  });
  mocks.resolveOrganizationScope.mockResolvedValue({
    organizationId,
    canAdministrate: true,
  });
  mocks.saveOrganizationLogo.mockResolvedValue(
    `organizations/${organizationId}/logo-test.png`
  );
  mocks.getOrganizationLogoUrl.mockResolvedValue(
    "https://storage.invalid/signed-fixture"
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("raw organization-logo upload origin protection", () => {
  it("accepts the explicitly configured APPWRITE_WEB_ORIGINS origin and reaches authorized storage", async () => {
    await withServer(async baseUrl => {
      const response = await sendLogo(
        baseUrl,
        "https://wathaeqi.appwrite.network"
      );
      expect(response.status).toBe(200);
      expect(mocks.getUser).toHaveBeenCalledOnce();
      expect(mocks.resolveOrganizationScope).toHaveBeenCalledOnce();
      expect(mocks.saveOrganizationLogo).toHaveBeenCalledWith(
        organizationId,
        expect.any(Buffer),
        "image/png",
        expect.any(Function)
      );
    });
  });

  it("rejects an arbitrary origin before authentication or storage side effects", async () => {
    await withServer(async baseUrl => {
      const response = await sendLogo(baseUrl, "https://attacker.invalid");
      expect(response.status).toBe(403);
      expect(mocks.getUser).not.toHaveBeenCalled();
      expect(mocks.resolveOrganizationScope).not.toHaveBeenCalled();
      expect(mocks.saveOrganizationLogo).not.toHaveBeenCalled();
    });
  });

  it("keeps authenticated organization administration authorization mandatory for an allowed origin", async () => {
    mocks.resolveOrganizationScope.mockResolvedValueOnce({
      organizationId,
      canAdministrate: false,
    });
    await withServer(async baseUrl => {
      const response = await sendLogo(
        baseUrl,
        "https://wathaeqi.appwrite.network"
      );
      expect(response.status).toBe(403);
      expect(mocks.getUser).toHaveBeenCalledOnce();
      expect(mocks.saveOrganizationLogo).not.toHaveBeenCalled();
    });
  });
});
