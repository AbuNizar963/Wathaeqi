import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import type { PlatformDocumentSettings } from "@shared/features/platform-settings/platformDocumentSettings";

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
  });
  const [zoom, setZoom] = useState(1);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(
    null
  );

  const clampZoom = (value: number) =>
    Math.min(2.5, Math.max(0.75, Math.round(value * 100) / 100));

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;
    const [first, second] = Array.from(event.touches);
    pinchStartRef.current = {
      distance: Math.hypot(
        second.clientX - first.clientX,
        second.clientY - first.clientY
      ),
      zoom,
    };
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = pinchStartRef.current;
    if (!start || event.touches.length !== 2) return;
    event.preventDefault();
    const [first, second] = Array.from(event.touches);
    const distance = Math.hypot(
      second.clientX - first.clientX,
      second.clientY - first.clientY
    );
    if (start.distance > 0) {
      setZoom(clampZoom(start.zoom * (distance / start.distance)));
    }
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) pinchStartRef.current = null;
  };

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
        page.offsetHeight
      );

      setLayout({ scale, height: Math.ceil(pageHeight * scale) });
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
        height: Math.ceil(layout.height * zoom),
        overflow: zoom > 1 ? "auto" : "hidden",
        touchAction: "pan-y",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div
        className="document-studio-no-print absolute left-2 top-2 z-20 flex items-center gap-1 rounded-lg border bg-white/95 p-1 shadow-sm"
        role="group"
        aria-label="تكبير معاينة الورقة"
        dir="ltr"
      >
        <button
          type="button"
          className="h-8 w-8 rounded-md text-lg font-semibold hover:bg-slate-100 disabled:opacity-40"
          aria-label="تصغير المعاينة"
          disabled={zoom <= 0.75}
          onClick={() => setZoom(current => clampZoom(current - 0.15))}
        >
          −
        </button>
        <span className="min-w-12 text-center text-xs tabular-nums text-slate-700">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          className="h-8 w-8 rounded-md text-lg font-semibold hover:bg-slate-100 disabled:opacity-40"
          aria-label="تكبير المعاينة"
          disabled={zoom >= 2.5}
          onClick={() => setZoom(current => clampZoom(current + 0.15))}
        >
          +
        </button>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs font-medium hover:bg-slate-100"
          aria-label="إعادة ضبط التكبير"
          onClick={() => setZoom(1)}
        >
          ملاءمة
        </button>
      </div>
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
          transform: `translateX(-50%) scale(${layout.scale * zoom})`,
          transformOrigin: "top center",
          padding: `${settings?.pageMarginTopMm ?? 10}mm ${settings?.pageMarginRightMm ?? 10}mm ${settings?.pageMarginBottomMm ?? 10}mm ${settings?.pageMarginLeftMm ?? 10}mm`,
          boxSizing: "border-box",
          border:
            settings?.frameStyle === "none"
              ? "none"
              : `${settings?.frameWidthPt ?? 1}pt ${settings?.frameStyle === "double" ? "double" : settings?.frameStyle === "ornate" ? "double" : "solid"} ${settings?.frameColor ?? "#b49a55"}`,
          boxShadow:
            settings?.frameStyle === "ornate"
              ? `inset 0 0 0 3px #fff, inset 0 0 0 4px ${settings.frameColor}`
              : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
