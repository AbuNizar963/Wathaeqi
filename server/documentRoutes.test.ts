import { zipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerId = "550e8400-e29b-41d4-a716-446655440000";
const validDocx = Buffer.from(
  zipSync({
    "[Content_Types].xml": Buffer.from("<Types/>", "utf8"),
    "word/document.xml": Buffer.from("<document/>", "utf8"),
  })
);
const fileName = "report.docx";
function createMinimalPdf(): Buffer {
  const parts = ["%PDF-1.4\n"];
  const offsets = [0];
  const addObject = (value: string) => {
    offsets.push(Buffer.byteLength(parts.join("")));
    parts.push(value);
  };
  addObject("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  addObject("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  addObject(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>\nendobj\n"
  );
  addObject("4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n");
  const xrefOffset = Buffer.byteLength(parts.join(""));
  parts.push("xref\n0 5\n0000000000 65535 f \n");
  for (const offset of offsets.slice(1)) {
    parts.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  parts.push(
    `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );
  return Buffer.from(parts.join(""));
}

const pdfBytes = createMinimalPdf();
const pdfFileName = "report.pdf";
const pdfStorageKey = `documents/${ownerId}/550e8400-e29b-41d4-a716-446655440002-${pdfFileName}`;
const storageKey = `documents/${ownerId}/550e8400-e29b-41d4-a716-446655440001-${fileName}`;
const docxMimeType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  upload: vi.fn(),
  getObjectInfo: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  getOfficialDocument: vi.fn(),
  createOfficialDocument: vi.fn(),
  getUserOrganizationMembership: vi.fn(),
  renderDocxToPdf: vi.fn(),
}));

vi.mock("./ownerApiRouter", () => ({ ownerApiRouter: {} }));
vi.mock("./_core/context", () => ({ createContext: vi.fn() }));
vi.mock("./_core/static", () => ({ serveStatic: vi.fn() }));
vi.mock("./_core/appwriteAuth", () => ({
  getAppwriteAuthenticatedUserFromRequest: mocks.getUser,
}));
vi.mock("./_core/storageProvider", () => ({
  getStorageProvider: () => ({
    upload: mocks.upload,
    remove: mocks.remove,
    getObjectInfo: mocks.getObjectInfo,
    download: mocks.download,
  }),
}));
vi.mock("./features/document-studio/documentStudioRepository", () => ({
  createOfficialDocument: mocks.createOfficialDocument,
  getOfficialDocument: mocks.getOfficialDocument,
}));
vi.mock("./features/organizations/appwriteOwnerOrganizationRepository", () => ({
  getUserOrganizationMembership: mocks.getUserOrganizationMembership,
}));
vi.mock("./features/document-studio/docxPdfRenderer", async importOriginal => {
  const original =
    await importOriginal<
      typeof import("./features/document-studio/docxPdfRenderer")
    >();
  return {
    ...original,
    renderDocxToPdf: mocks.renderDocxToPdf,
  };
});
vi.mock("@trpc/server/adapters/express", () => ({
  createExpressMiddleware:
    () =>
    (_request: unknown, _response: unknown, next: (error?: Error) => void) =>
      next(),
}));

import { createApp } from "./app";

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
    throw new Error("Test server did not bind to a TCP port");
  }
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

function uploadRequest(
  baseUrl: string,
  body: Buffer,
  name = fileName,
  contentType = "application/octet-stream",
  headers: Record<string, string> = {}
) {
  return fetch(`${baseUrl}/api/documents/upload`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "x-file-name": encodeURIComponent(name),
      "x-document-metadata": Buffer.from(
        JSON.stringify({
          title: "تقرير مرفوع",
          category: "general",
          subject: "",
          documentDate: "2026-11-20T12:00:00.000Z",
          pageCount: 0,
        })
      ).toString("base64url"),
      ...headers,
    },
    body,
  });
}

function ownedDocument() {
  return {
    id: "document-1",
    file: {
      storageKey,
      fileName,
      mimeType: docxMimeType,
      sizeBytes: validDocx.length,
      pageCount: 0,
    },
  };
}

describe("authenticated document HTTP routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      id: 7,
      authUserId: ownerId,
      isActive: true,
    });
    mocks.upload.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);
    mocks.getUserOrganizationMembership.mockResolvedValue(null);
    mocks.createOfficialDocument.mockImplementation(
      async (_ownerId, input) => ({
        id: "created-document",
        ...input,
      })
    );
    mocks.getObjectInfo.mockResolvedValue({
      size: validDocx.length,
      contentType: docxMimeType,
    });
    mocks.download.mockResolvedValue({
      body: validDocx,
      contentType: docxMimeType,
    });
    mocks.getOfficialDocument.mockResolvedValue(ownedDocument());
    mocks.renderDocxToPdf.mockResolvedValue(Buffer.from("%PDF-1.7\nvalid PDF"));
  });

  it("rejects unauthenticated and cross-origin uploads before storage access", async () => {
    await withServer(async baseUrl => {
      mocks.getUser.mockResolvedValueOnce(null);
      const unauthorized = await uploadRequest(baseUrl, validDocx);
      expect(unauthorized.status).toBe(401);

      const crossOrigin = await uploadRequest(
        baseUrl,
        validDocx,
        fileName,
        "application/octet-stream",
        { Origin: "https://attacker.example" }
      );
      expect(crossOrigin.status).toBe(403);
      expect(mocks.upload).not.toHaveBeenCalled();
    });
  });

  it("rejects empty, oversized, wrong-content-type, and signature-mismatched uploads", async () => {
    await withServer(async baseUrl => {
      const empty = await uploadRequest(baseUrl, Buffer.alloc(0));
      expect(empty.status).toBe(400);

      const oversized = await uploadRequest(
        baseUrl,
        Buffer.alloc(25 * 1024 * 1024 + 1),
        fileName
      );
      expect(oversized.status).toBe(413);

      const wrongType = await uploadRequest(
        baseUrl,
        validDocx,
        fileName,
        "application/pdf"
      );
      expect(wrongType.status).toBe(415);

      const wrongSignature = await uploadRequest(
        baseUrl,
        Buffer.from("not really a PDF"),
        "report.pdf"
      );
      expect(wrongSignature.status).toBe(415);
      expect(mocks.upload).not.toHaveBeenCalled();
    });
  });

  it("accepts a valid upload, links it to a document, and never returns its storage key", async () => {
    await withServer(async baseUrl => {
      const response = await uploadRequest(baseUrl, validDocx);
      expect(response.status).toBe(201);
      const result = (await response.json()) as {
        id: string;
        file: Record<string, unknown>;
      };
      expect(result).toMatchObject({
        id: "created-document",
        file: {
          fileName,
          mimeType: docxMimeType,
          sizeBytes: validDocx.length,
        },
      });
      expect(result.file).not.toHaveProperty("storageKey");
      expect(mocks.upload).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^documents/${ownerId}/`)),
        validDocx,
        expect.objectContaining({ contentType: docxMimeType })
      );
      expect(mocks.createOfficialDocument).toHaveBeenCalledWith(
        ownerId,
        expect.objectContaining({
          title: "تقرير مرفوع",
          category: "general",
          file: expect.objectContaining({ storageKey: expect.any(String) }),
        }),
        expect.any(String)
      );
      expect(mocks.remove).not.toHaveBeenCalled();
    });
  });

  it("removes the uploaded object when linking it to a document fails", async () => {
    await withServer(async baseUrl => {
      mocks.createOfficialDocument.mockRejectedValueOnce(
        Object.assign(new Error("invalid document response"), { code: 400 })
      );
      const response = await uploadRequest(baseUrl, validDocx);
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain("database unavailable");
      expect(mocks.upload).toHaveBeenCalledOnce();
      expect(mocks.remove).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^documents/${ownerId}/`))
      );
    });
  });

  it("cleans a possibly stored object when the upload result is ambiguous", async () => {
    await withServer(async baseUrl => {
      mocks.upload.mockRejectedValueOnce(new Error("upload response lost"));

      const response = await uploadRequest(baseUrl, validDocx);

      expect(response.status).toBe(502);
      expect(mocks.upload).toHaveBeenCalledOnce();
      expect(mocks.createOfficialDocument).not.toHaveBeenCalled();
      expect(mocks.remove).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^documents/${ownerId}/`))
      );
    });
  });

  it("recovers a document whose create response was lost without deleting its file", async () => {
    await withServer(async baseUrl => {
      mocks.createOfficialDocument.mockRejectedValueOnce(
        new Error("response lost after commit")
      );
      mocks.getOfficialDocument.mockImplementationOnce(
        async (_ownerId, id) => ({
          id,
          title: "Recovered document",
          category: "general",
          file: {
            storageKey: mocks.upload.mock.calls[0]?.[0] as string,
            fileName,
            mimeType: docxMimeType,
            sizeBytes: validDocx.length,
            pageCount: 0,
          },
        })
      );

      const response = await uploadRequest(baseUrl, validDocx);
      expect(response.status).toBe(201);
      const result = (await response.json()) as {
        id: string;
        file: Record<string, unknown>;
      };
      expect(result.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(result.file).not.toHaveProperty("storageKey");
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.getOfficialDocument).toHaveBeenCalledWith(
        ownerId,
        result.id
      );
    });
  });

  it("retains an uploaded file when a server error leaves record creation uncertain", async () => {
    await withServer(async baseUrl => {
      mocks.createOfficialDocument.mockRejectedValueOnce(
        Object.assign(new Error("database response uncertain"), { code: 503 })
      );
      mocks.getOfficialDocument.mockResolvedValueOnce(null);

      const response = await uploadRequest(baseUrl, validDocx);

      expect(response.status).toBe(502);
      expect(mocks.upload).toHaveBeenCalledOnce();
      expect(mocks.getOfficialDocument).toHaveBeenCalledOnce();
      expect(mocks.remove).not.toHaveBeenCalled();
    });
  });

  it("accepts a PDF upload after checking its signature", async () => {
    await withServer(async baseUrl => {
      const response = await uploadRequest(baseUrl, pdfBytes, pdfFileName);
      expect(response.status).toBe(201);
      const result = (await response.json()) as {
        id: string;
        file: Record<string, unknown>;
      };
      expect(result).toMatchObject({
        id: "created-document",
        file: {
          fileName: pdfFileName,
          mimeType: "application/pdf",
          sizeBytes: pdfBytes.length,
        },
      });
      expect(result.file).not.toHaveProperty("storageKey");
      expect(mocks.upload).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^documents/${ownerId}/`)),
        pdfBytes,
        expect.objectContaining({ contentType: "application/pdf" })
      );
    });
  });

  it("does not route DOCX through the legacy PDF endpoint", async () => {
    await withServer(async baseUrl => {
      mocks.getOfficialDocument.mockResolvedValueOnce(null);
      const notOwned = await fetch(
        `${baseUrl}/api/documents/document-other/print-pdf`,
        { method: "POST" }
      );
      expect(notOwned.status).toBe(404);

      const response = await fetch(
        `${baseUrl}/api/documents/document-1/print-pdf`,
        { method: "POST" }
      );
      expect(response.status).toBe(415);
      expect(await response.text()).toContain("معاينة DOCX");
      expect(mocks.download).not.toHaveBeenCalled();
      expect(mocks.renderDocxToPdf).not.toHaveBeenCalled();
    });
  });

  it("returns an owned, signature-verified uploaded PDF without re-rendering it", async () => {
    await withServer(async baseUrl => {
      mocks.getOfficialDocument.mockResolvedValueOnce({
        id: "document-pdf",
        file: {
          storageKey: pdfStorageKey,
          fileName: pdfFileName,
          mimeType: "application/pdf",
          sizeBytes: pdfBytes.length,
          pageCount: 1,
        },
      });
      mocks.getObjectInfo.mockResolvedValueOnce({
        size: pdfBytes.length,
        contentType: "application/pdf",
      });
      mocks.download.mockResolvedValueOnce({
        body: pdfBytes,
        contentType: "application/pdf",
      });

      const response = await fetch(
        `${baseUrl}/api/documents/document-pdf/print-pdf`,
        { method: "POST" }
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(Buffer.from(await response.arrayBuffer())).toEqual(pdfBytes);
      expect(mocks.getOfficialDocument).toHaveBeenLastCalledWith(
        ownerId,
        "document-pdf"
      );
      expect(mocks.download).toHaveBeenCalledWith(pdfStorageKey);
      expect(mocks.renderDocxToPdf).not.toHaveBeenCalled();
    });
  });

  it("rejects a stored PDF whose storage MIME or signature does not match", async () => {
    await withServer(async baseUrl => {
      mocks.getOfficialDocument.mockResolvedValue({
        id: "document-pdf",
        file: {
          storageKey: pdfStorageKey,
          fileName: pdfFileName,
          mimeType: "application/pdf",
          sizeBytes: pdfBytes.length,
          pageCount: 1,
        },
      });
      mocks.getObjectInfo.mockResolvedValue({
        size: pdfBytes.length,
        contentType: "application/pdf",
      });
      mocks.getObjectInfo.mockResolvedValueOnce({
        size: pdfBytes.length,
        contentType: "application/octet-stream",
      });
      const mismatch = await fetch(
        `${baseUrl}/api/documents/document-pdf/print-pdf`,
        { method: "POST" }
      );
      expect(mismatch.status).toBe(409);

      mocks.getObjectInfo.mockResolvedValueOnce({
        size: pdfBytes.length,
        contentType: "application/pdf",
      });
      mocks.download.mockResolvedValueOnce({
        body: Buffer.from("not a PDF"),
        contentType: "application/pdf",
      });
      const corrupt = await fetch(
        `${baseUrl}/api/documents/document-pdf/print-pdf`,
        { method: "POST" }
      );
      expect(corrupt.status).toBe(415);
      expect(mocks.renderDocxToPdf).not.toHaveBeenCalled();
    });
  });

  it("rejects DOCX from the legacy PDF endpoint", async () => {
    await withServer(async baseUrl => {
      mocks.download.mockResolvedValueOnce({
        body: Buffer.from("bad zip"),
        contentType: "application/octet-stream",
      });
      const corrupt = await fetch(
        `${baseUrl}/api/documents/document-1/print-pdf`,
        { method: "POST" }
      );
      expect(corrupt.status).toBe(415);
      expect(mocks.renderDocxToPdf).not.toHaveBeenCalled();

      const failed = await fetch(
        `${baseUrl}/api/documents/document-1/print-pdf`,
        { method: "POST" }
      );
      expect(failed.status).toBe(415);
      expect(await failed.text()).toContain("معاينة DOCX");
      expect(mocks.renderDocxToPdf).not.toHaveBeenCalled();
    });
  });
});
