import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PlatformDocumentSettings } from "@shared/features/platform-settings/platformDocumentSettings";
import DocumentFrameDecoration from "./DocumentFrameDecoration";

const A4_PREVIEW_WIDTH = 794;
const A4_PREVIEW_MIN_HEIGHT = 1123;

type ResponsiveA4PreviewProps = {
  children: ReactNode;
  pageRef?: { current: HTMLDivElement | null };
  settings?: PlatformDocumentSettings;
};

/**
 * Keeps the document at its native A4 layout width and scales only the
 * on-screen presentation to the available viewport. Print styles can still
 * use the untransformed physical page dimensions.
 */
export default function ResponsiveA4Preview({
  children,
  pageRef,
  settings,
}: ResponsiveA4PreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const internalPageRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({
    scale: 1,
    height: A4_PREVIEW_MIN_HEIGHT,
    pageHeight: A4_PREVIEW_MIN_HEIGHT,
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
      const contentHeight = Math.max(
        A4_PREVIEW_MIN_HEIGHT,
        page.scrollHeight,
        page.offsetHeight
      );
      const pageHeight =
        Math.ceil(contentHeight / A4_PREVIEW_MIN_HEIGHT) *
        A4_PREVIEW_MIN_HEIGHT;

      setLayout({ scale, height: Math.ceil(pageHeight * scale), pageHeight });
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

  const pagePadding = [
    `${settings?.pageMarginTopMm ?? 10}mm`,
    `${settings?.pageMarginRightMm ?? 10}mm`,
    `${settings?.pageMarginBottomMm ?? 10}mm`,
    `${settings?.pageMarginLeftMm ?? 10}mm`,
  ].join(" ");
  return (
    <div
      ref={viewportRef}
      className="document-paper-viewport document-a4-preview-viewport"
      style={{
        position: "relative",
        width: "100%",
        height: layout.height,
        overflow: "hidden",
        touchAction: "pan-y",
      }}
    >
      <div
        ref={internalPageRef}
        className="document-a4-page document-a4-preview-page"
        style={{
          width: A4_PREVIEW_WIDTH,
          minWidth: A4_PREVIEW_WIDTH,
          maxWidth: "none",
          minHeight: layout.pageHeight,
          position: "absolute",
          left: "50%",
          transform: `translateX(-50%) scale(${layout.scale})`,
          transformOrigin: "top center",
          padding: pagePadding,
          boxSizing: "border-box",
          border: "none",
          boxShadow: "none",
        }}
      >
        <DocumentFrameDecoration
          frameStyle={settings?.frameStyle ?? "box"}
          frameColor={settings?.frameColor ?? "#b49a55"}
          frameWidthPt={settings?.frameWidthPt ?? 1}
          pageHeightPx={layout.pageHeight}
        />
        {children}
      </div>
    </div>
  );
}
