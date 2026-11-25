import { describe, expect, it } from "vitest";
import {
  isDocumentFormDirty,
  missingRequiredTemplateFields,
  parseDocumentDate,
} from "./documentFormState";

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

describe("guided template field validation", () => {
  const fields = [
    {
      key: "employee",
      label: "اسم الموظف",
      type: "text" as const,
      required: true,
    },
    {
      key: "notes",
      label: "ملاحظات",
      type: "multiline" as const,
      required: false,
    },
    {
      key: "date",
      label: "التاريخ",
      type: "date" as const,
      required: true,
    },
  ];

  it("returns only required fields that are empty or whitespace", () => {
    expect(
      missingRequiredTemplateFields(fields, {
        employee: "  ",
        date: "2026-11-25",
      }).map(field => field.key)
    ).toEqual(["employee"]);
  });

  it("accepts completed required fields and ignores optional fields", () => {
    expect(
      missingRequiredTemplateFields(fields, {
        employee: "أحمد",
        date: "2026-11-25",
      })
    ).toEqual([]);
  });
});
