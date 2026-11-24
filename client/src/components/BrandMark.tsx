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
          "brand-mark shrink-0 overflow-hidden border border-white/15 bg-primary shadow-[0_8px_24px_rgba(19,45,67,0.18)]",
          sizeClasses[size]
        )}
      >
        <img
          src="/icon-512.png"
          alt=""
          aria-hidden="true"
          className={cn("h-full w-full object-cover", imageClassName)}
        />
      </div>
      {showLabel ? (
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-bold tracking-tight text-foreground">
            وثائقي — نظام الوثائق
          </p>
          {!compactLabel ? (
            <p className="truncate text-base font-semibold leading-6 text-muted-foreground">
              إدارة الوثائق الرسمية
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
