import { useId, type CSSProperties } from "react";
import {
  getProfessionalDocumentFramePreset,
  type DocumentFrameMotif,
  type DocumentFrameStyle,
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

type RenderedFrame = {
  motif: DocumentFrameMotif;
  lineCount: 1 | 2 | 3;
  dash: "solid" | "dashed" | "dotted";
};

function resolveFrame(frameStyle: DocumentFrameStyle): RenderedFrame {
  const preset = getProfessionalDocumentFramePreset(frameStyle);
  if (preset) return preset;

  switch (frameStyle) {
    case "double":
    case "classic":
      return { motif: "classic", lineCount: 2, dash: "solid" };
    case "ornate":
      return { motif: "academic", lineCount: 2, dash: "solid" };
    case "triple":
      return { motif: "imperial", lineCount: 3, dash: "solid" };
    case "none":
      return { motif: "minimal", lineCount: 1, dash: "solid" };
    case "single":
    default:
      return { motif: "minimal", lineCount: 1, dash: "solid" };
  }
}

function CornerMotif({ motif }: { motif: DocumentFrameMotif }) {
  switch (motif) {
    case "minimal":
      return <path d="M22 152V48Q22 22 48 22H152" />;
    case "classic":
      return (
        <>
          <path d="M22 152V50Q22 22 50 22H152M42 124V58Q42 42 58 42H124" />
          <circle cx="52" cy="52" r="4" fill="currentColor" stroke="none" />
        </>
      );
    case "deco":
      return (
        <>
          <path d="M20 154V52H52V20H154M34 136V66H66V34H136M54 112V76H76V54H112" />
          <path d="M24 86 86 24M42 86 86 42" />
          <rect
            x="43"
            y="43"
            width="11"
            height="11"
            transform="rotate(45 48.5 48.5)"
          />
        </>
      );
    case "arabesque":
      return (
        <>
          <path d="M22 152V72C22 44 43 22 72 22H152M48 126C48 105 66 103 66 84C66 68 52 62 52 49C52 36 64 31 78 36C96 42 95 61 112 61C127 61 132 49 124 39" />
          <path d="M61 123C80 123 81 105 98 105C113 105 115 116 108 128" />
          <circle cx="52" cy="52" r="4" />
        </>
      );
    case "academic":
      return (
        <>
          <path d="M22 152V56Q22 22 56 22H152M40 126V58Q40 40 58 40H126" />
          <path d="M28 106C42 104 45 92 45 78M106 28C104 42 92 45 78 45" />
          <circle cx="49" cy="49" r="8" />
          <circle cx="49" cy="49" r="2.5" fill="currentColor" stroke="none" />
        </>
      );
    case "geometric":
      return (
        <>
          <path d="M22 152V54L54 22H152M40 132V62L62 40H132" />
          <path d="M27 88 88 27M46 88 88 46M27 108 108 27" />
          <path d="m48 48 8-8 8 8-8 8z" />
        </>
      );
    case "botanical":
      return (
        <>
          <path d="M22 152V78C22 43 43 22 78 22H152M40 128C58 110 60 81 78 61C91 46 109 43 128 42" />
          <path d="M51 113C35 109 35 96 39 87C53 88 61 97 51 113ZM68 82C53 76 55 62 62 54C76 58 80 70 68 82ZM94 58C84 44 92 34 102 30C113 40 111 52 94 58ZM105 50C111 35 124 35 133 40C130 54 119 61 105 50Z" />
        </>
      );
    case "diplomatic":
      return (
        <>
          <path d="M22 152V50Q22 22 50 22H152M38 130V58Q38 38 58 38H130" />
          <path d="m50 50 13-13 13 13-13 13zM91 34h26M91 43h18M34 91v26M43 91v18" />
          <circle cx="63" cy="50" r="2.5" fill="currentColor" stroke="none" />
        </>
      );
    case "imperial":
      return (
        <>
          <path d="M22 152V52Q22 22 52 22H152M34 136V58Q34 34 58 34H136M46 120V64Q46 46 64 46H120" />
          <path d="M46 92C63 92 70 84 70 68C70 52 82 46 94 50C107 55 107 71 96 78C84 86 87 101 102 101" />
          <path d="m52 52 3-8 3 8 8 3-8 3-3 8-3-8-8-3z" />
        </>
      );
    case "official":
      return (
        <>
          <path
            d="M22 152V52Q22 22 52 22H152M38 128V58Q38 38 58 38H128"
            strokeDasharray="7 4"
          />
          <path d="M28 100V54Q28 28 54 28H100M44 82V62Q44 44 62 44H82" />
          <rect x="43" y="43" width="12" height="12" rx="2" />
        </>
      );
  }
}

export default function DocumentFrameDecoration({
  frameStyle,
  frameColor,
  frameWidthPt,
  pageHeightPx = A4_FRAME_HEIGHT,
  className = "",
}: DocumentFrameDecorationProps) {
  const patternId = `document-frame-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (frameStyle === "none") return null;

  const frame = resolveFrame(frameStyle);
  const svgHeight =
    Math.ceil(Math.max(A4_FRAME_HEIGHT, pageHeightPx) / A4_FRAME_HEIGHT) *
    A4_FRAME_HEIGHT;
  const strokeWidth = Math.max(0.9, Math.min(5, frameWidthPt * 1.333));
  const dashArray =
    frame.dash === "dashed"
      ? "10 6"
      : frame.dash === "dotted"
        ? "2 6"
        : undefined;
  const style: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: 2,
    color: frameColor,
  };

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-document-frame={frameStyle}
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
          <rect
            x="20"
            y="20"
            width="754"
            height="1083"
            fill="none"
            stroke={frameColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
          />
          {frame.lineCount >= 2 ? (
            <rect
              x="31"
              y="31"
              width="732"
              height="1061"
              fill="none"
              stroke={frameColor}
              strokeOpacity="0.78"
              strokeWidth={Math.max(0.8, strokeWidth * 0.78)}
            />
          ) : null}
          {frame.lineCount >= 3 ? (
            <rect
              x="42"
              y="42"
              width="710"
              height="1039"
              fill="none"
              stroke={frameColor}
              strokeOpacity="0.62"
              strokeWidth={Math.max(0.7, strokeWidth * 0.62)}
            />
          ) : null}
          {[
            "",
            "translate(794 0) scale(-1 1)",
            "translate(0 1123) scale(1 -1)",
            "translate(794 1123) scale(-1 -1)",
          ].map((transform, index) => (
            <g
              key={index}
              transform={transform || undefined}
              fill="none"
              stroke={frameColor}
              strokeWidth={Math.max(0.8, strokeWidth * 0.9)}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <CornerMotif motif={frame.motif} />
            </g>
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
