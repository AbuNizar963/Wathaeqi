import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DocumentFramePicker from "./DocumentFramePicker";

describe("DocumentFramePicker", () => {
  it("renders one Word-style select without preset cards or thumbnail previews", () => {
    const markup = renderToStaticMarkup(
      <DocumentFramePicker value="box" onChange={() => undefined} />
    );

    expect(markup).toContain('aria-label="اختيار إطار الصفحة"');
    expect(markup).toContain("<select");
    expect(markup).toContain("مربع — إطار كامل");
    expect(markup).toContain("ظل — إطار بظل جانبي");
    expect(markup).toContain("ثلاثي الأبعاد");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("grid-cols-2");
    expect(markup).not.toContain("DocumentFrameDecoration");
  });

  it("maps old saved values to the closest current Word-style option", () => {
    const markup = renderToStaticMarkup(
      <DocumentFramePicker value="triple" onChange={() => undefined} />
    );

    expect(markup).toContain('value="three-dimensional"');
    expect(markup).toContain('selected=""');
  });
});
