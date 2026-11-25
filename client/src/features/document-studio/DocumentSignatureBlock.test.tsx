import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  type PlatformDocumentSettings,
} from "@shared/features/platform-settings/platformDocumentSettings";
import DocumentSignatureBlock from "./DocumentSignatureBlock";

describe("DocumentSignatureBlock", () => {
  it("renders the two configured responsible-person lines centered below the body", () => {
    const settings: PlatformDocumentSettings = {
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      headerTitle: "المقدم غسان صالح كنو",
      headerSubtitle: "رئيس قسم الشهباء",
      headerChiefRank: "قيمة قديمة لا تعرض",
      headerChiefName: "قيمة قديمة لا تعرض",
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

    const first = markup.indexOf("المقدم غسان صالح كنو");
    const second = markup.indexOf("رئيس قسم الشهباء");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(markup).not.toContain("قيمة قديمة لا تعرض");
    expect(markup).toContain('data-testid="document-signature-block"');
    expect(markup).toContain('dir="rtl"');
    expect(markup).toContain('class="mt-8 space-y-1 text-center');
  });

  it("uses the approved defaults when the two editable fields are empty", () => {
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
    expect(markup).toContain("رئيس قسم الشهباء");
  });

  it("adds the رئيس prefix to a configured unit description only once", () => {
    const settings = {
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      headerSubtitle: "قسم الشهباء",
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
    expect(markup).toContain("رئيس قسم الشهباء");
    expect(markup).not.toContain("رئيس رئيس");
  });
});
