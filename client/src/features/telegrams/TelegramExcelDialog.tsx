import { useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ownerTrpc as trpc } from "@/lib/ownerTrpc";
import {
  downloadBase64File,
  readFileAsBase64,
  toSpreadsheetRow,
} from "./telegramUi";
import type { TelegramListFilters } from "@shared/telegrams";

type ImportPreview = {
  rows: Array<{
    originalSerial: string;
    time: string;
    sender: string;
    date: string;
    body: string;
    recipient: string;
    signature: string;
    notes: string;
    sheetName: "صادر" | "وارد";
  }>;
  skippedRows: number;
  duplicateRows: number;
  issues: Array<{
    rowNumber: number;
    sheetName: string;
    reason: string;
    value?: string;
  }>;
  sheets: string[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: TelegramListFilters;
};

export default function TelegramExcelDialog({
  open,
  onOpenChange,
  filters,
}: Props) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"export" | "import">("export");
  const [password, setPassword] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [duplicateIndexes, setDuplicateIndexes] = useState<Set<number>>(
    new Set()
  );
  const [busy, setBusy] = useState(false);

  const exportWorkbook = trpc.telegrams.exportWorkbook.useMutation();
  const importWorkbookPreview =
    trpc.telegrams.importWorkbookPreview.useMutation();
  const importPreview = trpc.telegrams.importPreview.useMutation();
  const importRows = trpc.telegrams.importRows.useMutation();

  async function handleExport() {
    setBusy(true);
    try {
      const settings = await utils.client.departmentSettings.get.query();
      const rows = await utils.client.telegrams.exportRows.query({
        ...filters,
        page: 1,
        pageSize: 100,
      });
      if (rows.length === 0) {
        toast.error("لا توجد برقيات مطابقة للتصدير.");
        return;
      }
      const mapped = rows.map(row => toSpreadsheetRow(row, settings.timezone));
      const result = await exportWorkbook.mutateAsync({
        rows: mapped,
        ...(password.trim() ? { password: password.trim() } : {}),
      });
      downloadBase64File(
        result.base64,
        result.fileName,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      toast.success(`تم تصدير ${mapped.length} برقية.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر التصدير");
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error("يرجى اختيار ملف Excel بصيغة xlsx أو xls.");
      return;
    }
    setBusy(true);
    setPreview(null);
    setDuplicateIndexes(new Set());
    try {
      const { base64 } = await readFileAsBase64(file);
      setFileName(file.name);
      setFileBase64(base64);
      const parsed = await importWorkbookPreview.mutateAsync({
        base64,
        ...(password.trim() ? { password: password.trim() } : {}),
      });
      setPreview(parsed);
      const duplicates = await importPreview.mutateAsync({
        rows: parsed.rows,
      });
      setDuplicateIndexes(
        new Set(
          duplicates.filter(item => item.duplicate).map(item => item.index)
        )
      );
      toast.success(`تم تحليل ${parsed.rows.length} صفاً من الملف.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحليل الملف");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!preview) return;
    const rows = preview.rows.filter(
      (_row, index) => !duplicateIndexes.has(index)
    );
    if (rows.length === 0) {
      toast.error("كل الصفوف مكررة؛ لا يوجد ما يُستورد.");
      return;
    }
    setBusy(true);
    let created = 0;
    let skipped = 0;
    let failed = 0;
    try {
      for (let start = 0; start < rows.length; start += 100) {
        const batch = rows.slice(start, start + 100);
        const result = await importRows.mutateAsync({ rows: batch });
        created += result.created;
        skipped += result.skipped;
        failed += result.errorCount;
      }
      toast.success(
        `اكتمل الاستيراد: ${created} برقية جديدة، ${skipped} مكررة، ${failed} فاشلة.`
      );
      await Promise.all([
        utils.telegrams.list.invalidate(),
        utils.dashboard.stats.invalidate(),
      ]);
      setPreview(null);
      setFileName(null);
      setFileBase64(null);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الاستيراد");
    } finally {
      setBusy(false);
    }
  }

  const importableCount = preview
    ? preview.rows.length - duplicateIndexes.size
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            سجل البرقيات — Excel
          </DialogTitle>
          <DialogDescription>
            تصدير البرقيات المطابقة للفلاتر الحالية إلى قالب صادر/وارد، أو
            استيراد سجل ورقي من ملف Excel.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={tab === "export" ? "default" : "outline"}
            onClick={() => setTab("export")}
          >
            <Download className="me-2 h-4 w-4" />
            تصدير
          </Button>
          <Button
            type="button"
            variant={tab === "import" ? "default" : "outline"}
            onClick={() => setTab("import")}
          >
            <Upload className="me-2 h-4 w-4" />
            استيراد
          </Button>
        </div>

        {tab === "export" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              يتم تصدير أول 100 برقية مطابقة للفلاتر الحالية، موزعة على ورقتَي
              «صادر» و«وارد» في قالب النظام الرسمي.
            </p>
            <div className="space-y-2">
              <Label htmlFor="export-password">كلمة مرور الملف (اختياري)</Label>
              <Input
                id="export-password"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="اتركه فارغاً لملف غير محمي"
                autoComplete="new-password"
              />
            </div>
            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="button" disabled={busy} onClick={handleExport}>
                <Download className="me-2 h-4 w-4" />
                {busy ? "جارٍ التصدير..." : "تنزيل ملف Excel"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-file">ملف Excel</Label>
              <Input
                id="import-file"
                type="file"
                accept=".xlsx,.xls"
                disabled={busy}
                onChange={event => handleFile(event.target.files?.[0] ?? null)}
              />
              {fileName ? (
                <p className="text-xs text-muted-foreground">
                  الملف المحدد: {fileName}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-password">
                كلمة مرور الملف (إن كان محمياً)
              </Label>
              <Input
                id="import-password"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>

            {preview ? (
              <div className="space-y-3 rounded-2xl border bg-muted/30 p-4">
                <div className="grid gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-muted-foreground">صفوف صالحة</p>
                    <p className="font-semibold">{preview.rows.length}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">مكررة داخل الملف</p>
                    <p className="font-semibold">{preview.duplicateRows}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">مستبعدة</p>
                    <p className="font-semibold">{preview.skippedRows}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">موجودة مسبقاً</p>
                    <p className="font-semibold">{duplicateIndexes.size}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  الأوراق: {preview.sheets.join("، ") || "—"} · سيُستورد{" "}
                  {importableCount} صفاً.
                </p>
                {preview.issues.length > 0 ? (
                  <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-amber-700">
                    {preview.issues.slice(0, 12).map(issue => (
                      <li key={`${issue.sheetName}-${issue.rowNumber}`}>
                        {issue.sheetName} · صف {issue.rowNumber}: {issue.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <DialogFooter className="gap-2 sm:justify-start">
              <Button
                type="button"
                disabled={busy || !preview || importableCount === 0}
                onClick={handleImport}
              >
                <Upload className="me-2 h-4 w-4" />
                {busy ? "جارٍ الاستيراد..." : `استيراد ${importableCount} صفاً`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
