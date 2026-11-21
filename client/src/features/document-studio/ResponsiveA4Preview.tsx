import { useEffect, useRef, useState, type ReactNode } from "react";

const A4_PREVIEW_WIDTH = 794;
const A4_PREVIEW_MIN_HEIGHT = 1123;

type ResponsiveA4PreviewProps = {
  children: ReactNode;
  pageRef?: { current: HTMLDivElement | null };
};

/**
 * Keeps the document at its native A4 layout width and scales only the
 * on-screen presentation to the available viewport. Print styles can still
 * use the untransformed physical page dimensions.
 */
export default function ResponsiveA4Preview({
  children,
  pageRef,
}: ResponsiveA4PreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const internalPageRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({
    scale: 1,
    height: A4_PREVIEW_MIN_HEIGHT,
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    const page = internalPageRef.current;
    if (!viewport || !page) return;

    if (pageRef) pageRef.current = page;

    const updateLayout = () => {
      const availableWidth = viewport.clientWidth;
      if (availableWidth <= 0) return;

      const scale = Math.min(1, availableWidth / A4_PREVIEW_WIDTH);
      const pageHeight = Math.max(
        A4_PREVIEW_MIN_HEIGHT,
        page.scrollHeight,
        page.offsetHeight,
      );

      setLayout({
        scale,
        height: Math.ceil(pageHeight * scale),
      });
    };

    updateLayout();
    const observer = new ResizeObserver(updateLayout);
    observer.observe(viewport);
    observer.observe(page);

    return () => {
      observer.disconnect();
      if (pageRef?.current === page) pageRef.current = null;
    };
  }, [pageRef]);

  return (
    <div
      ref={viewportRef}
      className="document-paper-viewport document-a4-preview-viewport"
      style={{
        position: "relative",
        width: "100%",
        height: layout.height,
        overflow: "hidden",
      }}
    >
      <div
        ref={internalPageRef}
        className="document-a4-page document-a4-preview-page"
        style={{
          width: A4_PREVIEW_WIDTH,
          minWidth: A4_PREVIEW_WIDTH,
          maxWidth: "none",
          minHeight: A4_PREVIEW_MIN_HEIGHT,
          position: "absolute",
          left: "50%",
          transform: `translateX(-50%) scale(${layout.scale})`,
          transformOrigin: "top center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
