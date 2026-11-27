export function normalizeDocxLayout(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>("img").forEach(image => {
    const container = image.parentElement;
    if (!container || image.naturalWidth <= 0 || image.naturalHeight <= 0)
      return;

    const page = image.closest<HTMLElement>(".docx");
    if (page && container !== page) {
      const pageRect = page.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      const preview = image.closest<HTMLElement>(".document-word-preview");
      const zoom =
        Number.parseFloat(window.getComputedStyle(preview ?? page).zoom) || 1;
      const horizontalCorrection =
        imageRect.right > pageRect.right
          ? pageRect.right - imageRect.right
          : imageRect.left < pageRect.left
            ? pageRect.left - imageRect.left
            : 0;

      // Floating Word drawings can inherit a wider RTL paragraph than the
      // rendered A4 sheet. Keep the original image intact and move only its
      // relative wrapper back inside the page when that happens.
      if (horizontalCorrection) {
        const currentLeft =
          Number.parseFloat(window.getComputedStyle(container).left) || 0;
        container.style.left = `${currentLeft + horizontalCorrection / zoom}px`;
      }
    }

    const containerWidth = container.getBoundingClientRect().width;
    const imageRect = image.getBoundingClientRect();
    if (containerWidth > 0 && imageRect.width > 0 && imageRect.height > 0)
      return;

    const computedImage = window.getComputedStyle(image);
    const computedWidth = Number.parseFloat(computedImage.width);
    const computedHeight = Number.parseFloat(computedImage.height);
    const height =
      imageRect.height ||
      computedHeight ||
      Number.parseFloat(image.getAttribute("height") ?? "") ||
      image.naturalHeight;
    const width =
      imageRect.width ||
      computedWidth ||
      Number.parseFloat(image.getAttribute("width") ?? "") ||
      height * (image.naturalWidth / image.naturalHeight);

    container.style.display = "inline-block";
    container.style.position = "relative";
    container.style.overflow = "visible";
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    image.style.display = "block";
    image.style.width = `${width}px`;
    image.style.height = `${height}px`;
  });
}
