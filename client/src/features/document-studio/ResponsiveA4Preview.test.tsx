import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResponsiveA4Preview from "./ResponsiveA4Preview";
import { DEFAULT_PLATFORM_DOCUMENT_SETTINGS } from "@shared/features/platform-settings/platformDocumentSettings";

describe("ResponsiveA4Preview", () => {
  it("renders professional multi-line frame styling", () => {
    const markup = renderToStaticMarkup(
      <ResponsiveA4Preview
        settings={{
          ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
          frameStyle: "triple",
          frameColor: "#123456",
        }}
      >
        <p>محتوى الوثيقة</p>
      </ResponsiveA4Preview>
    );

    expect(markup).toContain("inset 0 0 0 3px #123456");
    expect(markup).toContain("inset 0 0 0 7px #123456");
  });

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
