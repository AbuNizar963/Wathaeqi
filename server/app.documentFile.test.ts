import { zipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeOfficialDocumentStorageContent } from "../shared/documentStudio";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getProfile: vi.fn(),
  getRow: vi.fn(),
  listRows: vi.fn(),
  getObjectInfo: vi.fn(),
  download: vi.fn(),
}));

vi.mock("./ownerApiRouter", () => ({ ownerApiRouter: {} }));
vi.mock("./_core/context", () => ({ createContext: vi.fn() }));
vi.mock("./_core/static", () => ({ serveStatic: vi.fn() }));
vi.mock("./_core/appwriteAuth", () => ({
  getAppwriteAuthenticatedUserFromRequest: mocks.getUser,
  getAppwriteProfileById: mocks.getProfile,
}));
vi.mock("./_core/appwrite", () => ({
  getAppwriteDatabaseId: () => "fake-database",
  getAppwriteTablesDB: () => ({
    getRow: mocks.getRow,
    listRows: mocks.listRows,
  }),
}));
vi.mock("./_core/storageProvider", () => ({
  getStorageProvider: () => ({
    getObjectInfo: mocks.getObjectInfo,
    download: mocks.download,
  }),
}));
vi.mock("./features/organizations/organizationService", () => ({
  getOrganizationLogoUrl: vi.fn(),
  saveOrganizationLogo: vi.fn(),
}));
vi.mock("@trpc/server/adapters/express", () => ({
  createExpressMiddleware:
    () =>
    (_request: unknown, _response: unknown, next: (error?: Error) => void) =>
      next(),
}));

import { createApp } from "./app";
import appwriteMain from "../appwrite/functions/wathaeqi-api/src/main";
import { createNetlifyApi } from "../netlify/functions/api.mts";

const netlifyApi = createNetlifyApi(async () => createApp());

const ownerId = "550e8400-e29b-41d4-a716-446655440000";
const otherOwnerId = "550e8400-e29b-41d4-a716-446655440003";
const nonce = "550e8400-e29b-41d4-a716-446655440001";
const docxMime =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const docx = Buffer.from(
  zipSync({
    "[Content_Types].xml": Buffer.from("<Types/>"),
    "word/document.xml": Buffer.from("<document/>"),
  })
);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64"
);
const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDACgcHiMeGSgjISMtKygwPGRBPDc3PHtYXUlkkYCZlo+AjIqgtObDoKrarYqMyP/L2u71////m8H////6/+b9//j/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAABf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AFf/Z",
  "base64"
);
const webp = Buffer.from(
  "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=",
  "base64"
);

