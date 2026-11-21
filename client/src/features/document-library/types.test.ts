import { describe, expect, it } from "vitest";
import { fileKind } from "./types";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("fileKind", () => {
  it("routes matching DOCX metadata to the Word preview/print path", () => {
    expect(fileKind("report.docx", DOCX_MIME)).toBe("word");
  });

  it("routes matching PDF metadata to the original PDF path", () => {
    expect(fileKind("report.PDF", "application/pdf")).toBe("pdf");
  });

  it("rejects MIME/extension mismatches instead of using the wrong renderer", () => {
    expect(fileKind("report.docx", "text/plain")).toBeNull();
    expect(fileKind("report.pdf", DOCX_MIME)).toBeNull();
    expect(fileKind("report.png", "image/jpeg")).toBeNull();
  });

  it("does not classify arbitrary image MIME types without a matching extension", () => {
    expect(fileKind("report.bin", "image/png")).toBeNull();
  });
});
