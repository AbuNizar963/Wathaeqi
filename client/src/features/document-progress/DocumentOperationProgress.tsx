import type { DocumentProgress } from "./documentProgress";

export function overallDocumentPercent(progress: DocumentProgress): number {
  if (progress.stagePercent !== undefined) return progress.stagePercent;
  if (progress.phase === "transfer")
    return 10 + Math.floor((progress.percent ?? 0) * 0.4);
  if (progress.phase === "render")
    return 50 + Math.floor((progress.percent ?? 0) * 0.4);
  return progress.phase === "preparation" ? 10 : 100;
}

export default function DocumentOperationProgress({
  progress,
}: {
  progress: DocumentProgress | null;
}) {
  if (!progress) return null;
  const percent = overallDocumentPercent(progress);
  const measurement =
    progress.percent === undefined
      ? null
      : `${progress.phase === "transfer" ? "البيانات المنقولة" : "الصفحات المجهزة"} فعلياً: ${progress.percent}%`;
  const caption =
    "نسبة مراحل التجهيز، لا تقدير للوقت ولا تأكيد للطباعة أو الحفظ";
  return (
    <div
      dir="rtl"
      className="space-y-2 rounded-lg border bg-muted/30 px-3 py-3 text-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <p role="status" aria-live="polite" className="text-muted-foreground">
          {progress.message}
        </p>
        <span
          dir="ltr"
          className="shrink-0 font-semibold tabular-nums text-primary"
        >
          {percent}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={progress.message}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${progress.message} — ${percent}% — ${caption}${measurement ? ` — ${measurement}` : ""}`}
        className="h-2 overflow-hidden rounded-full bg-primary/10"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {caption}
        {measurement ? ` — ${measurement}` : ""}
      </p>
    </div>
  );
}
