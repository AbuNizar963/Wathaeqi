export function normalizeDocxLayout(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>("img").forEach(image => {
    const container = image.parentElement;
    if (!container || image.naturalWidth <= 0 || image.naturalHeight <= 0)
      return;

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
