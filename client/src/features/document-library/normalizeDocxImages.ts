export function normalizeDocxImageLayout(root: ParentNode): void {
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

    const page = image.closest<HTMLElement>(".docx");
    if (!page) return;
    const pageRect = page.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const imageIsOutsidePage =
      imageRect.left < pageRect.left || imageRect.right > pageRect.right;
    if (!imageIsOutsidePage) return;

    const pageScale = pageRect.width / Math.max(1, page.scrollWidth);
    const correction =
      (pageRect.left +
        pageRect.width / 2 -
        (imageRect.left + imageRect.width / 2)) /
      Math.max(pageScale, 0.01);
    container.style.transform = `translateX(${correction}px)`;
  });
}
