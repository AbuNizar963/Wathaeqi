import { describe, expect, it } from "vitest";
import {
  richEditorContent,
  supportsRichDocumentEditing,
} from "./richDocumentContent";

describe("rich document editing safety", () => {
  it("normalizes legacy plain text into canonical editor paragraphs", () => {
    const legacy = { type: "legacy-text", text: "أول\n\nثالث" };
    expect(supportsRichDocumentEditing(legacy)).toBe(true);
    expect(richEditorContent(legacy)).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "أول" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "ثالث" }] },
      ],
    });
  });

  it("supports rich formatting, tables, and images", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "عنوان", marks: [{ type: "bold" }] }],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "رأس" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "image",
          attrs: { src: "data:image/png;base64,aGVsbG8=", alt: "شعار" },
        },
      ],
    };
    expect(supportsRichDocumentEditing(document)).toBe(true);
    expect(richEditorContent(document)).toEqual(document);
  });

  it("keeps unknown nodes, marks, and unsafe image sources read-only", () => {
    const unknownNode = {
      type: "doc",
      content: [{ type: "customWidget", attrs: { payload: "keep" } }],
    };
    const unknownMark = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "نص", marks: [{ type: "customMark" }] },
          ],
        },
      ],
    };
    const unsafeImage = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "image", attrs: { src: "javascript:alert(1)" } }],
        },
      ],
    };
    for (const document of [unknownNode, unknownMark, unsafeImage]) {
      expect(supportsRichDocumentEditing(document)).toBe(false);
      expect(richEditorContent(document)).toEqual({
        type: "doc",
        content: [{ type: "paragraph" }],
      });
    }
  });

  it("preserves legacy HTML as read-only text", () => {
    const legacyHtml = {
      type: "legacy-html",
      html: "<p><strong>محتوى</strong></p>",
    };
    expect(supportsRichDocumentEditing(legacyHtml)).toBe(false);
    expect(richEditorContent(legacyHtml)).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });
});
