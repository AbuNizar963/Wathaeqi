import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResponsiveA4Preview from "./ResponsiveA4Preview";
import DocumentFrameDecoration from "./DocumentFrameDecoration";
import { DEFAULT_PLATFORM_DOCUMENT_SETTINGS } from "@shared/features/platform-settings/platformDocumentSettings";

describe("ResponsiveA4Preview", () => {
  it.each([
    ["box", 'data-document-frame="box"'],
    ["shadow", 'data-document-frame="shadow"'],
    ["double", 'data-document-frame="double"'],
  ] as const)("renders the %s Word-style page border", (frameStyle, marker) => {
    const markup = renderToStaticMarkup(
      <DocumentFrameDecoration
        frameStyle={frameStyle}
        frameColor="#123456"
        frameWidthPt={1}
      />
    );

    expect(markup).toContain(marker);
    expect(markup).toContain('stroke="#123456"');
  });

  it("omits the page border when the no-border option is selected", () => {
    const markup = renderToStaticMarkup(
      <DocumentFrameDecoration
        frameStyle="none"
        frameColor="#123456"
        frameWidthPt={1}
      />
    );

    expect(markup).toBe("");
  });

  it("renders a Word-style three-dimensional page border", () => {
    const markup = renderToStaticMarkup(
      <ResponsiveA4Preview
        settings={{
          ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
          frameStyle: "three-dimensional",
          frameColor: "#123456",
        }}
      >
        <p>محتوى الوثيقة</p>
      </ResponsiveA4Preview>
    );

    expect(markup).toContain('data-document-frame="three-dimensional"');
    expect(markup).toContain('stroke="#123456"');
    expect(markup).toContain('viewBox="0 0 794 1123"');
  });

  it("renders the fitted A4 page without a default frame or zoom controls", () => {
    const markup = renderToStaticMarkup(
      <ResponsiveA4Preview>
        <p>محتوى الوثيقة</p>
      </ResponsiveA4Preview>
    );

    expect(DEFAULT_PLATFORM_DOCUMENT_SETTINGS.frameStyle).toBe("none");
    expect(markup).toContain("document-a4-preview-page");
    expect(markup).toContain("background-image:none;");
    expect(markup).not.toContain("data-document-frame=");
    expect(markup).toContain("محتوى الوثيقة");
    expect(markup).not.toContain("تكبير معاينة الورقة");
    expect(markup).not.toContain("تصغير المعاينة");
    expect(markup).not.toContain("إعادة ضبط التكبير");
  });

  it("repeats the frame tile for every A4 sheet in a long document", () => {
    const markup = renderToStaticMarkup(
      <DocumentFrameDecoration
        frameStyle="f04g"
        frameColor="#123456"
        frameWidthPt={1}
        pageHeightPx={2246}
      />
    );

    expect(markup).toContain('viewBox="0 0 794 2246"');
    expect(markup).toContain('patternUnits="userSpaceOnUse"');
    expect(markup).toContain('width="794" height="1123"');
    expect(markup).toContain('fill="url(#document-page-border-');
  });
});
