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
      organizationName="إدارة الشرطة"
      unitName="وحدة العمليات"
      chiefRank="العقيد"
      chiefName="رئيس الوحدة"
      logoUrl={null}
      dividerColor="#14532d"
      headerSettings={settings}
      serial="يخصص عند الإصدار"
      date="24 نوفمبر 2026"
    />
  );
}

describe("DocumentLetterhead", () => {
  it("lays the three header blocks out as a table row html2canvas can capture", () => {
    const markup = render(tricolorSettings);
    expect(markup).toContain('class="document-letterhead"');
    expect(markup).toContain('class="document-letterhead__row"');
    expect(markup.match(/document-letterhead__cell/g)).toHaveLength(3);
    expect(markup).not.toContain("grid-template-columns");
    expect(markup).not.toMatch(
      /class="document-letterhead[^"]*\b(grid|flex)\b/
    );
  });

  it("places serial and date metadata below the tricolor divider, aligned right", () => {
    const markup = render(tricolorSettings);
    const dividerIndex = markup.indexOf("document-tricolor-stars-divider");
    const metadataIndex = markup.indexOf('data-testid="document-letterhead-metadata"');
    const dateIndex = markup.indexOf("التاريخ:");
    expect(dividerIndex).toBeGreaterThan(-1);
    expect(metadataIndex).toBeGreaterThan(dividerIndex);
    expect(dateIndex).toBeGreaterThan(metadataIndex);
    expect(markup.slice(metadataIndex, dateIndex)).toContain("text-right");
    expect(markup.slice(metadataIndex, dateIndex)).toContain('dir="rtl"');
    expect(markup).toContain("الرقم:");
    expect(markup).toContain("يخصص عند الإصدار");
    expect(markup).toContain("24 نوفمبر 2026");
    expect(markup).toContain("رئيس الوحدة");
  });

  it("does not render the organization and unit titles in the letterhead", () => {
    const markup = render({
      ...tricolorSettings,
      headerTitle: "إدارة الشرطة",
      headerSubtitle: "وحدة العمليات",
    });
    expect(markup).not.toContain("إدارة الشرطة");
    expect(markup).not.toContain("وحدة العمليات");
  });

  it("continues to render other configured organization and unit titles", () => {
    const markup = render({
      ...tricolorSettings,
      headerTitle: "مكتب المراسلات",
      headerSubtitle: "قسم الصادر",
    });
    expect(markup).toContain("مكتب المراسلات");
    expect(markup).toContain("قسم الصادر");
  });

  it("keeps a plain border and no divider markup for solid dividers", () => {
    const markup = render(solidSettings);
    expect(markup).toContain("border-bottom:2.25pt solid #14532d");
    expect(markup).not.toContain("document-tricolor-stars-divider");
  });

  it("honours the logo size and centre alignment settings", () => {
    const markup = renderToStaticMarkup(
      <DocumentLetterhead
        organizationName=""
        unitName=""
        chiefRank=""
        chiefName=""
        logoUrl="data:image/png;base64,AAAA"
        dividerColor="#000000"
        headerSettings={{
          ...tricolorSettings,
          headerAlignment: "center",
          headerLogoSize: 96,
        }}
      />
    );
    expect(markup).toContain("width:96px");
    expect(markup).toContain("text-align:center");
    expect(markup).toContain('alt="الشعار الرسمي"');
  });

  it("renders each configured custom header row exactly once", () => {
    const settings: PlatformDocumentSettings = {
      ...tricolorSettings,
      pageHeaderRows: [
        { right: "السطر الأيمن الأول", left: "First left row" },
        { right: "السطر الأيمن الثاني", left: "Second left row" },
        { right: "السطر الأيمن الثالث", left: "Third left row" },
        { right: "السطر الأيمن الرابع", left: "Fourth left row" },
      ],
    };
    const markup = render(settings);
    for (const value of [
      "السطر الأيمن الأول",
      "السطر الأيمن الثاني",
      "السطر الأيمن الثالث",
      "السطر الأيمن الرابع",
    ]) {
      expect(markup.split(value)).toHaveLength(2);
    }
  });
});
