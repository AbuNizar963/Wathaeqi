import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  type PlatformDocumentSettings,
} from "@shared/features/platform-settings/platformDocumentSettings";
import DocumentSignatureBlock from "./DocumentSignatureBlock";

describe("DocumentSignatureBlock", () => {
  it("renders the four configured lines in order as a right-aligned footer", () => {
    const settings: PlatformDocumentSettings = {
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      headerTitle: "العنوان الرئيسي",
      headerSubtitle: "العنوان الفرعي / اسم الوحدة",
      headerChiefRank: "رتبة / صفة المسؤول",
      headerChiefName: "اسم المسؤول",
    };
    const markup = renderToStaticMarkup(
      <DocumentSignatureBlock
        organizationName="جهة افتراضية"
        unitName="وحدة افتراضية"
        chiefRank="رتبة افتراضية"
        chiefName="مسؤول افتراضي"
        settings={settings}
      />
    );

    const labels = [
      "العنوان الرئيسي",
      "العنوان الفرعي / اسم الوحدة",
      "رتبة / صفة المسؤول",
      "اسم المسؤول",
    ];
    let previousIndex = -1;
    for (const label of labels) {
      const currentIndex = markup.indexOf(label);
      expect(currentIndex).toBeGreaterThan(previousIndex);
      previousIndex = currentIndex;
    }
    expect(markup).toContain('data-testid="document-signature-block"');
    expect(markup).toContain('dir="rtl"');
    expect(markup).toContain("text-right");
  });

  it("uses the saved organization values when optional overrides are empty", () => {
    const markup = renderToStaticMarkup(
      <DocumentSignatureBlock
        organizationName="اسم الجهة"
        unitName="اسم الوحدة"
        chiefRank="الرتبة"
        chiefName="اسم المسؤول"
        settings={DEFAULT_PLATFORM_DOCUMENT_SETTINGS}
      />
    );
    expect(markup).toContain("اسم الجهة");
    expect(markup).toContain("اسم الوحدة");
    expect(markup).toContain("الرتبة");
    expect(markup).toContain("اسم المسؤول");
  });

  it("does not render an empty signature block", () => {
    const markup = renderToStaticMarkup(
      <DocumentSignatureBlock
        organizationName=""
        unitName=""
        chiefRank=""
        chiefName=""
        settings={DEFAULT_PLATFORM_DOCUMENT_SETTINGS}
      />
    );
    expect(markup).toBe("");
  });
});
