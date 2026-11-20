import { describe, expect, it } from "vitest";
import {
  decodeOfficialDocumentStorageContent,
  decodeTemplateStorageContent,
  encodeOfficialDocumentStorageContent,
  encodeTemplateStorageContent,
  validateTemplateFieldValues,
} from "./documentStudio";
import type { DocumentTemplateField } from "./documentStudio";

const fields: DocumentTemplateField[] = [
  {
    key: "employee_name",
    label: "اسم الموظف",
    type: "text",
    required: true,
    maxLength: 80,
  },
  {
    key: "leave_type",
    label: "نوع الإجازة",
    type: "select",
    required: true,
    options: [
      { value: "annual", label: "سنوية" },
      { value: "sick", label: "مرضية" },
    ],
  },
];

describe("validateTemplateFieldValues", () => {
  it("accepts complete values matching the template fields", () => {
    expect(
      validateTemplateFieldValues(fields, {
        employee_name: "أحمد",
        leave_type: "annual",
      })
    ).toEqual([]);
  });

  it("reports missing required fields", () => {
    expect(validateTemplateFieldValues(fields, {})).toHaveLength(2);
  });

  it("rejects values longer than the configured maximum", () => {
    const issues = validateTemplateFieldValues(fields, {
      employee_name: "أ".repeat(81),
      leave_type: "annual",
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.fieldKey).toBe("employee_name");
  });

  it("rejects a select value not present in the template options", () => {
    const issues = validateTemplateFieldValues(fields, {
      employee_name: "أحمد",
      leave_type: "unlisted",
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.fieldKey).toBe("leave_type");
  });
});

describe("Document Studio Appwrite content codecs", () => {
  it("round-trips template metadata inside the existing content column", () => {
    const template = {
      content: {
        type: "doc",
        content: [{ type: "paragraph" }],
      },
      description: "نموذج داخلي",
      fields,
      revision: 2,
      isActive: true,
    };
    const restored = decodeTemplateStorageContent(
      encodeTemplateStorageContent(template)
    );

    expect(restored).toEqual(template);
  });

  it("preserves existing HTML documents without rewriting them", () => {
    const legacyHtml = '<p dir="rtl">وثيقة محفوظة</p>';
    const restored = decodeOfficialDocumentStorageContent(
      legacyHtml,
      "2026-11-18T10:00:00.000Z"
    );

    expect(restored.content).toEqual({
      type: "legacy-html",
      html: legacyHtml,
    });
    expect(restored.status).toBe("draft");
    expect(restored.documentDate).toBe("2026-11-18T10:00:00.000Z");
  });

  it("preserves legacy template HTML without rewriting it", () => {
    const legacyHtml = "<p>نموذج قديم</p>";
    expect(decodeTemplateStorageContent(legacyHtml).content).toEqual({
      type: "legacy-html",
      html: legacyHtml,
    });
  });

  it("round-trips official document issue metadata in its content envelope", () => {
    const document = {
      content: {
        type: "doc",
        content: [{ type: "paragraph" }],
      },
      organizationId: "org-1",
      templateFieldsSnapshot: fields,
      subject: "تكليف موظف",
      fieldValues: { employee_name: "أحمد" },
      serialNumber: 12,
      serialCode: "DOC-0012",
      documentDate: "2026-11-18T00:00:00.000Z",
      status: "issued" as const,
      file: null,
      templateId: "template-1",
      templateRevision: 3,
      issuedAt: "2026-11-18T11:00:00.000Z",
      archivedAt: null,
    };
    const restored = decodeOfficialDocumentStorageContent(
      encodeOfficialDocumentStorageContent(document),
      "2026-11-18T10:00:00.000Z"
    );

    expect(restored).toEqual(document);
  });
});
