import { describe, expect, it } from "vitest";
import { applyDocumentTemplateVariables } from "./documentTemplateVariables";

describe("applyDocumentTemplateVariables", () => {
  it("resolves Arabic and English system variables with optional whitespace", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "إلى {{ organization }} بتاريخ {{date}} رقم {{number}} الموضوع {{subject}}",
            },
          ],
        },
      ],
    };

    expect(
      applyDocumentTemplateVariables(content, {
        organization: "مديرية الوثائق",
        date: "2026/11/22",
        number: "DOC-00125",
        subject: "اعتماد النموذج",
      })
    ).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "إلى مديرية الوثائق بتاريخ 2026/11/22 رقم DOC-00125 الموضوع اعتماد النموذج",
            },
          ],
        },
      ],
    });
  });

  it("keeps unresolved variables when a value is not available yet", () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "{{number}}" }] },
      ],
    };

    expect(applyDocumentTemplateVariables(content, {})).toEqual(content);
  });

  it("does not reinterpret placeholders inside replacement values", () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "{{subject}}" }] },
      ],
    };

    expect(
      applyDocumentTemplateVariables(content, {
        subject: "{{number}}",
        number: "DOC-9",
      }).content
    ).toEqual([{ type: "paragraph", content: [{ type: "text", text: "{{number}}" }] }]);
  });

  it("preserves marks, attributes, unknown nodes, and the original object", () => {
    const content = {
      type: "doc",
      attrs: { note: "{{subject}}" },
      content: [
        {
          type: "paragraph",
          attrs: { alignment: "right" },
          content: [
            {
              type: "text",
              text: "{{subject}}",
              marks: [{ type: "bold" }],
            },
          ],
        },
        {
          type: "customWidget",
          content: [{ type: "text", text: "{{subject}}" }],
        },
      ],
    };
    const snapshot = structuredClone(content);
    const result = applyDocumentTemplateVariables(content, {
      subject: "قرار إداري",
    });

    expect(result.content[0]).toEqual({
      type: "paragraph",
      attrs: { alignment: "right" },
      content: [
        {
          type: "text",
          text: "قرار إداري",
          marks: [{ type: "bold" }],
        },
      ],
    });
    expect(result.content[1]).toBe(content.content[1]);
    expect(result.attrs).toEqual({ note: "{{subject}}" });
    expect(content).toEqual(snapshot);
  });

  it("does not traverse unsupported legacy HTML", () => {
    const content = { type: "legacy-html", html: "<p>{{subject}}</p>" };
    expect(
      applyDocumentTemplateVariables(content, { subject: "قيمة" })
    ).toBe(content);
  });
});
