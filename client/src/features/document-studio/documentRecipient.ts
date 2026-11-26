export const DOCUMENT_RECIPIENT_LINE_KEY = "document_recipient_line";

/**
 * Legacy keys are retained for reading documents created before the recipient
 * fields were combined into one freely editable line.
 */
export const DOCUMENT_RECIPIENT_LABEL_KEY = "document_recipient_label";
export const DOCUMENT_RECIPIENT_VALUE_KEY = "document_recipient";
export const DEFAULT_DOCUMENT_RECIPIENT_PLACEHOLDER = "إلى";

export function getDocumentRecipientLine(
  fieldValues: Readonly<Record<string, string>>
): string {
  const currentLine = fieldValues[DOCUMENT_RECIPIENT_LINE_KEY]?.trim();
  if (currentLine) return currentLine;

  const legacyLabel = fieldValues[DOCUMENT_RECIPIENT_LABEL_KEY]?.trim() ?? "";
  const legacyValue = fieldValues[DOCUMENT_RECIPIENT_VALUE_KEY]?.trim() ?? "";

  return [legacyLabel, legacyValue].filter(Boolean).join(" ");
}

/**
 * Store the unified recipient line and remove obsolete split fields.
 * Other template field values are preserved unchanged.
 */
export function withDocumentRecipientLine(
  fieldValues: Readonly<Record<string, string>>,
  recipientLine: string
): Record<string, string> {
  const nextValues = { ...fieldValues };
  delete nextValues[DOCUMENT_RECIPIENT_LABEL_KEY];
  delete nextValues[DOCUMENT_RECIPIENT_VALUE_KEY];

  const normalizedLine = recipientLine.trim();
  if (normalizedLine) {
    nextValues[DOCUMENT_RECIPIENT_LINE_KEY] = normalizedLine;
  } else {
    delete nextValues[DOCUMENT_RECIPIENT_LINE_KEY];
  }

  return nextValues;
}
