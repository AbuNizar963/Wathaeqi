// Document library with a full-screen A4 preview and native actions.
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Archive,
  Bookmark,
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
import { useAuth } from "@/features/auth-session/useAuth";
import {
  parseSavedDocumentViews,
  savedDocumentViewsKey,
  type SavedDocumentView,
} from "./savedViews";
import { toast } from "sonner";
import FilePreview from "./FilePreview";
import PrintDialog from "./PrintDialog";
import UploadDialog from "./UploadDialog";
import { signedFileQueryOptions } from "./signedFileQueryOptions";
import DocumentOperationProgress from "../document-progress/DocumentOperationProgress";
import { useDocumentProgress } from "../document-progress/useDocumentProgress";
import {
  documentFileUrl,
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
import {
  filterAndSortDocuments,
  type DocumentSortOrder,
  type DocumentStatusFilter,
} from "./libraryFilters";
import DocumentLibraryStatusControls from "./DocumentLibraryStatusControls";

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

export default function DocumentLibraryPage({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const downloadOperation = useDocumentProgress();
  const utils = trpc.useUtils();
  const documentsQuery = trpc.documentStudio.listDocuments.useQuery();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocumentStatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<DocumentSortOrder>("updated-desc");
  const [savedViews, setSavedViews] = useState<SavedDocumentView[]>([]);
  const [savedViewsUserId, setSavedViewsUserId] = useState<string | null>(null);
  const [savedViewName, setSavedViewName] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [creationOpen, setCreationOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setSavedViews([]);
      setSavedViewsUserId(null);
      return;
    }
    const userId = String(user.id);
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(savedDocumentViewsKey(userId));
    } catch {
      // Private browsing may disable local storage; saved searches remain optional.
    }
    setSavedViews(parseSavedDocumentViews(stored));
    setSavedViewsUserId(userId);
  }, [user?.id]);

  useEffect(() => {
    const userId = user ? String(user.id) : null;
    if (!userId || savedViewsUserId !== userId) return;
    try {
      localStorage.setItem(
        savedDocumentViewsKey(userId),
        JSON.stringify(savedViews)
      );
    } catch {
      // Do not block document search when browser storage is unavailable.
    }
  }, [savedViews, savedViewsUserId, user?.id]);

  const documents = useMemo(
    () => (documentsQuery.data ?? []).filter(document => document.file),
    [documentsQuery.data]
  );

  const filtered = useMemo(
    () =>
      filterAndSortDocuments(documents, {
        search,
        category,
        status: statusFilter,
        sort: sortOrder,
      }),
    [documents, search, category, statusFilter, sortOrder]
  );

  const saveCurrentView = () => {
    const name = savedViewName.trim();
    if (!name) return;
    setSavedViews(current =>
      [
        {
          id: crypto.randomUUID(),
          name: name.slice(0, 40),
          search,
          category,
          status: statusFilter,
          sort: sortOrder,
        },
        ...current.filter(view => view.name !== name),
      ].slice(0, 30)
    );
    setSavedViewName("");
    toast.success("تم حفظ عرض البحث على هذا الجهاز");
  };

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
    {
      enabled: Boolean(selectedId && selected?.file),
      ...signedFileQueryOptions,
    }
  );

  const deleteDocument = trpc.documentStudio.deleteDocument.useMutation({
    onSuccess: result => {
      setSelectedId(null);
      void utils.documentStudio.listDocuments.invalidate();
      if (!result.fileCleanupSucceeded && !result.auditLogRecorded) {
        toast.warning("حُذف السجل، وتعذر حذف الملف وتسجيل العملية.");
      } else if (!result.fileCleanupSucceeded) {
        toast.warning("حُذف السجل، لكن تعذر حذف الملف من التخزين.");
      } else if (!result.auditLogRecorded) {
        toast.warning("حُذفت الوثيقة، لكن تعذر تسجيل العملية.");
      }
    },
  });

  return (
    <div className="document-library-shell space-y-5" dir="rtl">
      <div className="document-page-header document-library-header relative isolate overflow-hidden rounded-[1.75rem] border border-[#c49a5b]/30 bg-[#10262d] px-5 py-6 text-white shadow-lg shadow-slate-950/10 sm:px-7 sm:py-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 -top-24 -z-10 size-64 rounded-full bg-[#c49a5b]/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-28 right-1/3 -z-10 size-64 rounded-full bg-[#0f766e]/30 blur-3xl"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="document-library-heading max-w-2xl">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-[#e2bd86]">
              الأرشيف الرقمي
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {embedded ? "الملفات" : "مساحة الوثائق"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/75">
              ارفع ملفات Word وPDF، ونظّمها، وراجعها واطبع نسخها الأصلية مع
              الحفاظ على الصفحات والتنسيق.
            </p>
          </div>
          {!embedded ? (
            <Button
              onClick={() => setCreationOpen(true)}
              className="min-h-11 gap-2 rounded-xl bg-[#c49a5b] px-5 font-bold text-[#10262d] shadow-md shadow-black/20 hover:bg-[#d2aa70]"
            >
              <Plus className="size-4" />
              إنشاء
            </Button>
          ) : null}
        </div>
      </div>

      <div className="document-stats-grid grid gap-3 sm:grid-cols-3">
        <Card className="document-card flex items-center gap-3 rounded-2xl border-border/70 p-4 shadow-sm transition-shadow hover:shadow-md">
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
        <Card className="flex items-center gap-3 rounded-2xl border-border/70 p-4 shadow-sm transition-shadow hover:shadow-md">
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
        <Card
          className="flex items-center gap-3 rounded-2xl border-border/70 p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700">
            <HardDrive className="size-5" />
          </span>
          <div>
            <p className="text-[11px] text-muted-foreground">حجم الملفات</p>
            <p className="text-xl font-bold">{formatBytes(stats.bytes)}</p>
          </div>
        </Card>
      </div>

      <Card className="document-toolbar document-library-toolbar flex flex-wrap items-center gap-2 rounded-2xl border-border/70 bg-card/95 p-3 shadow-sm sm:gap-3 sm:p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="ابحث بالعنوان أو الموضوع أو اسم الملف…"
            className="pr-9"
          />
        </div>
        <div className="document-filter-chips flex flex-wrap gap-1.5">
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
        <DocumentLibraryStatusControls
          status={statusFilter}
          sort={sortOrder}
          onStatusChange={setStatusFilter}
          onSortChange={setSortOrder}
        />
        <div className="document-saved-views flex w-full flex-wrap items-center gap-2 pt-2">
          <Input
            value={savedViewName}
            onChange={event => setSavedViewName(event.target.value)}
            maxLength={40}
            placeholder="اسم العرض المحفوظ"
            aria-label="اسم عرض البحث الجديد"
            className="h-9 min-w-36 flex-1 sm:max-w-56"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={saveCurrentView}
            disabled={!savedViewName.trim()}
          >
            <Bookmark className="ms-1 size-4" /> حفظ البحث
          </Button>
          {savedViews.map(view => (
            <div
              key={view.id}
              className="flex shrink-0 items-center rounded-full border bg-background"
            >
              <button
                type="button"
                className="px-3 py-1.5 text-xs hover:text-primary"
                onClick={() => {
                  setSearch(view.search);
                  setCategory(view.category);
                  setStatusFilter(view.status);
                  setSortOrder(view.sort);
                }}
              >
                {view.name}
              </button>
              <button
                type="button"
                className="px-2 text-muted-foreground hover:text-destructive"
                aria-label={`حذف العرض ${view.name}`}
                onClick={() =>
                  setSavedViews(current =>
                    current.filter(item => item.id !== view.id)
                  )
                }
              >
                ×
              </button>
            </div>
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
          ) : (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setSearch("");
                setCategory("");
                setStatusFilter("all");
                setSortOrder("updated-desc");
              }}
            >
              مسح عوامل التصفية
            </Button>
          )}
        </Card>
      ) : (
        <div className="document-library-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:gap-4">
          {filtered.map(document => {
            const file = document.file;
            if (!file) return null;
            return (
              <Card
                key={document.id}
                className="document-card document-library-card group flex cursor-pointer flex-col gap-3 rounded-2xl border-border/70 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                role="button"
                tabIndex={0}
                aria-label={`فتح الوثيقة ${document.title}`}
                onClick={() => setSelectedId(document.id)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedId(document.id);
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/[0.08] text-primary ring-1 ring-primary/10">
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
                  <Badge
                    variant="secondary"
                    className="shrink-0 rounded-full px-2.5 py-1 text-[10px]"
                  >
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
        onClick={() => navigate("/documents?create=1")}
        className="document-library-fab group fixed bottom-5 left-5 z-40 h-14 w-14 rounded-full bg-primary p-0 text-primary-foreground shadow-[0_14px_30px_rgba(16,35,63,0.28)] transition-all hover:-translate-y-1 hover:bg-primary/90 hover:shadow-[0_18px_36px_rgba(16,35,63,0.36)] focus-visible:ring-2 focus-visible:ring-[#b4945a] focus-visible:ring-offset-2 sm:bottom-7 sm:left-7"
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
                navigate("/documents?create=1");
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
          if (!open) {
            downloadOperation.cancel();
            setSelectedId(null);
          }
        }}
      >
        <DialogContent
          className={[
            "document-file-dialog h-[100dvh] w-screen max-w-none max-h-none",
            "overflow-y-auto rounded-none border-0 p-3 sm:p-6",
          ].join(" ")}
          dir="rtl"
        >
          {selected && selected.file ? (
            <>
              {downloadOperation.progress ? (
                <div className="fixed inset-x-4 bottom-24 z-[100] mx-auto max-w-lg rounded-2xl border bg-card p-3 shadow-xl">
                  <DocumentOperationProgress
                    progress={downloadOperation.progress}
                  />
                  <Button
                    className="mt-2"
                    variant="outline"
                    onClick={downloadOperation.cancel}
                  >
                    إلغاء التنزيل
                  </Button>
                </div>
              ) : null}
              <DialogHeader>
                <div className="document-file-dialog-header flex flex-wrap items-start justify-between gap-2">
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
                  documentId={selected.id}
                />
              ) : (
                <div className="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
                  تعذر تجهيز رابط المعاينة. أعد فتح الوثيقة.
                </div>
              )}

              {fileUrlQuery.data?.url ? (
                <div className="sticky bottom-0 z-10 grid grid-cols-2 gap-2 rounded-2xl border bg-card/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-sm backdrop-blur sm:static sm:grid-cols-3 sm:bg-card sm:pb-3 sm:shadow-none">
                  <Button
                    variant="outline"
                    className="h-12 gap-2"
                    disabled={Boolean(downloadOperation.progress)}
                    onClick={() => {
                      void downloadOperation
                        .run(options =>
                          downloadDocumentFile(
                            documentFileUrl(selected.id),
                            selected.file!.fileName,
                            options
                          )
                        )
                        .catch(downloadError => {
                          if (
                            downloadError instanceof DOMException &&
                            downloadError.name === "AbortError"
                          ) {
                            toast.info("أُلغيت عملية التنزيل");
                            return;
                          }
                          toast.error(
                            downloadError instanceof Error
                              ? downloadError.message
                              : "تعذر تنزيل الوثيقة"
                          );
                        });
                    }}
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
                        `/documents?document=${encodeURIComponent(selected.id)}`
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
                  getPrintUrl={async () => {
                    const { data } = await fileUrlQuery.refetch({
                      throwOnError: true,
                    });
                    if (!data?.url)
                      throw new Error("تعذر تجديد رابط الملف للطباعة");
                    return data.url;
                  }}
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
