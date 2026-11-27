import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import FilePreview from "./FilePreview";
import PrintSettingsPanel, { CutMarksControls } from "./PrintSettingsPanel";
import { openOriginalPrintWindow } from "./printOriginal";
import {
  DEFAULT_CUT_MARGIN_MM,
  DEFAULT_SHOW_CUT_MARKS,
  fileKind,
} from "./types";
import type { PagesPerSheet, PrintLayoutMode, PrintOrientation } from "./types";
import DocumentOperationProgress from "../document-progress/DocumentOperationProgress";
import { useDocumentProgress } from "../document-progress/useDocumentProgress";

export default function PrintDialog({
  open,
  onOpenChange,
  title,
  url,
  fileName,
  mimeType,
  getPrintUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  url: string;
  fileName: string;
  mimeType: string;
  getPrintUrl?: () => Promise<string>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<PrintLayoutMode>("sequential");
  const [pagesPerSheet, setPagesPerSheet] = useState<PagesPerSheet>(1);
  const [copiesPerSheet, setCopiesPerSheet] = useState<PagesPerSheet>(2);
  const [orientation, setOrientation] = useState<PrintOrientation>("portrait");
  const [marginMm, setMarginMm] = useState(0);
  const [cutMarginMm, setCutMarginMm] = useState(DEFAULT_CUT_MARGIN_MM);
  const [showPageNumbers, setShowPageNumbers] = useState(false);
  const [showCutMarks, setShowCutMarks] = useState(DEFAULT_SHOW_CUT_MARKS);
  const [imageTiles, setImageTiles] = useState<1 | 4 | 9 | 16>(1);
  const [imageCopiesPerSheet, setImageCopiesPerSheet] =
    useState<PagesPerSheet>(1);
  const kind = fileKind(fileName, mimeType);
  const canPrint = kind !== null;
  const activeLayoutCount =
    kind === "image"
      ? imageTiles === 1
        ? imageCopiesPerSheet
        : 1
      : layoutMode === "repeat"
        ? copiesPerSheet
        : pagesPerSheet;
  const operation = useDocumentProgress();
  const printButtonLabel =
    kind === "image" ? "طباعة الصورة" : "متابعة إلى الطباعة";

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLayoutMode("sequential");
    setPagesPerSheet(1);
    setCopiesPerSheet(2);
    setOrientation("portrait");
    setMarginMm(0);
    setCutMarginMm(DEFAULT_CUT_MARGIN_MM);
    setShowPageNumbers(false);
    setShowCutMarks(DEFAULT_SHOW_CUT_MARKS);
    setImageTiles(1);
    setImageCopiesPerSheet(1);
  }, [open, url, fileName, mimeType]);

  const handlePrint = async () => {
    setLoading(true);
    setError(null);
    try {
      await operation.run(progressOptions =>
        openOriginalPrintWindow({
          ...progressOptions,
          url,
          fileName,
          mimeType,
          pagesPerSheet,
          layoutMode:
            kind === "image"
              ? imageTiles === 1 && imageCopiesPerSheet > 1
                ? "repeat"
                : "sequential"
              : layoutMode,
          copiesPerSheet:
            kind === "image" ? imageCopiesPerSheet : copiesPerSheet,
          orientation,
          marginMm,
          cutMarginMm,
          showPageNumbers,
          showCutMarks,
          imageTiles,
          resolveUrl: getPrintUrl,
        })
      );
    } catch (printError) {
      if (printError instanceof Error && printError.name === "AbortError")
        return;
      setError(
        printError instanceof Error
          ? printError.message
          : "تعذر فتح نافذة الطباعة"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) operation.cancel();
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-h-[92vh] max-w-6xl overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="text-right">
            إعدادات طباعة الوثيقة
          </DialogTitle>
          <DialogDescription className="text-right">
            {title} — اختر طريقة ترتيب الصفحات، وعددها، واتجاه الورقة والهوامش
            قبل فتح معاينة المتصفح.
          </DialogDescription>
        </DialogHeader>

        {canPrint ? (
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="min-w-0 space-y-4">
              <div className="overflow-hidden rounded-xl border bg-muted/20">
                <div className="border-b px-4 py-2 text-sm font-medium">
                  معاينة الملف الأصلي
                </div>
                <div className="max-h-[52vh] overflow-auto p-2">
                  <FilePreview
                    url={url}
                    fileName={fileName}
                    mimeType={mimeType}
                  />
                </div>
              </div>
              {kind === "image" ? (
                <fieldset className="rounded-xl border bg-card p-4">
                  <legend className="px-2 text-sm font-semibold">
                    تقسيم الصورة الكبيرة إلى أوراق A4
                  </legend>
                  <div
                    className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                    role="radiogroup"
                    aria-label="عدد أوراق تقسيم الصورة"
                  >
                    {([1, 4, 9, 16] as const).map(value => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={imageTiles === value}
                        onClick={() => setImageTiles(value)}
                        className={`min-h-12 rounded-lg border px-2 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${imageTiles === value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/50"}`}
                      >
                        {value === 1 ? "احتواء في ورقة" : `${value} أوراق`}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    عند اختيار عدة أوراق تُقسّم الصورة إلى أجزاء متجاورة
                    لتجميعها كملصق كبير؛ هذا يختلف عن تكرار النسخة نفسها.
                  </p>
                  {imageTiles === 1 ? (
                    <div className="mt-4 border-t pt-4">
                      <p className="mb-2 text-sm font-medium">
                        عدد نسخ الصورة في الورقة
                      </p>
                      <div
                        className="grid grid-cols-5 gap-2"
                        role="radiogroup"
                        aria-label="عدد نسخ الصورة في الورقة"
                      >
                        {([1, 2, 4, 6, 8] as const).map(value => (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={imageCopiesPerSheet === value}
                            onClick={() => setImageCopiesPerSheet(value)}
                            className={`rounded-lg border px-1 py-2 text-center text-xs transition ${imageCopiesPerSheet === value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/50"}`}
                          >
                            <span className="block font-semibold">{value}</span>
                            <span>{value === 1 ? "نسخة" : "نسخ"}</span>
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        النسخ المتعددة تصغر لتتناسب مع الورقة؛ نسخة واحدة تستخدم
                        مساحة الورقة كاملةً.
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                    <label className="space-y-1.5 text-sm">
                      <span className="block font-medium">اتجاه الورقة</span>
                      <select
                        value={orientation}
                        onChange={event =>
                          setOrientation(event.target.value as PrintOrientation)
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
                        onChange={event =>
                          setMarginMm(Number(event.target.value))
                        }
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      >
                        <option value={0}>بلا هامش إضافي</option>
                        <option value={5}>ضيق — 5 مم</option>
                        <option value={10}>عادي — 10 مم</option>
                        <option value={15}>واسع — 15 مم</option>
                      </select>
                    </label>
                  </div>
                  <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={showPageNumbers}
                      onChange={event =>
                        setShowPageNumbers(event.target.checked)
                      }
                      className="mt-1 size-4 accent-primary"
                    />
                    <span>
                      <span className="block font-medium">ترقيم الأوراق</span>
                      <span className="block text-xs text-muted-foreground">
                        يطبع رقم الورقة في أسفل كل ورقة من تقسيم الملصق.
                      </span>
                    </span>
                  </label>
                  {imageTiles === 1 && imageCopiesPerSheet > 1 ? (
                    <CutMarksControls
                      cutMarginMm={cutMarginMm}
                      onCutMarginChange={setCutMarginMm}
                      showCutMarks={showCutMarks}
                      onShowCutMarksChange={setShowCutMarks}
                    />
                  ) : null}
                </fieldset>
              ) : (
                <PrintSettingsPanel
                  mode={layoutMode}
                  onModeChange={setLayoutMode}
                  count={
                    layoutMode === "repeat" ? copiesPerSheet : pagesPerSheet
                  }
                  onCountChange={
                    layoutMode === "repeat"
                      ? setCopiesPerSheet
                      : setPagesPerSheet
                  }
                  orientation={orientation}
                  onOrientationChange={setOrientation}
                  marginMm={marginMm}
                  onMarginChange={setMarginMm}
                  showPageNumbers={showPageNumbers}
                  onShowPageNumbersChange={setShowPageNumbers}
                  cutMarginMm={cutMarginMm}
                  onCutMarginChange={setCutMarginMm}
                  showCutMarks={showCutMarks}
                  onShowCutMarksChange={setShowCutMarks}
                />
              )}
              {kind === "pdf" ? (
                <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  تُرسم صفحات PDF كصور عالية الدقة للمعاينة؛ قد لا يبقى النص
                  قابلاً للتحديد عند حفظها من نافذة الطباعة كملف PDF.
                </p>
              ) : null}
            </div>
            <aside className="flex min-w-0 flex-col justify-between gap-4 rounded-xl border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-semibold">ملخص إعدادات الإخراج</p>
                <dl className="mt-3 divide-y rounded-lg border bg-background px-3 text-sm">
                  <div className="flex justify-between gap-3 py-2">
                    <dt className="text-muted-foreground">الملف</dt>
                    <dd
                      className="max-w-[65%] truncate font-medium"
                      title={fileName}
                    >
                      {fileName}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 py-2">
                    <dt className="text-muted-foreground">التخطيط</dt>
                    <dd className="font-medium">
                      {kind === "image"
                        ? imageTiles === 1
                          ? imageCopiesPerSheet === 1
                            ? "احتواء الصورة"
                            : `تكرار الصورة — ${imageCopiesPerSheet} نسخ`
                          : `ملصق — ${imageTiles} أوراق`
                        : layoutMode === "repeat"
                          ? "تكرار كل صفحة"
                          : "صفحات متتابعة"}
                    </dd>
                  </div>
                  {kind === "image" && imageTiles === 1 ? (
                    <div className="flex justify-between gap-3 py-2">
                      <dt className="text-muted-foreground">نسخ في الورقة</dt>
                      <dd className="font-medium">{imageCopiesPerSheet}</dd>
                    </div>
                  ) : null}
                  {kind === "image" ? (
                    <div className="flex justify-between gap-3 py-2">
                      <dt className="text-muted-foreground">
                        الاتجاه / الهامش
                      </dt>
                      <dd className="font-medium">
                        {orientation === "portrait" ? "عمودي" : "أفقي"} ·{" "}
                        {marginMm} مم
                      </dd>
                    </div>
                  ) : null}
                  {activeLayoutCount > 1 ? (
                    <div className="flex justify-between gap-3 py-2">
                      <dt className="text-muted-foreground">
                        هامش القص / العلامات
                      </dt>
                      <dd className="font-medium">
                        {cutMarginMm} مم ·{" "}
                        {showCutMarks ? "مفعّلة" : "غير مفعّلة"}
                      </dd>
                    </div>
                  ) : null}
                  {kind !== "image" ? (
                    <>
                      <div className="flex justify-between gap-3 py-2">
                        <dt className="text-muted-foreground">
                          المحتوى في الورقة
                        </dt>
                        <dd className="font-medium">
                          {layoutMode === "repeat"
                            ? `${copiesPerSheet} نسخ من الصفحة نفسها`
                            : `${pagesPerSheet} ${pagesPerSheet === 1 ? "صفحة" : "صفحات"}`}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3 py-2">
                        <dt className="text-muted-foreground">
                          الاتجاه / الهامش
                        </dt>
                        <dd className="font-medium">
                          {orientation === "portrait" ? "عمودي" : "أفقي"} ·{" "}
                          {marginMm} مم
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3 py-2">
                        <dt className="text-muted-foreground">ترقيم الورقة</dt>
                        <dd className="font-medium">
                          {showPageNumbers ? "مفعّل" : "غير مفعّل"}
                        </dd>
                      </div>
                    </>
                  ) : null}
                </dl>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  بعد المتابعة ستفتح معاينة الطباعة في نافذة المتصفح، ويمكنك
                  اختيار الطابعة أو «حفظ كملف PDF» هناك.
                </p>
              </div>
              {error ? (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}
            </aside>
          </div>
        ) : (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            صيغة الملف غير مدعومة للطباعة الأصلية.
          </p>
        )}

        <DocumentOperationProgress progress={operation.progress} />
        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            onClick={() => void handlePrint()}
            disabled={loading || !canPrint}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Printer className="size-4" />
            )}
            {loading ? "جارٍ تجهيز الطباعة..." : printButtonLabel}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              operation.cancel();
              onOpenChange(false);
            }}
          >
            {loading ? "إلغاء التجهيز" : "إغلاق"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
