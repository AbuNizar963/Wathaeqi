import { useId, type CSSProperties } from "react";
import {
  getWordDocumentFrameStyle,
  type DocumentFrameStyle,
  type WordDocumentFrameStyle,
} from "@shared/features/platform-settings/platformDocumentSettings";

type DocumentFrameDecorationProps = {
  frameStyle: DocumentFrameStyle;
  frameColor: string;
  frameWidthPt: number;
  pageHeightPx?: number;
  className?: string;
};

const A4_FRAME_WIDTH = 794;
const A4_FRAME_HEIGHT = 1123;

function PageBorder({
  style,
  color,
  strokeWidth,
}: {
  style: WordDocumentFrameStyle;
  color: string;
  strokeWidth: number;
}) {
  if (style === "none") return null;

  if (style === "shadow") {
    return (
      <>
        <rect
          x="31"
          y="31"
          width="742"
          height="1062"
          fill="none"
          stroke="#64748b"
          strokeOpacity="0.75"
          strokeWidth={strokeWidth}
        />
        <rect
          x="20"
          y="20"
          width="742"
          height="1062"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
        />
      </>
    );
  }

  if (style === "three-dimensional") {
    return (
      <>
        <rect
          x="20"
          y="20"
          width="754"
          height="1083"
          fill="none"
          stroke="#475569"
          strokeWidth={strokeWidth}
        />
        <path
          d="M28 1094V28H766"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.9"
          strokeWidth={Math.max(0.8, strokeWidth * 0.8)}
        />
        <path
          d="M766 28V1094H28"
          fill="none"
          stroke={color}
          strokeWidth={Math.max(0.8, strokeWidth * 0.8)}
        />
      </>
    );
  }

  if (style === "double") {
    return (
      <>
        <rect
          x="20"
          y="20"
          width="754"
          height="1083"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
        />
        <rect
          x="31"
          y="31"
          width="732"
          height="1061"
          fill="none"
          stroke={color}
          strokeOpacity="0.82"
          strokeWidth={Math.max(0.7, strokeWidth * 0.75)}
        />
      </>
    );
  }

  return (
    <rect
      x="20"
      y="20"
      width="754"
      height="1083"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
    />
  );
}

export default function DocumentFrameDecoration({
  frameStyle,
  frameColor,
  frameWidthPt,
  pageHeightPx = A4_FRAME_HEIGHT,
  className = "",
}: DocumentFrameDecorationProps) {
  const patternId = `document-page-border-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const selectedStyle = getWordDocumentFrameStyle(frameStyle);

  if (selectedStyle === "none") return null;

  const svgHeight =
    Math.ceil(Math.max(A4_FRAME_HEIGHT, pageHeightPx) / A4_FRAME_HEIGHT) *
    A4_FRAME_HEIGHT;
  const strokeWidth = Math.max(0.9, Math.min(5, frameWidthPt * 1.333));
  const style: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: 2,
  };

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-document-frame={selectedStyle}
      className={className}
      viewBox={`0 0 ${A4_FRAME_WIDTH} ${svgHeight}`}
      preserveAspectRatio="none"
      style={style}
    >
      <defs>
        <pattern
          id={patternId}
          x="0"
          y="0"
          width={A4_FRAME_WIDTH}
          height={A4_FRAME_HEIGHT}
          patternUnits="userSpaceOnUse"
          patternContentUnits="userSpaceOnUse"
        >
          <PageBorder
            style={selectedStyle}
            color={frameColor}
            strokeWidth={strokeWidth}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
