import { Children, isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { Textarea } from "@/components/ui/textarea";
import DocumentEditor from "./DocumentEditor";
import { applyFieldValues, contentForSave } from "./documentEditorContent";

type ElementProps = {
  children?: unknown;
  value?: string;
  onChange?: (event: { target: { value: string } }) => void;
};

function editorChildren(content: Record<string, unknown>, onChange = vi.fn()) {
  const element = DocumentEditor({ content, onChange, editable: true });
  return { children: Children.toArray(element.props.children), onChange };
}

function textArea(children: unknown[]) {
  return children.find(
    child => isValidElement(child) && child.type === Textarea
  ) as ReactElement<ElementProps> | undefined;
}

describe("Document Studio safe content editing", () => {
  it("sends canonical doc JSON after a user edits legacy plain text, preserving blank and trailing lines", () => {
    const { children, onChange } = editorChildren({
      type: "legacy-text",
      text: "سطر قديم",
    });
    const input = textArea(children);
    expect(input?.props.value).toBe("سطر قديم");
    input?.props.onChange?.({ target: { value: "أول\n\nثالث\n" } });
    expect(onChange).toHaveBeenCalledWith({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "أول" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "ثالث" }] },
        { type: "paragraph" },
      ],
    });
  });

  it("allows plain paragraphs to be edited without losing newlines", () => {
    const { children, onChange } = editorChildren({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "الأول" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "الثالث" }] },
      ],
    });
    const input = textArea(children);
    expect(input?.props.value).toBe("الأول\n\nالثالث");
    input?.props.onChange?.({ target: { value: "أول\nثان" } });
    expect(onChange.mock.calls[0]?.[0]).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "أول" }] },
        { type: "paragraph", content: [{ type: "text", text: "ثان" }] },
      ],
    });
  });

  it.each([
    { type: "legacy-html", html: "<p><strong>نص</strong></p>" },
    { type: "legacy-text", text: "نص", metadata: { keep: true } },
    { type: "legacy-text", text: "one\r\ntwo" },
    { type: "unknown", content: [{ type: "text", text: "نص" }] },
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "نص", marks: [{ type: "bold" }] }],
        },
        { type: "image", attrs: { src: "image.png", custom: "keep" } },
      ],
    },
  ])(
    "never provides a destructive textarea for unsupported content %#",
    content => {
      const snapshot = structuredClone(content);
      const { children, onChange } = editorChildren(content);
      expect(textArea(children)).toBeUndefined();
      expect(
        children.some(
          child =>
            isValidElement(child) &&
            child.props &&
            (child.props as { role?: string }).role === "status"
        )
      ).toBe(true);
      expect(onChange).not.toHaveBeenCalled();
      expect(content).toEqual(snapshot);
    }
  );
});

describe("template substitutions", () => {
  it("updates text only in known content nodes, preserving marks, attrs and unknown nodes", () => {
    const content = {
      type: "doc",
      attrs: { untouched: "{{name}}" },
      content: [
        {
          type: "paragraph",
          attrs: { id: "p1" },
          content: [
            { type: "text", text: "مرحبا {{name}}", marks: [{ type: "bold" }] },
          ],
        },
        {
          type: "unknownWidget",
          content: [{ type: "text", text: "{{name}}" }],
          data: "keep",
        },
      ],
    };
    const original = structuredClone(content);
    expect(applyFieldValues(content, { name: "أحمد" })).toEqual({
      ...content,
      content: [
        {
          ...content.content[0],
          content: [
            { type: "text", text: "مرحبا أحمد", marks: [{ type: "bold" }] },
          ],
        },
        content.content[1],
      ],
    });
    expect(content).toEqual(original);
  });

  it("does not reinterpret placeholders in field values and preserves unsupported HTML", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "{{name}} {{title}}" }],
        },
      ],
    };
    expect(applyFieldValues(doc, { name: "{{title}}", title: "مدير" })).toEqual(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "{{title}} مدير" }],
          },
        ],
      }
    );
    const html = { type: "legacy-html", html: "<p>{{name}}</p>" };
    expect(applyFieldValues(html, { name: "أحمد" })).toEqual(html);
    const unknownLegacy = {
      type: "legacy-text",
      text: "{{name}}",
      custom: { preserve: true },
    };
    expect(applyFieldValues(unknownLegacy, { name: "أحمد" })).toEqual(
      unknownLegacy
    );
  });

  it("does not reapply values after explicit application or on a saved snapshot", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "{{name}}" }] },
      ],
    };
    const values = { name: "{{title}}", title: "مدير" };
    const applied = applyFieldValues(doc, values);
    expect(contentForSave(doc, values, true)).toEqual(applied);
    expect(contentForSave(applied, values, false)).toEqual(applied);
    expect(contentForSave(applied, values, false)).toBe(applied);
  });

  it("substitutes fields inside Word tables", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "الموضوع: {{الموضوع}}" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(applyFieldValues(doc, { الموضوع: "طلب رسمي" })).toEqual({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "الموضوع: طلب رسمي" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("substitutes Arabic Word-style placeholder keys", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "إلى {{الجهة_المرسل_إليها}} بتاريخ {{التاريخ}}",
            },
          ],
        },
      ],
    };
    expect(
      applyFieldValues(doc, {
        الجهة_المرسل_إليها: "مديرية الشرطة",
        التاريخ: "2026-11-22",
      })
    ).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "إلى مديرية الشرطة بتاريخ 2026-11-22",
            },
          ],
        },
      ],
    });
  });
});
