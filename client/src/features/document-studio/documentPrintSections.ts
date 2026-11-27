export type DocumentPrintVisibility = {
  showHeader: boolean;
  showFooter: boolean;
};

/**
 * Applies temporary visibility to the official document sections.
 * The returned cleanup restores each element's exact inline display value.
 */
export function applyDocumentPrintVisibility(
  root: ParentNode,
  visibility: DocumentPrintVisibility
): () => void {
  const elements: HTMLElement[] = [];

  if (!visibility.showHeader) {
    elements.push(
      ...root.querySelectorAll<HTMLElement>(
        '[data-document-print-section="header"]'
      )
    );
  }

  if (!visibility.showFooter) {
    elements.push(
      ...root.querySelectorAll<HTMLElement>(
        '[data-document-print-section="footer"]'
      )
    );
  }

  const previousDisplay = elements.map(element => element.style.display);
  elements.forEach(element => {
    element.style.display = "none";
  });

  return () => {
    elements.forEach((element, index) => {
      element.style.display = previousDisplay[index] ?? "";
    });
  };
}
