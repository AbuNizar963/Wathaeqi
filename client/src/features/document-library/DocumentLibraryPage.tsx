// Document library with a full-screen A4 preview and native actions.
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Archive,
  Download,
  FileImage,
  FileText,
  FileType2,
  FolderOpen,
  HardDrive,
  Layers,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Plus,
  Printer,
  Search,
  Share2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import FilePreview from "./FilePreview";
import PrintDialog from "./PrintDialog";
import UploadDialog from "./UploadDialog";
import {
  downloadDocumentFile,
  shareDocument,
} from "../document-studio/documentActions";
import {
  DOCUMENT_CATEGORIES,
  fileKind,
  formatBytes,
  formatDate,
} from "./types";
import type { OfficialDocument } from "../../../../shared/documentStudio";

function categoryLabel(value: string): string {
  return DOCUMENT_CATEGORIES.find(item => item.value === value)?.label ?? "عام";
}

function statusLabel(status: OfficialDocument["status"]): string {
  if (status === "issued") return "صادرة";
  if (status === "archived") return "مؤرشفة";
  return "مسودة";
}

function FileGlyph({
  fileName,
  mimeType,
}: {
  fileName: string;
  mimeType: string;
}) {
  const kind = fileKind(fileName, mimeType);
  if (kind === "pdf") return <FileType2 className="size-5" />;
  if (kind === "image") return <FileImage className="size-5" />;
  return <FileText className="size-5" />;
}

