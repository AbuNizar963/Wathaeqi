import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResponsiveA4Preview from "./ResponsiveA4Preview";

describe("ResponsiveA4Preview", () => {
  it("renders the fitted A4 page without zoom controls", () => {
    const markup = renderToStaticMarkup(
      <ResponsiveA4Preview>
        <p>محتوى الوثيقة</p>
      </ResponsiveA4Preview>
    );

    expect(markup).toContain("document-a4-preview-page");
    expect(markup).toContain("محتوى الوثيقة");
    expect(markup).not.toContain("تكبير معاينة الورقة");
    expect(markup).not.toContain("تصغير المعاينة");
    expect(markup).not.toContain("إعادة ضبط التكبير");
  });
});
