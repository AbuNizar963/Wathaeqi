import { cn } from "@/lib/utils";

type BrandMarkProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  imageClassName?: string;
  showLabel?: boolean;
  compactLabel?: boolean;
};

const sizeClasses = {
  sm: "h-10 w-10 rounded-xl",
  md: "h-11 w-11 rounded-2xl",
  lg: "h-16 w-16 rounded-[1.35rem]",
} as const;

export function BrandMark({
  size = "md",
  className,
  imageClassName,
  showLabel = false,
  compactLabel = false,
}: BrandMarkProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "brand-mark shrink-0 overflow-hidden border border-white/15 bg-[#102e3c] shadow-[0_10px_26px_rgba(16,46,60,0.18)]",
          sizeClasses[size]
        )}
      >
        <svg
          viewBox="0 0 64 64"
          role="img"
          aria-label="رمز وثائقي"
          className={cn("h-full w-full p-1.5", imageClassName)}
        >
          <path
            d="M32 4 53 11v16c0 16-8.7 26.8-21 33C19.7 53.8 11 43 11 27V11L32 4Z"
            fill="none"
            stroke="#41c6b2"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M22 17.5a2.5 2.5 0 0 1 2.5-2.5h10l7 7v21H24.5a2.5 2.5 0 0 1-2.5-2.5v-23Z"
            fill="#fffaf0"
          />
          <path d="M34.5 15v7h7" fill="#dfb56b" />
          <path
            d="M26 28h11M26 33h9"
            stroke="#9aa7ab"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="m28 39 3 3 7-8"
            fill="none"
            stroke="#118b81"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {showLabel ? (
        <div className="brand-wordmark min-w-0 text-right">
          <p className="truncate text-[1.05rem] font-bold leading-5 tracking-[-0.04em] text-current">
            وثائقي
          </p>
          {!compactLabel ? (
            <p className="truncate text-[10px] font-medium leading-4 text-current/60">
              أرشيف موثوق · قرار أوضح
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
