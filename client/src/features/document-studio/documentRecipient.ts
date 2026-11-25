export const DOCUMENT_RECIPIENT_LABEL_KEY = "document_recipient_label";
export const DOCUMENT_RECIPIENT_VALUE_KEY = "document_recipient";
export const DEFAULT_DOCUMENT_RECIPIENT_LABEL = "إلى";

export type DocumentRecipientFields = {
  label: string;
  value: string;
};

export function getDocumentRecipientFields(
  fieldValues: Record<string, string>
): DocumentRecipientFields {
  return {
    label:
      fieldValues[DOCUMENT_RECIPIENT_LABEL_KEY]?.trim() ||
      DEFAULT_DOCUMENT_RECIPIENT_LABEL,
    value: fieldValues[DOCUMENT_RECIPIENT_VALUE_KEY]?.trim() ?? "",
  };
}
