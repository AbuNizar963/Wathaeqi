import { Copy, FileStack, LayoutGrid } from "lucide-react";
import { getPrintGridDimensions, MAX_CUT_MARGIN_MM } from "./types";
import type { PagesPerSheet, PrintLayoutMode, PrintOrientation } from "./types";

const COUNTS: PagesPerSheet[] = [1, 2, 4, 6, 8];

export interface PrintSettingsPanelProps {
  mode: PrintLayoutMode;
  onModeChange: (value: PrintLayoutMode) => void;
  count: PagesPerSheet;
  onCountChange: (value: PagesPerSheet) => void;
  orientation: PrintOrientation;
  onOrientationChange: (value: PrintOrientation) => void;
  marginMm: number;
  onMarginChange: (value: number) => void;
  showPageNumbers: boolean;
  onShowPageNumbersChange: (value: boolean) => void;
  cutMarginMm: number;
  onCutMarginChange: (value: number) => void;
  showCutMarks: boolean;
  onShowCutMarksChange: (value: boolean) => void;
}

function CountOptions({
  value,
  onChange,
  label,
}: {
  value: PagesPerSheet;
  onChange: (value: PagesPerSheet) => void;
  label: "صفحة" | "نسخة";
}) {
  return (
    <div
      className="grid grid-cols-5 gap-2"
      role="radiogroup"
      aria-label={
        label === "صفحة"
          ? "عدد الصفحات المختلفة في الورقة"
          : "عدد نسخ الصفحة في الورقة"
      }
    >
      {COUNTS.map(count => {
        const selected = value === count;
        return (
          <button
            key={count}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(count)}
            className={`min-h-14 rounded-lg border px-1 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              selected
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-background text-foreground hover:border-primary/50"
            }`}
          >
            <span className="block text-base font-semibold">{count}</span>
            <span className="block text-[10px] font-normal">
              {label === "صفحة"
                ? count === 1
                  ? "صفحة"
                  : "صفحات"
                : count === 1
                  ? "نسخة"
                  : "نسخ"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function CutMarksControls({
  cutMarginMm,
  onCutMarginChange,
  showCutMarks,
  onShowCutMarksChange,
}: Pick<
  PrintSettingsPanelProps,
  "cutMarginMm" | "onCutMarginChange" | "showCutMarks" | "onShowCutMarksChange"
>) {
  return (
    <div className="mt-4 space-y-4 border-t pt-4">
      <label className="block space-y-2 text-sm">
        <span className="flex items-center justify-between gap-3">
          <span className="font-medium">هامش القص</span>
          <output className="rounded-md bg-muted px-2 py-1 font-mono text-xs tabular-nums">
            {cutMarginMm} مم
          </output>
        </span>
        <input
          type="range"
          aria-label="هامش القص"
          min={0}
          max={MAX_CUT_MARGIN_MM}
          step={1}
          value={cutMarginMm}
          onChange={event => onCutMarginChange(Number(event.target.value))}
          className="w-full accent-primary"
        />
        <span className="block text-xs leading-5 text-muted-foreground">
          يتحكم بالمسافة بين خانات الوثائق، ولا يغيّر هامش الورقة الخارجي. عند
          اختيار 0 مم تتلامس الخانات ولا توجد مساحة لعلامات القص.
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          aria-label="إظهار نقاط القص"
          checked={showCutMarks}
          onChange={event => onShowCutMarksChange(event.target.checked)}
          className="mt-1 size-4 accent-primary"
        />
        <span>
          <span className="block font-medium">إظهار نقاط القص</span>
          <span className="block text-xs text-muted-foreground">
            علامات قصيرة في منتصف الفواصل، من دون تغطية محتوى الوثائق.
          </span>
        </span>
      </label>
    </div>
  );
}

export default function PrintSettingsPanel({
  mode,
  onModeChange,
  count,
  onCountChange,
  orientation,
  onOrientationChange,
  marginMm,
  onMarginChange,
  showPageNumbers,
  onShowPageNumbersChange,
  cutMarginMm,
  onCutMarginChange,
  showCutMarks,
  onShowCutMarksChange,
}: PrintSettingsPanelProps) {
  const { columns, rows } = getPrintGridDimensions(count, orientation);

  return (
    <section className="space-y-4" aria-label="إعدادات الطباعة">
      <fieldset className="rounded-xl border bg-card p-4">
        <legend className="px-2 text-sm font-semibold">
          طريقة ترتيب المحتوى
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            aria-pressed={mode === "sequential"}
            onClick={() => onModeChange("sequential")}
            className={`rounded-lg border p-3 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === "sequential" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50"}`}
          >
            <span className="flex items-center gap-2 font-semibold">
              <FileStack className="size-4 text-primary" />
              صفحات المستند
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              ضع صفحات متتابعة مختلفة من المستند على كل ورقة.
            </span>
          </button>
          <button
            type="button"
            aria-pressed={mode === "repeat"}
            onClick={() => onModeChange("repeat")}
            className={`rounded-lg border p-3 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === "repeat" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50"}`}
          >
            <span className="flex items-center gap-2 font-semibold">
              <Copy className="size-4 text-primary" />
              تكرار كل صفحة
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              كرر الصفحة نفسها بالعدد المحدد، ثم انتقل إلى الصفحة التالية.
            </span>
          </button>
        </div>
      </fieldset>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-4">
          <fieldset className="rounded-xl border bg-card p-4">
            <legend className="px-2 text-sm font-semibold">
              {mode === "repeat"
                ? "عدد النسخ المكررة في الورقة"
                : "عدد الصفحات المختلفة في الورقة"}
            </legend>
            <CountOptions
              value={count}
              onChange={onCountChange}
              label={mode === "repeat" ? "نسخة" : "صفحة"}
            />
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {count === 1
                ? "اختيار 1 يطبع الصفحة بحجم الورقة المناسب، وليس داخل خانة مصغّرة."
                : mode === "repeat"
                  ? `ستظهر كل صفحة ${count} مرات على ورقة واحدة؛ تصغير النسخ يكون فقط لاحتواء التخطيط.`
                  : `ستُرتب ${count} صفحات متتابعة من المستند على كل ورقة.`}
            </p>
          </fieldset>

          <fieldset className="rounded-xl border bg-card p-4">
            <legend className="px-2 text-sm font-semibold">
              حجم الورقة والهوامش
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="block font-medium">اتجاه الورقة</span>
                <select
                  value={orientation}
                  onChange={event =>
                    onOrientationChange(event.target.value as PrintOrientation)
                  }
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="portrait">عمودي — A4</option>
                  <option value="landscape">أفقي — A4</option>
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="block font-medium">هامش الطباعة</span>
                <select
                  value={marginMm}
                  onChange={event => onMarginChange(Number(event.target.value))}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value={0}>بلا هامش إضافي</option>
                  <option value={5}>ضيق — 5 مم</option>
                  <option value={10}>عادي — 10 مم</option>
                  <option value={15}>واسع — 15 مم</option>
                </select>
              </label>
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={showPageNumbers}
                onChange={event =>
                  onShowPageNumbersChange(event.target.checked)
                }
                className="mt-1 size-4 accent-primary"
              />
              <span>
                <span className="block font-medium">ترقيم أوراق الطباعة</span>
                <span className="block text-xs text-muted-foreground">
                  يضيف رقم الورقة وموضعها من إجمالي الأوراق.
                </span>
              </span>
            </label>
            {count > 1 ? (
              <CutMarksControls
                cutMarginMm={cutMarginMm}
                onCutMarginChange={onCutMarginChange}
                showCutMarks={showCutMarks}
                onShowCutMarksChange={onShowCutMarksChange}
              />
            ) : null}
          </fieldset>
        </div>

        <aside
          className="rounded-xl border bg-muted/30 p-4"
          aria-label="معاينة تخطيط الورقة"
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <LayoutGrid className="size-4 text-primary" />
            معاينة التخطيط
          </div>
          <div
            className={`mx-auto flex w-36 items-center justify-center rounded-md border bg-white p-2 shadow-sm ${orientation === "landscape" ? "aspect-[297/210]" : "aspect-[210/297]"}`}
          >
            <div
              className="grid h-full w-full"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                gap: `${(cutMarginMm * 128) / (orientation === "landscape" ? 297 : 210)}px`,
              }}
            >
              {Array.from({ length: count }, (_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-center overflow-hidden rounded-sm border border-primary/35 bg-primary/5 text-[9px] font-medium text-primary"
                >
                  {mode === "repeat" ? "نسخة" : `ص ${index + 1}`}
                </div>
              ))}
            </div>
          </div>
          {orientation === "landscape" ? (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              A4 أفقي — تتبع المعاينة عدد الخانات المختار
            </p>
          ) : (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              A4 عمودي — تتبع المعاينة عدد الخانات المختار
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
