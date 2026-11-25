import { useEffect, useRef, useState } from "react";
import {
  buildDocumentWatermarkCss,
  DOCUMENT_WATERMARK_COLUMNS,
  DOCUMENT_WATERMARK_ROWS,
  getA4PreviewPageCount,
} from "./documentWatermark";

export type DocumentWatermarkProps = {
  logoUrl: string | null;
  watermarkText: string;
  opacityPercent: number;
  scalePercent: number;
  showMinistryText: boolean;
};

/** Shared watermark layer used by the live A4 preview, print and export. */
export default function DocumentWatermark({
  logoUrl,
  watermarkText,
  opacityPercent,
  scalePercent,
  showMinistryText,
}: DocumentWatermarkProps) {
  const watermarkCss = buildDocumentWatermarkCss(
    opacityPercent / 100,
    scalePercent / 100
  );
  const layerRef = useRef<HTMLDivElement>(null);
  const [pageMetrics, setPageMetrics] = useState({ count: 1, height: 0 });

  useEffect(() => {
    const layer = layerRef.current;
    const page = layer?.parentElement;
    if (!page) return;

    const updatePageMetrics = () => {
      const width = page.clientWidth;
      if (width <= 0) return;
      const pageHeight = (width * 297) / 210;
      const pageCount = getA4PreviewPageCount(
        width,
        Math.max(page.scrollHeight, page.clientHeight)
      );
      page.style.setProperty("--document-page-height", `${pageHeight}px`);
      setPageMetrics(current =>
        current.count === pageCount && Math.abs(current.height - pageHeight) < 1
          ? current
          : { count: pageCount, height: pageHeight }
      );
    };

    const observer = new ResizeObserver(updatePageMetrics);
    observer.observe(page);
    updatePageMetrics();
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style>{watermarkCss}</style>
      <div
        ref={layerRef}
        className="document-watermark-layer"
        aria-hidden="true"
      >
        {Array.from({ length: pageMetrics.count }, (_, pageIndex) => (
          <div
            key={pageIndex}
            className="page-watermark"
            style={{
              top: pageIndex * pageMetrics.height,
              width: "100%",
              height: pageMetrics.height || undefined,
            }}
          >
            {showMinistryText ? (
              <div className="watermark-text-pattern">
                {Array.from({ length: DOCUMENT_WATERMARK_ROWS }, (_, row) => (
                  <div
                    key={row}
                    className={
                      row % 2
                        ? "watermark-text-row watermark-text-row-offset"
                        : "watermark-text-row"
                    }
                  >
                    {Array.from(
                      { length: DOCUMENT_WATERMARK_COLUMNS },
                      (_, column) => (
                        <span key={column}>{watermarkText}</span>
                      )
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            {logoUrl ? (
              <img
                className="watermark-logo"
                src={logoUrl}
                alt=""
                decoding="async"
              />
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