export default function DocumentLibraryPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const documentsQuery = trpc.documentStudio.listDocuments.useQuery();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [creationOpen, setCreationOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const documents = useMemo(
    () => (documentsQuery.data ?? []).filter(document => document.file),
    [documentsQuery.data]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return documents.filter(document => {
      if (category && document.category !== category) return false;
      if (!needle) return true;
      return [document.title, document.subject, document.file?.fileName]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle));
    });
  }, [documents, search, category]);

  const stats = useMemo(() => {
    const pages = documents.reduce(
      (total, document) => total + (document.file?.pageCount ?? 0),
      0
    );
    const bytes = documents.reduce(
      (total, document) => total + (document.file?.sizeBytes ?? 0),
      0
    );
    return { total: documents.length, pages, bytes };
  }, [documents]);

  const selected =
    documents.find(document => document.id === selectedId) ?? null;
  const fileUrlQuery = trpc.documentStudio.getFileUrl.useQuery(
    { id: selectedId ?? "" },
    { enabled: Boolean(selectedId && selected?.file), staleTime: 120_000 }
  );

  const deleteDocument = trpc.documentStudio.deleteDocument.useMutation({
    onSuccess: () => {
      setSelectedId(null);
      void utils.documentStudio.listDocuments.invalidate();
    },
  });

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            الأرشيف الرقمي
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            مكتبة الوثائق
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ارفع ملفات Word وPDF، وأرشفها، واطبع الملف الأصلي مع الحفاظ على
            صفحاته وتنسيقه.
          </p>
        </div>
        <Button onClick={() => setCreationOpen(true)} className="gap-2">
          <Plus className="size-4" />
          إنشاء
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderOpen className="size-5" />
          </span>
          <div>
            <p className="text-[11px] text-muted-foreground">
              الوثائق المرفوعة
            </p>
            <p className="text-xl font-bold">
              {stats.total.toLocaleString("ar")}
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700">
            <Layers className="size-5" />
          </span>
          <div>
            <p className="text-[11px] text-muted-foreground">إجمالي الصفحات</p>
            <p className="text-xl font-bold">
              {stats.pages.toLocaleString("ar")}
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700">
            <HardDrive className="size-5" />
          </span>
          <div>
            <p className="text-[11px] text-muted-foreground">حجم الملفات</p>
            <p className="text-xl font-bold">{formatBytes(stats.bytes)}</p>
          </div>
        </Card>
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="ابحث بالعنوان أو الموضوع أو اسم الملف…"
            className="pr-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategory("")}
            className={`rounded-full px-3 py-1.5 text-xs transition ${
              !category
                ? "bg-primary text-primary-foreground"
                : "border bg-card text-muted-foreground hover:border-primary/40"
            }`}
          >
            الكل
          </button>
          {DOCUMENT_CATEGORIES.map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() =>
                setCategory(current =>
                  current === item.value ? "" : item.value
                )
              }
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                category === item.value
                  ? "bg-primary text-primary-foreground"
                  : "border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Card>

      {documentsQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> جارٍ تحميل المكتبة…
        </div>
      ) : documentsQuery.isError ? (
        <Card className="px-6 py-14 text-center">
          <p className="text-sm font-semibold">تعذر تحميل الوثائق</p>
          <p className="mt-1 text-xs text-muted-foreground">
            تحقق من اتصال الخدمة ثم أعد المحاولة.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => void documentsQuery.refetch()}
          >
            إعادة المحاولة
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UploadCloud className="size-6" />
          </span>
          <h2 className="mt-4 text-base font-semibold">
            {documents.length === 0 ? "المكتبة فارغة" : "لا نتائج مطابقة"}
          </h2>
          <p className="mt-1 max-w-sm text-xs leading-6 text-muted-foreground">
            {documents.length === 0
              ? "ابدأ برفع أول وثيقة Word أو PDF. سيتم احتساب الصفحات تلقائيًا وتجهيز خيارات الطباعة."
              : "جرّب كلمة بحث أخرى أو أزل تصفية التصنيف."}
          </p>
          {documents.length === 0 ? (
            <Button className="mt-4 gap-2" onClick={() => setUploadOpen(true)}>
              <Plus className="size-4" /> رفع وثيقة
            </Button>
          ) : null}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(document => {
            const file = document.file;
            if (!file) return null;
            return (
              <Card
                key={document.id}
                className="group flex cursor-pointer flex-col gap-3 p-4 transition hover:border-primary/40 hover:shadow-sm"
                onClick={() => setSelectedId(document.id)}
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/[0.07] text-primary">
                    <FileGlyph
                      fileName={file.fileName}
                      mimeType={file.mimeType}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {document.title}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {file.fileName}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {statusLabel(document.status)}
                  </Badge>
                </div>
                {document.subject ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {document.subject}
                  </p>
                ) : null}
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  <span>{categoryLabel(document.category)}</span>
                  <span>·</span>
                  <span>{file.pageCount.toLocaleString("ar")} صفحة</span>
                  <span>·</span>
                  <span>{formatBytes(file.sizeBytes)}</span>
                  <span className="ms-auto">
                    {formatDate(document.documentDate)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Button
        type="button"
        aria-label="إنشاء وثيقة جديدة"
        title="إنشاء وثيقة جديدة"
        onClick={() => navigate("/studio?create=1")}
        className="group fixed bottom-5 left-5 z-40 h-14 w-14 rounded-full bg-primary p-0 text-primary-foreground shadow-[0_14px_30px_rgba(16,35,63,0.28)] transition-all hover:-translate-y-1 hover:bg-primary/90 hover:shadow-[0_18px_36px_rgba(16,35,63,0.36)] focus-visible:ring-2 focus-visible:ring-[#b4945a] focus-visible:ring-offset-2 sm:bottom-7 sm:left-7"
      >
        <MessageSquarePlus className="h-6 w-6 transition-transform group-hover:scale-110" />
        <span className="sr-only">وثيقة جديدة</span>
      </Button>

      <Dialog open={creationOpen} onOpenChange={setCreationOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">إنشاء وثيقة</DialogTitle>
            <DialogDescription className="text-right">
              اختر إنشاء وثيقة رسمية جديدة أو رفع ملف موجود إلى مكتبتك.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start gap-3 p-4 text-right"
              onClick={() => {
                setCreationOpen(false);
                navigate("/studio?create=1");
              }}
            >
              <FileText className="size-5 shrink-0" />
              <span className="flex-1 text-right">
                <span className="block font-semibold">وثيقة جديدة</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  افتح محرر الوثائق الرسمية بورق A4 وشعار الجهة والعلامة الأمنية
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start gap-3 p-4 text-right"
              onClick={() => {
                setCreationOpen(false);
                setUploadOpen(true);
              }}
            >
              <UploadCloud className="size-5 shrink-0" />
              <span className="flex-1 text-right">
                <span className="block font-semibold">رفع ملف</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  استيراد ملف Word أو PDF أو صورة
                </span>
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={documentId => {
          setSelectedId(documentId);
          void utils.documentStudio.listDocuments.invalidate();
        }}
      />

      <Dialog
        open={Boolean(selectedId)}
        onOpenChange={open => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent
          className={[
            "h-[100dvh] w-screen max-w-none max-h-none",
            "overflow-y-auto rounded-none border-0 p-3 sm:p-6",
          ].join(" ")}
          dir="rtl"
        >
          {selected && selected.file ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <DialogTitle className="text-right text-lg">
                      {selected.title}
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-right">
                      {categoryLabel(selected.category)} ·{" "}
                      {selected.file.pageCount.toLocaleString("ar")} صفحة ·{" "}
                      {formatBytes(selected.file.sizeBytes)} ·{" "}
                      {formatDate(selected.documentDate)}
                    </DialogDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="gap-2"
                      onClick={() => setPrintOpen(true)}
                      disabled={!fileUrlQuery.data?.url}
                    >
                      <Printer className="size-4" />
                      طباعة
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-destructive"
                      onClick={() => {
                        if (
                          window.confirm(
                            `حذف «${selected.title}» نهائيًا من المكتبة؟`
                          )
                        ) {
                          deleteDocument.mutate({ id: selected.id });
                        }
                      }}
                      disabled={deleteDocument.isPending}
                      title="حذف الوثيقة"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              {selected.subject ? (
                <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {selected.subject}
                </p>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <details className="rounded-xl border bg-card px-3 py-2">
                  <summary className="cursor-pointer list-none text-sm font-semibold">
                    إصدارات الوثيقة (1)
                  </summary>
                  <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                    الإصدار الحالي · {statusLabel(selected.status)}
                  </div>
                </details>
                <details className="rounded-xl border bg-card px-3 py-2">
                  <summary className="cursor-pointer list-none text-sm font-semibold">
                    سجل التدقيق والإجراءات
                  </summary>
                  <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                    تم حفظ الوثيقة في المكتبة · {statusLabel(selected.status)}
                  </div>
                </details>
              </div>

              {fileUrlQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> جارٍ تجهيز
                  المعاينة…
                </div>
              ) : fileUrlQuery.data?.url ? (
                <FilePreview
                  url={fileUrlQuery.data.url}
                  fileName={selected.file.fileName}
                  mimeType={selected.file.mimeType}
                />
              ) : (
                <div className="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
                  تعذر تجهيز رابط المعاينة. أعد فتح الوثيقة.
                </div>
              )}

              {fileUrlQuery.data?.url ? (
                <div className="grid grid-cols-3 gap-2 rounded-2xl border bg-card p-3">
                  <Button
                    variant="outline"
                    className="h-12 gap-2"
                    onClick={() =>
                      downloadDocumentFile(
                        fileUrlQuery.data!.url,
                        selected.file!.fileName
                      )
                    }
                  >
                    <Download className="size-4" />
                    تنزيل
                  </Button>
                  <Button
                    className="h-12 gap-2"
                    onClick={() => setPrintOpen(true)}
                  >
                    <Printer className="size-4" />
                    طباعة
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 gap-2"
                    onClick={() =>
                      void shareDocument({
                        documentId: selected.id,
                        title: selected.title,
                        text: selected.subject || selected.title,
                      })
                    }
                  >
                    <Share2 className="size-4" />
                    مشاركة
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 gap-2"
                    onClick={() =>
                      navigate(
                        `/studio?document=${encodeURIComponent(selected.id)}`
                      )
                    }
                  >
                    <Pencil className="size-4" />
                    تعديل
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 gap-2"
                    onClick={() => setUploadOpen(true)}
                  >
                    <UploadCloud className="size-4" />
                    استيراد ملف
                  </Button>
                  <Button
                    variant="destructive"
                    className="h-12 gap-2"
                    onClick={() => {
                      if (
                        window.confirm(
                          `حذف «${selected.title}» نهائيًا من المكتبة؟`
                        )
                      ) {
                        deleteDocument.mutate({ id: selected.id });
                      }
                    }}
                    disabled={deleteDocument.isPending}
                  >
                    <Trash2 className="size-4" />
                    حذف
                  </Button>
                </div>
              ) : null}

              {fileUrlQuery.data?.url ? (
                <PrintDialog
                  open={printOpen}
                  onOpenChange={setPrintOpen}
                  title={selected.title}
                  url={fileUrlQuery.data.url}
                  fileName={selected.file.fileName}
                  mimeType={selected.file.mimeType}
                />
              ) : null}
            </>
          ) : (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
        <Archive className="size-3.5" />
        الملفات محفوظة في مساحة تخزين خاصة بحسابك، ولا يمكن الوصول إليها إلا من
        خلال جلسة مسجّلة.
      </div>
    </div>
  );
}
