import { describe, expect, it } from "vitest";
import { isDocumentFormDirty, parseDocumentDate } from "./documentFormState";

const saved = {
  title: "عنوان",
  category: "general",
  subject: "موضوع",
  documentDate: "2026-11-23T12:00:00.000Z",
  content: { type: "doc", content: [{ type: "paragraph" }] },
  fieldValues: { employee: "اسم" },
  templateId: "template-1",
  templateRevision: 2,
};
const form = {
  ...saved,
  documentDate: "2026-11-23",
};

describe("document editor safety", () => {
  it("recognizes an unmodified saved draft", () => {
    expect(isDocumentFormDirty(saved, form)).toBe(false);
  });

  it.each([
    { title: "عنوان جديد" },
    { category: "personnel" },
    { subject: "موضوع آخر" },
    { documentDate: "2026-11-24" },
    {
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "تعديل" }] },
        ],
      },
    },
    { fieldValues: { employee: "اسم آخر" } },
    { templateId: null },
    { templateRevision: 3 },
  ])("detects unsaved changes: %j", patch => {
    expect(isDocumentFormDirty(saved, { ...form, ...patch })).toBe(true);
  });

  it("accepts a valid date and safely rejects an empty or invalid date", () => {
    expect(parseDocumentDate("2026-11-23")).toBe("2026-11-23T12:00:00.000Z");
    expect(parseDocumentDate("")).toBeNull();
    expect(parseDocumentDate("2026-02-30")).toBeNull();
    expect(parseDocumentDate("invalid")).toBeNull();
  });
});
