import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import {
  DOCX_MIME_TYPE,
  MAX_DOCUMENT_UPLOAD_BYTES,
  getAllowedDocumentMimeType,
  isValidDocumentFile,
  isSafeDocumentStorageKey,
} from "./documentUploadValidation";

const validDocx = Buffer.from(
  zipSync({
    "[Content_Types].xml": Buffer.from("<Types/>", "utf8"),
    "word/document.xml": Buffer.from("<document/>", "utf8"),
  })
);

const ownerId = "550e8400-e29b-41d4-a716-446655440000";
const fileName = "report.docx";
const storageKey = `documents/${ownerId}/550e8400-e29b-41d4-a716-446655440001-${fileName}`;

const validPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64"
);
const validJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDACgcHiMeGSgjISMtKygwPGRBPDc3PHtYXUlkkYCZlo+AjIqgtObDoKrarYqMyP/L2u71////m8H////6/+b9//j/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAABf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AFf/Z",
  "base64"
);
const validWebp = Buffer.from(
  "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=",
  "base64"
);

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

const validPdf = createMinimalPdf();

describe("document upload validation", () => {
  it("maps only allowlisted extensions to canonical MIME types", () => {
    expect(getAllowedDocumentMimeType("archive.DOCX")).toBe(DOCX_MIME_TYPE);
    expect(getAllowedDocumentMimeType("scan.webp")).toBe("image/webp");
    expect(getAllowedDocumentMimeType("payload.svg")).toBeNull();
  });

  it("accepts a structurally valid DOCX package, not an arbitrary ZIP", async () => {
    expect(await isValidDocumentFile(validDocx, "report.docx")).toBe(true);
    expect(
      await isValidDocumentFile(
        Buffer.from("PK\\x03\\x04 not a document"),
        "fake.docx"
      )
    ).toBe(false);
    expect(await isValidDocumentFile(validPdf, "fake.docx")).toBe(false);
  });

  it("parses PDFs and rejects files that only copy the PDF header", async () => {
    expect(await isValidDocumentFile(validPdf, "scan.pdf")).toBe(true);
    expect(
      await isValidDocumentFile(Buffer.from("%PDF-1.7\\nnot a PDF"), "scan.pdf")
    ).toBe(false);
  });

  it("checks bounded image framing and rejects signature-only data", async () => {
    expect(await isValidDocumentFile(validPng, "scan.png")).toBe(true);
    expect(await isValidDocumentFile(validJpeg, "scan.jpg")).toBe(true);
    expect(await isValidDocumentFile(validWebp, "scan.webp")).toBe(true);
    expect(
      await isValidDocumentFile(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        "fake.png"
      )
    ).toBe(false);
    expect(
      await isValidDocumentFile(Buffer.from("RIFF0000WEBP"), "fake.webp")
    ).toBe(false);
    expect(await isValidDocumentFile(Buffer.from("<svg/>"), "scan.png")).toBe(
      false
    );
  });

  it("uses a 25 MiB upper limit and rejects empty bytes", async () => {
    expect(MAX_DOCUMENT_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
    expect(await isValidDocumentFile(Buffer.alloc(0), "report.docx")).toBe(
      false
    );
    expect(
      await isValidDocumentFile(
        Buffer.alloc(MAX_DOCUMENT_UPLOAD_BYTES + 1),
        "scan.pdf"
      )
    ).toBe(false);
  });

  it("binds generated storage keys to the authenticated owner and exact filename", () => {
    expect(isSafeDocumentStorageKey(storageKey, ownerId, fileName)).toBe(true);
    expect(
      isSafeDocumentStorageKey(storageKey, "another-owner", fileName)
    ).toBe(false);
    expect(
      isSafeDocumentStorageKey(
        storageKey.replace("report.docx", "other.docx"),
        ownerId,
        fileName
      )
    ).toBe(false);
    expect(
      isSafeDocumentStorageKey(
        `documents/${ownerId}/../${fileName}`,
        ownerId,
        fileName
      )
    ).toBe(false);
  });
});
