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

function render(
  settings: PlatformDocumentSettings,
  metadata: { serial?: string; date?: string } = {}
): string {
  return renderToStaticMarkup(
    <DocumentLetterhead
      logoUrl={null}
      dividerColor="#14532d"
      headerSettings={settings}
      serial={metadata.serial ?? "يخصص عند الإصدار"}
      date={metadata.date ?? "24 نوفمبر 2026"}
    />
  );
}

describe("DocumentLetterhead", () => {
  it("renders one three-column heading row without signatory text", () => {
    const markup = render(tricolorSettings);
    expect(markup).toContain('class="document-letterhead"');
    expect(markup).toContain('data-testid="document-letterhead-row"');
    expect(markup).toContain('data-testid="document-letterhead-logo-cell"');
    expect(markup).not.toContain("العنوان الرئيسي");
    expect(markup).not.toContain("رئيس الوحدة");
    expect(markup).not.toContain("إدارة الشرطة");
  });

  it("places configured right text, logo and left text in the same row", () => {
    const markup = renderToStaticMarkup(
      <DocumentLetterhead
        logoUrl="data:image/png;base64,AAAA"
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
    const rowIndex = markup.indexOf('data-testid="document-letterhead-row"');
    const rightIndex = markup.indexOf(
      'data-testid="document-custom-header-rows-right"'
    );
    const logoIndex = markup.indexOf(
      'data-testid="document-letterhead-logo-cell"'
    );
    const leftIndex = markup.indexOf(
      'data-testid="document-custom-header-rows-left"'
    );
    expect(rowIndex).toBeGreaterThan(-1);
    expect(rowIndex).toBeLessThan(rightIndex);
    expect(rightIndex).toBeLessThan(logoIndex);
    expect(logoIndex).toBeLessThan(leftIndex);
    expect(markup.match(/الجمهورية العربية السورية/g)).toHaveLength(1);
    expect(markup.match(/وزارة الداخلية/g)).toHaveLength(1);
    expect(markup).toContain("Syrian Arab Republic");
    expect(markup).toContain("Ministry of Interior");
  });

  it("does not render custom row labels for an empty header", () => {
    const markup = render(tricolorSettings);
    expect(markup).not.toContain("document-custom-header-rows-right");
    expect(markup).not.toContain("document-custom-header-rows-left");
  });

  it("places serial and date metadata below the tricolor divider", () => {
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
    expect(markup.indexOf("الرقم:")).toBeLessThan(dateIndex);
    expect(markup).toContain("يخصص عند الإصدار");
    expect(markup).toContain("24 نوفمبر 2026");
  });

  it("omits metadata entirely when serial and date are empty", () => {
    const markup = render(tricolorSettings, { serial: "", date: "" });
    expect(markup).not.toContain('data-testid="document-letterhead-metadata"');
    expect(markup).not.toContain("التاريخ:");
  });

  it("keeps blank labels when a space is entered for handwriting", () => {
    const markup = render(tricolorSettings, { serial: " ", date: " " });
    expect(markup).toContain('data-testid="document-letterhead-metadata"');
    expect(markup).toContain("الرقم:");
    expect(markup).toContain("التاريخ:");
    expect(markup).toContain(`الرقم:</strong> ${"\u00a0".repeat(8)}`);
    expect(markup).not.toContain("الرقم:</strong>  ");
  });

  it("keeps a handwriting-width gap between slash-separated number parts", () => {
    const markup = render(tricolorSettings, { serial: "/ /" });
    expect(markup).toContain('class="whitespace-pre"');
    expect(markup).toContain(`/${"\u00a0".repeat(8)}/`);
  });

  it("preserves longer gaps entered between slash-separated number parts", () => {
    const markup = render(tricolorSettings, { serial: `/${" ".repeat(9)}/` });
    expect(markup).toContain(`/${"\u00a0".repeat(9)}/`);
  });

  it("keeps a plain border and no divider markup for solid dividers", () => {
    const markup = render(solidSettings);
    expect(markup).toContain("border-bottom:2.25pt solid #14532d");
    expect(markup).not.toContain("document-tricolor-stars-divider");
  });

  it("renders the configured logo size in the document header", () => {
    const markup = renderToStaticMarkup(
      <DocumentLetterhead
        logoUrl="data:image/png;base64,AAAA"
        dividerColor="#000000"
        headerSettings={{
          ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
          headerLogoSize: 176,
        }}
      />
    );
    expect(markup).toContain('width="176"');
    expect(markup).toContain('height="176"');
    expect(markup).toContain("width:176px");
    expect(markup).toContain("height:176px");
    expect(markup).toContain('alt="الشعار الرسمي"');
  });

  it("hides the header logo and releases its layout column when disabled", () => {
    const markup = renderToStaticMarkup(
      <DocumentLetterhead
        logoUrl="data:image/png;base64,AAAA"
        dividerColor="#000000"
        headerSettings={{
          ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
          headerShowLogo: false,
        }}
      />
    );
    expect(markup).toContain(
      "grid-template-columns:minmax(0, 1fr) 0px minmax(0, 1fr)"
    );
    expect(markup).toContain("display:none");
    expect(markup).not.toContain('alt="الشعار الرسمي"');
  });
});
