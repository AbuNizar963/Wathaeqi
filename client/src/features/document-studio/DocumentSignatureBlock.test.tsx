import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  type PlatformDocumentSettings,
} from "@shared/features/platform-settings/platformDocumentSettings";
import DocumentSignatureBlock from "./DocumentSignatureBlock";

function render(settings: PlatformDocumentSettings): string {
  return renderToStaticMarkup(
    <DocumentSignatureBlock
      organizationName="قسم شرطة الشهباء"
      unitName="وحدة افتراضية"
      chiefRank="رتبة افتراضية"
      chiefName="مسؤول افتراضي"
      settings={settings}
    />
  );
}

describe("DocumentSignatureBlock", () => {
  it("renders the signer name above the organizational role", () => {
    const markup = render({
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      headerTitle: "المقدم",
      headerSubtitle: "غسان صالح كنو",
      headerChiefRank: "رئيس قسم شرطة",
      headerChiefName: "الشهباء",
    });
    const signerIndex = markup.indexOf("المقدم غسان صالح كنو");
    const roleIndex = markup.indexOf("رئيس قسم شرطة الشهباء");

    expect(signerIndex).toBeGreaterThan(-1);
    expect(roleIndex).toBeGreaterThan(signerIndex);
    expect(markup).toContain('data-testid="document-signature-block"');
    expect(markup).toContain("width:min(48%, 320px)");
    expect(markup).toContain("margin-right:auto");
    expect(markup.match(/<p /g)).toHaveLength(2);
  });

  it("uses the approved two-line defaults", () => {
    const markup = render(DEFAULT_PLATFORM_DOCUMENT_SETTINGS);
    const signerIndex = markup.indexOf("المقدم غسان صالح كنو");
    const roleIndex = markup.indexOf("رئيس قسم شرطة الشهباء");

    expect(signerIndex).toBeGreaterThan(-1);
    expect(roleIndex).toBeGreaterThan(signerIndex);
    expect(markup.match(/<p /g)).toHaveLength(2);
  });

  it("corrects saved role and signer fields that are reversed", () => {
    const markup = render({
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      headerTitle: "رئيس قسم شرطة",
      headerSubtitle: "الشهباء",
      headerChiefRank: "المقدم",
      headerChiefName: "غسان صالح كنو",
    });
    const signerIndex = markup.indexOf("المقدم غسان صالح كنو");
    const roleIndex = markup.indexOf("رئيس قسم شرطة الشهباء");

    expect(signerIndex).toBeGreaterThan(-1);
    expect(roleIndex).toBeGreaterThan(signerIndex);
    expect(markup.match(/<p /g)).toHaveLength(2);
  });

  it("keeps custom signer and role values as two centered lines", () => {
    const markup = render({
      ...DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
      headerTitle: "عميد",
      headerSubtitle: "اسم المسؤول",
      headerChiefRank: "رئيس",
      headerChiefName: "الوحدة",
    });

    expect(markup).toContain("عميد اسم المسؤول");
    expect(markup).toContain("رئيس الوحدة");
    expect(markup.match(/<p /g)).toHaveLength(2);
    expect(markup).toContain("text-center");
  });
});
