import { describe, expect, it } from "vitest";
import { validateTemplateFieldValues } from "./documentStudio";
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