function minimalPdf(): Buffer {
  const parts = ["%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"];
  const offsets = [0];
  const add = (value: string) => {
    offsets.push(Buffer.byteLength(parts.join(""), "latin1"));
    parts.push(value);
  };
  add("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  add("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  add(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>\nendobj\n"
  );
  add("4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n");
  const xref = Buffer.byteLength(parts.join(""), "latin1");
  parts.push("xref\n0 5\n0000000000 65535 f \n");
  for (const offset of offsets.slice(1)) {
    parts.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  parts.push(`trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.from(parts.join(""), "latin1");
}
const pdf = minimalPdf();

type TestFile = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
};

function file(fileName: string, mimeType: string, bytes: Buffer): TestFile {
  return {
    storageKey: `documents/${ownerId}/${nonce}-${fileName}`,
    fileName,
    mimeType,
    sizeBytes: bytes.length,
    pageCount: 0,
  };
}

function documentRow(
  testFile: TestFile | null,
  organizationId: string | null = "org-a",
  rowOwnerId = ownerId
) {
  return {
    $id: "document-1",
    ownerId: rowOwnerId,
    title: "test",
    category: "general",
    content: encodeOfficialDocumentStorageContent({
      content: { type: "doc" },
      organizationId,
      templateFieldsSnapshot: [],
      subject: "",
      fieldValues: {},
      serialNumber: 0,
      serialCode: "",
      documentDate: "2026-01-01T00:00:00.000Z",
      status: "draft",
      file: testFile,
      templateId: null,
      templateRevision: null,
      issuedAt: null,
      archivedAt: null,
    }),
  };
}

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createApp().listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  }
}

const requestFile = (baseUrl: string, id = "document-1") =>
  fetch(`${baseUrl}/api/documents/${id}/file`, { redirect: "manual" });

function assertPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("location")).toBeNull();
}

describe("document original file endpoint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({
      id: 7,
      authUserId: ownerId,
      isActive: true,
    });
    mocks.getProfile.mockResolvedValue({ user: { organizationId: "org-a" } });
    mocks.getRow.mockResolvedValue(
      documentRow(file("report.docx", docxMime, docx))
    );
    mocks.listRows.mockImplementation(async ({ tableId, queries }) => {
      const equalQueries = queries
        .map((query: string) => JSON.parse(query))
        .filter((query: { method: string }) => query.method === "equal");
      const value = (attribute: string) =>
        equalQueries.find(
          (query: { attribute: string }) => query.attribute === attribute
        )?.values[0];
      if (tableId === "organization_memberships") {
        return {
          rows:
            value("userId") === 7 && value("isActive") === true
              ? [
                  {
                    $id: "membership-a",
                    organizationId: "org-a",
                    userId: 7,
                    isActive: true,
                    role: "member",
                    createdAt: "2026-01-01",
                    updatedAt: "2026-01-01",
                  },
                ]
              : [],
        };
      }
      if (tableId === "organizations") {
        return {
          rows:
            value("id") === "org-a" && value("isActive") === true
              ? [
                  {
                    $id: "org-row-a",
                    id: "org-a",
                    isActive: true,
                    createdAt: "2026-01-01",
                    updatedAt: "2026-01-01",
                  },
                ]
              : [],
        };
      }
      throw new Error(`unexpected table: ${tableId}`);
    });
    // The storage provider can report a generic MIME: content is verified from bytes.
    mocks.getObjectInfo.mockResolvedValue({
      size: docx.length,
      contentType: "application/octet-stream",
    });
    mocks.download.mockResolvedValue({
      body: docx,
      contentType: "application/octet-stream",
    });
  });

  it("rejects missing, inactive, or unverifiable sessions before database or storage access", async () => {
    await withServer(async baseUrl => {
      mocks.getUser
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 7, authUserId: ownerId, isActive: false })
        .mockRejectedValueOnce(new Error("private session detail"));
      for (let i = 0; i < 3; i++) {
        const response = await requestFile(baseUrl);
        expect(response.status).toBe(401);
        assertPrivate(response);
        expect(await response.text()).not.toContain("private session detail");
      }
      expect(mocks.getRow).not.toHaveBeenCalled();
      expect(mocks.getObjectInfo).not.toHaveBeenCalled();
    });
  });

  it("rejects another owner in the same organization and another organization", async () => {
    await withServer(async baseUrl => {
      mocks.getUser.mockResolvedValue({
        id: 8,
        authUserId: otherOwnerId,
        isActive: true,
      });
      mocks.getProfile.mockResolvedValue({ user: { organizationId: "org-a" } });
      const sameOrg = await requestFile(baseUrl);
      expect(sameOrg.status).toBe(404);
      assertPrivate(sameOrg);
      mocks.getProfile.mockResolvedValue({ user: { organizationId: "org-b" } });
      const otherOrg = await requestFile(baseUrl);
      expect(otherOrg.status).toBe(404);
      assertPrivate(otherOrg);
      expect(mocks.getRow).toHaveBeenCalledTimes(2);
      expect(mocks.getObjectInfo).not.toHaveBeenCalled();
      expect(mocks.listRows).not.toHaveBeenCalled();
    });
  });

  it("rejects an owner's document from a different organization or without an active membership and organization", async () => {
    await withServer(async baseUrl => {
      mocks.getRow.mockResolvedValueOnce(
        documentRow(file("report.docx", docxMime, docx), "org-b")
      );
      expect((await requestFile(baseUrl)).status).toBe(404);
      mocks.listRows.mockResolvedValueOnce({ rows: [] });
      expect((await requestFile(baseUrl)).status).toBe(404);
      mocks.listRows
        .mockResolvedValueOnce({
          rows: [
            {
              $id: "membership-a",
              organizationId: "org-a",
              userId: 7,
              role: "member",
              isActive: true,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });
      expect((await requestFile(baseUrl)).status).toBe(404);
      expect(mocks.getObjectInfo).not.toHaveBeenCalled();
    });
  });

  it("keeps owner-only personal documents accessible when no organization was recorded", async () => {
    await withServer(async baseUrl => {
      mocks.getRow.mockResolvedValueOnce(
        documentRow(file("report.docx", docxMime, docx), null)
      );
      const response = await requestFile(baseUrl);
      expect(response.status).toBe(200);
      assertPrivate(response);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(docx);
      expect(mocks.listRows).not.toHaveBeenCalled();
    });
  });

  it.each([
    ["report.pdf", "application/pdf", pdf],
    ["report.docx", docxMime, docx],
    ["scan.png", "image/png", png],
    ["scan.jpg", "image/jpeg", jpeg],
    ["scan.webp", "image/webp", webp],
  ])(
    "preserves %s bytes through the Appwrite function wrapper",
    async (name, mimeType, bytes) => {
      mocks.getRow.mockResolvedValueOnce(
        documentRow(file(name, mimeType, bytes))
      );
      mocks.getObjectInfo.mockResolvedValueOnce({
        size: bytes.length,
        contentType: "application/octet-stream",
      });
      mocks.download.mockResolvedValueOnce({
        body: bytes,
        contentType: "application/octet-stream",
      });
      const path = "/api/documents/document-1/file";
      const response = (await appwriteMain({
        req: {
          method: "GET",
          url: `https://api.example.test${path}`,
          path,
          headers: {},
        },
        res: { json: vi.fn() },
        log: vi.fn(),
        error: vi.fn(),
      })) as Response;
      expect(response.status).toBe(200);
      assertPrivate(response);
      expect(response.headers.get("content-type")).toBe(mimeType);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    }
  );

  it.each([
    ["report.pdf", "application/pdf", pdf],
    ["report.docx", docxMime, docx],
    ["scan.png", "image/png", png],
    ["scan.jpg", "image/jpeg", jpeg],
    ["scan.webp", "image/webp", webp],
  ])(
    "preserves %s bytes through the Netlify function wrapper",
    async (name, mimeType, bytes) => {
      mocks.getRow.mockResolvedValueOnce(
        documentRow(file(name, mimeType, bytes))
      );
      mocks.getObjectInfo.mockResolvedValueOnce({
        size: bytes.length,
        contentType: "application/octet-stream",
      });
      mocks.download.mockResolvedValueOnce({
        body: bytes,
        contentType: "application/octet-stream",
      });
      const response = await netlifyApi(
        new Request("https://api.example.test/api/documents/document-1/file")
      );
      expect(response.status).toBe(200);
      assertPrivate(response);
      expect(response.headers.get("content-type")).toBe(mimeType);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    }
  );

  it("preserves private JSON denials through both function wrappers", async () => {
    mocks.getUser.mockResolvedValue(null);
    const path = "/api/documents/document-1/file";
    const appwriteResponse = (await appwriteMain({
      req: {
        method: "GET",
        url: `https://api.example.test${path}`,
        path,
        headers: {},
      },
      res: { json: vi.fn() },
      log: vi.fn(),
      error: vi.fn(),
    })) as Response;
    const netlifyResponse = await netlifyApi(
      new Request(`https://api.example.test${path}`)
    );
    for (const response of [appwriteResponse, netlifyResponse]) {
      expect(response.status).toBe(401);
      assertPrivate(response);
      expect(await response.json()).toEqual({
        error: "انتهت الجلسة؛ سجّل الدخول مجددًا",
      });
    }
  });

  it("rate-limits repeated downloads without caching the denial", async () => {
    await withServer(async baseUrl => {
      for (let i = 0; i < 30; i++)
        expect((await requestFile(baseUrl)).status).toBe(200);
      const response = await requestFile(baseUrl);
      expect(response.status).toBe(429);
      assertPrivate(response);
      expect(mocks.download).toHaveBeenCalledTimes(30);
    });
  });

  it("fails closed on missing rows, missing files, and repository errors", async () => {
    await withServer(async baseUrl => {
      mocks.getRow.mockRejectedValueOnce(
        Object.assign(new Error("missing row"), { code: 404 })
      );
      const missing = await requestFile(baseUrl);
      expect(missing.status).toBe(404);
      assertPrivate(missing);
      mocks.getRow.mockResolvedValueOnce(documentRow(null));
      const noFile = await requestFile(baseUrl);
      expect(noFile.status).toBe(404);
      mocks.getRow.mockRejectedValueOnce(new Error("private database detail"));
      const error = await requestFile(baseUrl);
      expect(error.status).toBe(502);
      expect(await error.text()).not.toContain("private database detail");
      mocks.listRows.mockRejectedValueOnce(
        new Error("private membership detail")
      );
      const membershipError = await requestFile(baseUrl);
      expect(membershipError.status).toBe(502);
      expect(await membershipError.text()).not.toContain(
        "private membership detail"
      );
      expect(mocks.getObjectInfo).not.toHaveBeenCalled();
    });
  });

  it.each([
    ["report.PDF", "application/pdf", pdf],
    ["report.docx", docxMime, docx],
    ["scan.png", "image/png", png],
    ["scan.jpg", "image/jpeg", jpeg],
    ["scan.jpeg", "image/jpeg", jpeg],
    ["scan.webp", "image/webp", webp],
    ["وثيقة..pdf", "application/pdf", pdf],
  ])(
    "returns exact bytes and safe headers for %s",
    async (name, mimeType, bytes) => {
      await withServer(async baseUrl => {
        const uploadedFile = file(name, mimeType, bytes);
        mocks.getRow.mockResolvedValueOnce(documentRow(uploadedFile));
        mocks.getObjectInfo.mockResolvedValueOnce({
          size: bytes.length,
          contentType: "application/octet-stream",
        });
        mocks.download.mockResolvedValueOnce({
          body: bytes,
          contentType: "application/octet-stream",
        });
        const response = await requestFile(baseUrl);
        expect(response.status).toBe(200);
        assertPrivate(response);
        expect(response.headers.get("content-type")).toBe(mimeType);
        expect(response.headers.get("content-length")).toBe(
          String(bytes.length)
        );
        expect(response.headers.get("content-disposition")).toBe("attachment");
        expect([...response.headers.values()].join(" ")).not.toContain(
          uploadedFile.storageKey
        );
        expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
        expect(mocks.getObjectInfo).toHaveBeenCalledWith(
          uploadedFile.storageKey
        );
        expect(mocks.download).toHaveBeenCalledWith(uploadedFile.storageKey);
      });
    }
  );

  it("rejects malformed ids and unsafe file metadata before storage access", async () => {
    await withServer(async baseUrl => {
      expect((await requestFile(baseUrl, "bad%20id")).status).toBe(400);
      const original = file("report.docx", docxMime, docx);
      for (const invalid of [
        {
          ...original,
          storageKey: original.storageKey.replace(ownerId, otherOwnerId),
        },
        { ...original, storageKey: `documents/${ownerId}/../report.docx` },
        {
          ...original,
          storageKey: original.storageKey.replace("report.docx", "other.docx"),
        },
        { ...original, fileName: "report.svg", mimeType: "image/svg+xml" },
        { ...original, mimeType: "application/pdf" },
        { ...original, sizeBytes: 25 * 1024 * 1024 + 1 },
      ]) {
        mocks.getRow.mockResolvedValueOnce(documentRow(invalid));
        const response = await requestFile(baseUrl);
        expect(response.status).toBe(415);
        assertPrivate(response);
        expect(await response.text()).not.toContain(invalid.storageKey);
      }
      expect(mocks.getObjectInfo).not.toHaveBeenCalled();
    });
  });

  it("rejects missing storage objects, storage failures, incorrect sizes and corrupt bytes without leaking details", async () => {
    await withServer(async baseUrl => {
      mocks.getObjectInfo.mockRejectedValueOnce(
        Object.assign(new Error("private object key"), { code: 404 })
      );
      let response = await requestFile(baseUrl);
      expect(response.status).toBe(502);
      assertPrivate(response);
      expect(await response.text()).not.toContain("private object key");
      mocks.getObjectInfo.mockResolvedValueOnce({
        size: docx.length + 1,
        contentType: docxMime,
      });
      response = await requestFile(baseUrl);
      expect(response.status).toBe(409);
      expect(mocks.download).not.toHaveBeenCalled();
      mocks.download.mockRejectedValueOnce(
        new Error("private download detail")
      );
      response = await requestFile(baseUrl);
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain("private download detail");
      mocks.download.mockResolvedValueOnce({
        body: Buffer.alloc(docx.length),
        contentType: docxMime,
      });
      response = await requestFile(baseUrl);
      expect(response.status).toBe(415);
      assertPrivate(response);
    });
  });
});
