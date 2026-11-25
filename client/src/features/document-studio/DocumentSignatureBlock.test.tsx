import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  type PlatformDocumentSettings,
} from "@shared/features/platform-settings/platformDocumentSettings";
import DocumentSignatureBlock from "./DocumentSignatureBlock";

describe("DocumentSignatureBlock", () => {
  it("renders the four configured values as two stacked lines aligned left", () => {
    const settings: PlatformDocumentSettings = {
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      headerTitle: "المقدم",
      headerSubtitle: "غسان صالح كنو",
      headerChiefRank: "رئيس قسم شرطة",
      headerChiefName: "الشهباء",
    };
    const markup = renderToStaticMarkup(
      <DocumentSignatureBlock
        organizationName="قسم شرطة الشهباء"
        unitName="وحدة افتراضية"
        chiefRank="رتبة افتراضية"
        chiefName="مسؤول افتراضي"
        settings={settings}
      />
    );

    expect(markup).toContain("المقدم غسان صالح كنو");
    expect(markup).toContain("رئيس قسم شرطة الشهباء");
    expect(markup).toContain('class="mt-8 space-y-1 text-left');
    expect(markup.match(/<p /g)).toHaveLength(2);
    expect(markup).toContain('data-testid="document-signature-block"');
  });

  it("uses the approved two-line defaults", () => {
    const markup = renderToStaticMarkup(
      <DocumentSignatureBlock
        organizationName="قسم شرطة الشهباء"
        unitName=""
        chiefRank=""
        chiefName=""
        settings={DEFAULT_PLATFORM_DOCUMENT_SETTINGS}
      />
    );

    expect(markup).toContain("المقدم غسان صالح كنو");
    expect(markup).toContain("رئيس قسم شرطة الشهباء");
    expect(markup.match(/<p /g)).toHaveLength(2);
  });

  it("keeps each configured value editable without adding extra display lines", () => {
    const settings = {
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      headerTitle: "عميد",
      headerSubtitle: "اسم المسؤول",
      headerChiefRank: "رئيس",
      headerChiefName: "الوحدة",
    };
    const markup = renderToStaticMarkup(
      <DocumentSignatureBlock
        organizationName=""
        unitName=""
        chiefRank=""
        chiefName=""
        settings={settings}
      />
    );

    expect(markup).toContain("عميد اسم المسؤول");
    expect(markup).toContain("رئيس الوحدة");
    expect(markup.match(/<p /g)).toHaveLength(2);
  });
});
