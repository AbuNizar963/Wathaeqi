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
    expect(markup).not.toContain('role="toolbar"');
    expect(markup).not.toContain("تنسيق الفقرة");
    expect(markup).not.toContain("محاذاة يمين");
  });
});
