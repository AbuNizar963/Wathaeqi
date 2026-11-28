export function showDocumentEditorPrintCopies(
  element: HTMLElement
): () => void {
  const editors = Array.from(
    element.querySelectorAll<HTMLTextAreaElement>(".document-editor-input")
  );
  const copies = Array.from(
    element.querySelectorAll<HTMLTextAreaElement>(".document-editor-print-copy")
  );
  const previous = copies.map(copy => ({
    display: copy.style.display,
    height: copy.style.height,
  }));

  copies.forEach((copy, index) => {
    const editor = editors[index];
    if (editor) {
      const minHeight = Number.parseFloat(
        window.getComputedStyle(editor).minHeight
      );
      const contentHeight = Math.max(
        editor.scrollHeight,
        Number.isFinite(minHeight) ? minHeight : 0
      );
      copy.style.height = `${contentHeight}px`;
    }
    copy.style.display = "block";
  });

  return () => {
    copies.forEach((copy, index) => {
      copy.style.display = previous[index]?.display ?? "";
      copy.style.height = previous[index]?.height ?? "";
    });
  };
}
