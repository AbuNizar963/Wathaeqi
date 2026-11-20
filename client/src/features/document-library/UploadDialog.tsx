import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2, UploadCloud } from "lucide-react";
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
import { appwriteApiUrl } from "@/lib/appwriteApi";
import { countLocalFilePages } from "./renderPages";
import { DOCUMENT_CATEGORIES, fileKind, formatBytes } from "./types";

const ACCEPTED = ".docx,.pdf,.png,.jpg,.jpeg,.webp";

function encodeMetadataHeader(value: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export default function UploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (documentId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("general");
  const [subject, setSubject] = useState("");
  const [documentDate, setDocumentDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPageCount(0);
      setTitle("");
      setCategory("general");
      setSubject("");
      setDocumentDate(new Date().toISOString().slice(0, 10));
      setError(null);
      setProgress("");
      setUploading(false);
      setAnalyzing(false);
    }
  }, [open]);

  const selectFile = async (selected: File | null) => {
    if (!selected) return;
    setError(null);
    if (selected.size > 25 * 1024 * 1024) {
      setError("الحد الأقصى لحجم الملف 25 ميغابايت");
      return;
    }
    if (!fileKind(selected.name, selected.type)) {
      setError("الصيغ المدعومة: Word (docx)، PDF، وصور PNG/JPG/WEBP");
      return;
    }
    setFile(selected);
    setTitle(current => current || selected.name.replace(/\.[^.]+$/, ""));
    setAnalyzing(true);
    try {
      const count = await countLocalFilePages(selected);
      setPageCount(count);
    } catch {
      setPageCount(0);
      setError("تم اختيار الملف، لكن تعذر تحليل عدد صفحاته. يمكنك المتابعة.");
    } finally {
      setAnalyzing(false);
    }
  };

  const submit = async () => {
    if (!file || !title.trim()) return;
    setUploading(true);
    setError(null);
    try {
      setProgress("جارٍ رفع الملف إلى التخزين الآمن…");
      const response = await fetch(appwriteApiUrl("/api/documents/upload"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
          "x-document-metadata": encodeMetadataHeader({
            title: title.trim(),
            category,
            subject: subject.trim(),
            documentDate: new Date(
              `${documentDate}T12:00:00.000Z`
            ).toISOString(),
            pageCount,
          }),
        },
        body: file,
      });
      const uploaded = (await response.json().catch(() => null)) as {
        id?: string;
        error?: string;
      } | null;
      if (!response.ok || !uploaded?.id) {
        throw new Error(uploaded?.error || "تعذر رفع الملف");
      }
      onUploaded(uploaded.id);
      onOpenChange(false);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "تعذر رفع الوثيقة"
      );
    } finally {
      setUploading(false);
      setProgress("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">رفع وثيقة</DialogTitle>
          <DialogDescription className="text-right">
            ارفع ملف Word أو PDF أو صورة، وأدخل بيانات الوثيقة. يظهر عدد الصفحات
            عند توفر تحليل موثوق، وإلا يبقى غير معروف.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={event => {
              event.preventDefault();
              event.currentTarget.classList.add(
                "border-primary",
                "bg-primary/5"
              );
            }}
            onDragLeave={event => {
              event.currentTarget.classList.remove(
                "border-primary",
                "bg-primary/5"
              );
            }}
            onDrop={event => {
              event.preventDefault();
              event.currentTarget.classList.remove(
                "border-primary",
                "bg-primary/5"
              );
              void selectFile(event.dataTransfer.files?.[0] ?? null);
            }}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-8 text-center transition hover:border-primary/50"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              {file ? (
                <FileUp className="size-5" />
              ) : (
                <UploadCloud className="size-5" />
              )}
            </span>
            {file ? (
              <>
                <span className="text-sm font-semibold">{file.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatBytes(file.size)} ·{" "}
                  {analyzing
                    ? "جارٍ تحليل الصفحات…"
                    : pageCount > 0
                      ? `${pageCount.toLocaleString("ar")} صفحة`
                      : "عدد الصفحات غير معروف"}
                </span>
              </>
            ) : (
              <>
                <span className="text-sm font-semibold">
                  اسحب الملف هنا أو اضغط للاختيار
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Word (docx) · PDF · PNG · JPG · WEBP — حتى 25 ميغابايت
                </span>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={event => void selectFile(event.target.files?.[0] ?? null)}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="upload-title">عنوان الوثيقة *</Label>
              <Input
                id="upload-title"
                value={title}
                onChange={event => setTitle(event.target.value)}
                className="mt-1.5"
                placeholder="مثال: قرار إداري رقم ١٤٧"
              />
            </div>
            <div>
              <Label htmlFor="upload-category">التصنيف</Label>
              <select
                id="upload-category"
                value={category}
                onChange={event => setCategory(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {DOCUMENT_CATEGORIES.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="upload-date">تاريخ الوثيقة</Label>
              <Input
                id="upload-date"
                type="date"
                value={documentDate}
                onChange={event => setDocumentDate(event.target.value)}
                className="mt-1.5"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="upload-subject">الموضوع / ملاحظة</Label>
              <Input
                id="upload-subject"
                value={subject}
                onChange={event => setSubject(event.target.value)}
                className="mt-1.5"
                placeholder="موضوع مختصر يظهر في الأرشيف"
              />
            </div>
          </div>

          {progress ? (
            <p className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> {progress}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            onClick={() => void submit()}
            disabled={!file || !title.trim() || uploading || analyzing}
            className="gap-2"
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UploadCloud className="size-4" />
            )}
            رفع الوثيقة
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
