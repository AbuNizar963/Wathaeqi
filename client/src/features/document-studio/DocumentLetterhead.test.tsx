import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  type PlatformDocumentSettings,
} from "@shared/features/platform-settings/platformDocumentSettings";
import DocumentLetterhead from "./DocumentLetterhead";

const tricolorSettings: PlatformDocumentSettings = {
  ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  headerDividerStyle: "tricolor-stars",
};

const solidSettings: PlatformDocumentSettings = {
  ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  headerDividerStyle: "solid",
  headerDividerColor: "#123456",
};

function render(settings: PlatformDocumentSettings): string {
  return renderToStaticMarkup(
    <DocumentLetterhead
      logoUrl={null}
      dividerColor="#14532d"
      headerSettings={settings}
      serial="يخصص عند الإصدار"
      date="24 نوفمبر 2026"
    />
  );
}

describe("DocumentLetterhead", () => {
  it("renders a centred logo row without signatory text in the header", () => {
    const markup = render(tricolorSettings);
    expect(markup).toContain('class="document-letterhead"');
    expect(markup).toContain('class="document-letterhead__row"');
    expect(markup).toContain("document-letterhead__logo-cell");
    expect(markup).toContain("text-align:center");
    expect(markup).not.toContain("العنوان الرئيسي");
    expect(markup).not.toContain("رئيس الوحدة");
    expect(markup).not.toContain("إدارة الشرطة");
  });

  it("renders configured custom header rows once above the logo and divider", () => {
    const markup = renderToStaticMarkup(
      <DocumentLetterhead
        logoUrl={null}
        dividerColor="#14532d"
        headerSettings={{
          ...tricolorSettings,
          pageHeaderRows: [
            {
              right: "الجمهورية العربية السورية",
              left: "Syrian Arab Republic",
            },
            { right: "وزارة الداخلية", left: "Ministry of Interior" },
          ],
        }}
      />
    );
    const rowsIndex = markup.indexOf(
      'data-testid="document-custom-header-rows"'
    );
    const logoIndex = markup.indexOf('class="document-letterhead__row"');
    expect(rowsIndex).toBeGreaterThan(-1);
    expect(rowsIndex).toBeLessThan(logoIndex);
    expect(markup.match(/الجمهورية العربية السورية/g)).toHaveLength(1);
    expect(markup.match(/وزارة الداخلية/g)).toHaveLength(1);
    expect(markup).toContain("Syrian Arab Republic");
    expect(markup).toContain("Ministry of Interior");
  });

  it("does not render an empty custom header rows container", () => {
    const markup = render(tricolorSettings);
    expect(markup).not.toContain('data-testid="document-custom-header-rows"');
  });

  it("places serial and date metadata below the tricolor divider, aligned right", () => {
    const markup = render(tricolorSettings);
    const dividerIndex = markup.indexOf("document-tricolor-stars-divider");
    const metadataIndex = markup.indexOf(
      'data-testid="document-letterhead-metadata"'
    );
    const dateIndex = markup.indexOf("التاريخ:");
    expect(dividerIndex).toBeGreaterThan(-1);
    expect(metadataIndex).toBeGreaterThan(dividerIndex);
    expect(dateIndex).toBeGreaterThan(metadataIndex);
    expect(markup).toContain(
      'class="mt-1 text-right text-[12pt] font-semibold leading-[1.6]"'
    );
    expect(markup).toContain("الرقم:");
    expect(markup).toContain("يخصص عند الإصدار");
    expect(markup).toContain("24 نوفمبر 2026");
  });

  it("keeps a plain border and no divider markup for solid dividers", () => {
    const markup = render(solidSettings);
    expect(markup).toContain("border-bottom:2.25pt solid #14532d");
    expect(markup).not.toContain("document-tricolor-stars-divider");
  });

  it("uses the enlarged default logo size", () => {
    const markup = renderToStaticMarkup(
      <DocumentLetterhead
        logoUrl="data:image/png;base64,AAAA"
        dividerColor="#000000"
        headerSettings={DEFAULT_PLATFORM_DOCUMENT_SETTINGS}
      />
    );
    expect(markup).toContain("width:200px");
    expect(markup).toContain("height:200px");
  });

  it("honours the logo size setting", () => {
    const markup = renderToStaticMarkup(
      <DocumentLetterhead
        logoUrl="data:image/png;base64,AAAA"
        dividerColor="#000000"
        headerSettings={{
          ...tricolorSettings,
          headerLogoSize: 96,
        }}
      />
    );
    expect(markup).toContain("width:96px");
    expect(markup).toContain('alt="الشعار الرسمي"');
  });
});
