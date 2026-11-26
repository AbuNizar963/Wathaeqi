import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCUMENT_RECIPIENT_LABEL,
  DEFAULT_DOCUMENT_RECIPIENT_PLACEHOLDER,
  DOCUMENT_RECIPIENT_LABEL_KEY,
  DOCUMENT_RECIPIENT_LINE_KEY,
  DOCUMENT_RECIPIENT_VALUE_KEY,
  getDocumentRecipientFields,
  getDocumentRecipientLine,
  withDocumentRecipientLine,
} from "./documentRecipient";

describe("document recipient line", () => {
  it("shows an editable default suggestion without storing it", () => {
    expect(DEFAULT_DOCUMENT_RECIPIENT_PLACEHOLDER).toBe("إلى");
    expect(getDocumentRecipientLine({})).toBe("");
  });

  it("keeps the legacy split-field helper compatible", () => {
    expect(getDocumentRecipientFields({})).toEqual({
      label: DEFAULT_DOCUMENT_RECIPIENT_LABEL,
      value: "",
    });
    expect(
      getDocumentRecipientFields({
        [DOCUMENT_RECIPIENT_LABEL_KEY]: "  نسخة إلى  ",
        [DOCUMENT_RECIPIENT_VALUE_KEY]: "  الإدارة العامة  ",
      })
    ).toEqual({ label: "نسخة إلى", value: "الإدارة العامة" });
  });

  it("prefers the unified line when both new and legacy values exist", () => {
    expect(
      getDocumentRecipientLine({
        [DOCUMENT_RECIPIENT_LINE_KEY]: "السيد مدير القسم المحترم",
        [DOCUMENT_RECIPIENT_LABEL_KEY]: "إلى",
        [DOCUMENT_RECIPIENT_VALUE_KEY]: "الإدارة العامة",
      })
    ).toBe("السيد مدير القسم المحترم");
  });

  it("keeps older documents readable by combining their split values", () => {
    expect(
      getDocumentRecipientLine({
        [DOCUMENT_RECIPIENT_LABEL_KEY]: "إلى",
        [DOCUMENT_RECIPIENT_VALUE_KEY]: "الإدارة العامة",
      })
    ).toBe("إلى الإدارة العامة");
  });

  it("preserves unrelated template values while migrating legacy fields", () => {
    expect(
      withDocumentRecipientLine(
        {
          employee_name: "أحمد",
          [DOCUMENT_RECIPIENT_LABEL_KEY]: "إلى",
          [DOCUMENT_RECIPIENT_VALUE_KEY]: "الإدارة العامة",
        },
        "السيد مدير القسم"
      )
    ).toEqual({
      employee_name: "أحمد",
      [DOCUMENT_RECIPIENT_LINE_KEY]: "السيد مدير القسم",
    });
  });

  it("does not persist an empty recipient line", () => {
    expect(
      withDocumentRecipientLine(
        { [DOCUMENT_RECIPIENT_LINE_KEY]: "إلى الإدارة" },
        "   "
      )
    ).toEqual({});
  });
});
