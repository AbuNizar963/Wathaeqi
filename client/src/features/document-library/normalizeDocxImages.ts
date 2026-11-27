export function normalizeDocxLayout(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>("img").forEach(image => {
    const container = image.parentElement;
    if (!container || image.naturalWidth <= 0 || image.naturalHeight <= 0)
      return;

    const containerWidth = container.getBoundingClientRect().width;
    if (containerWidth > 0) return;

    const computedImage = window.getComputedStyle(image);
    const height =
      Number.parseFloat(computedImage.height) ||
      image.getBoundingClientRect().height ||
      image.naturalHeight;
    const width = height * (image.naturalWidth / image.naturalHeight);

    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    image.style.width = `${width}px`;
    image.style.height = `${height}px`;
  });
}
