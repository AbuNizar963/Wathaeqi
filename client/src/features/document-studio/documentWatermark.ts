export const OFFICIAL_ORGANIZATION_NAME = "وثائقي";
export const DOCUMENT_WATERMARK_ROWS = 7;
export const DOCUMENT_WATERMARK_COLUMNS = 3;

export function buildDocumentWatermarkCss(opacity: number): string {
  const safeOpacity = Math.min(0.35, Math.max(0.02, opacity));
  return `
    .page-watermark {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      opacity: ${safeOpacity};
      pointer-events: none;
    }
    .watermark-text-pattern {
      position: absolute;
      inset: -12%;
      display: flex;
      flex-direction: column;
      justify-content: space-around;
      transform: rotate(-28deg);
    }
    .watermark-text-row {
      display: flex;
      justify-content: space-around;
      gap: 28px;
      color: #0f172a;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    .watermark-text-row-offset {
      transform: translateX(52px);
    }
    .watermark-logo {
      position: relative;
      z-index: 1;
      width: 34%;
      max-height: 34%;
      object-fit: contain;
      opacity: 0.55;
    }
  `;
}
