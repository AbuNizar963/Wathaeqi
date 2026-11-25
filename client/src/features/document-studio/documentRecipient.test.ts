import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCUMENT_RECIPIENT_LABEL,
  DOCUMENT_RECIPIENT_LABEL_KEY,
  DOCUMENT_RECIPIENT_VALUE_KEY,
  getDocumentRecipientFields,
} from "./documentRecipient";

describe("document recipient fields", () => {
  it("defaults the routing label to إلى for older and new documents", () => {
    expect(getDocumentRecipientFields({})).toEqual({
      label: DEFAULT_DOCUMENT_RECIPIENT_LABEL,
      value: "",
    });
    expect(
      getDocumentRecipientFields({ [DOCUMENT_RECIPIENT_LABEL_KEY]: "  " }).label
    ).toBe("إلى");
  });

  it("returns trimmed custom routing labels and recipient values", () => {
    expect(
      getDocumentRecipientFields({
        [DOCUMENT_RECIPIENT_LABEL_KEY]: "  نسخة إلى  ",
        [DOCUMENT_RECIPIENT_VALUE_KEY]: "  الإدارة العامة  ",
      })
    ).toEqual({ label: "نسخة إلى", value: "الإدارة العامة" });
  });
});
