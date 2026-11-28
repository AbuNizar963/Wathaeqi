import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DocumentEditor from "./DocumentEditor";

describe("DocumentEditor", () => {
  it("shows plain text input without a formatting toolbar", () => {
    const markup = renderToStaticMarkup(
      <DocumentEditor
        content={{
          type: "doc",
          content: [{ type: "paragraph", content: [] }],
        }}
        onChange={() => undefined}
      />
    );

    expect(markup).toContain("<textarea");
    expect(markup).toContain('placeholder="اكتب المحتوى هنا..."');
    expect(markup).not.toContain('role="toolbar"');
    expect(markup).not.toContain("تنسيق الفقرة");
    expect(markup).not.toContain("محاذاة يمين");
  });

  it("uses the official 16px body size in the editor and print copy", () => {
    const markup = renderToStaticMarkup(
      <DocumentEditor
        content={{
          type: "doc",
          content: [{ type: "paragraph", content: [] }],
        }}
        onChange={() => undefined}
      />
    );

    expect(markup).toMatch(/<textarea[^>]*class="[^"]*text-\[16px\]/);
    expect(markup).toMatch(
      /class="[^"]*document-editor-copy[^\"]*text-\[16px\]/
    );
    expect(markup).toMatch(/<textarea[^>]*class="[^"]*p-3[^"]*leading-\[2\]/);
    expect(markup).toMatch(
      /class="[^\"]*document-editor-copy[^\"]*p-3[^\"]*leading-\[2\]/
    );
  });

  it("uses matching textarea controls for editing and print wrapping", () => {
    const markup = renderToStaticMarkup(
      <DocumentEditor
        content={{
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "نص للتأكد من تطابق نهاية السطر" },
              ],
            },
          ],
        }}
        onChange={() => undefined}
      />
    );

    expect((markup.match(/<textarea\b/g) ?? []).length).toBe(2);
    expect(markup).toMatch(/<textarea[^>]*document-editor-input/);
    expect(markup).toMatch(
      /<textarea[^>]*document-editor-copy document-editor-print-copy/
    );
    expect(markup).toContain('readOnly=""');
    expect(markup).toContain('aria-hidden="true"');
  });
});
