import {
  Archive,
  CalendarDays,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FileText,
  FileUp,
  PenLine,
  FolderOpen,
  LayoutTemplate,
  MoreHorizontal,
  Printer,
  Save,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ownerTrpc as trpc } from "@/lib/ownerTrpc";
import { isLegacyStarterDraft } from "../../../../shared/documentStudio";
import type {
  DocumentTemplate,
  DocumentTemplateField,
  DocumentTemplateFieldType,
  OfficialDocument,
} from "../../../../shared/documentStudio";
import FilePreview from "../document-library/FilePreview";
import PrintDialog from "../document-library/PrintDialog";
import UploadDialog from "../document-library/UploadDialog";
import { signedFileQueryOptions } from "../document-library/signedFileQueryOptions";
import DocumentOperationProgress from "../document-progress/DocumentOperationProgress";
import { useDocumentProgress } from "../document-progress/useDocumentProgress";
import DocumentEditor from "./DocumentEditor";
import DocumentLetterhead from "./DocumentLetterhead";
import DocumentSignatureBlock from "./DocumentSignatureBlock";
import DocumentWatermark from "./DocumentWatermark";
import { formatDocumentDate } from "./formatDocumentDate";
import {
  DEFAULT_DOCUMENT_RECIPIENT_PLACEHOLDER,
  DOCUMENT_RECIPIENT_LINE_KEY,
  getDocumentRecipientLine,
  withDocumentRecipientLine,
} from "./documentRecipient";
import { applyFieldValues, contentForSave } from "./documentEditorContent";
import {
  isDocumentFormDirty,
  missingRequiredTemplateFields,
  makeDocumentNumber,
  normalizeTemplateFieldValues,
  parseDocumentDate,
} from "./documentFormState";
import { applyDocumentTemplateVariables } from "../../../../shared/documentTemplateVariables";
import { importDocxTemplate } from "./docxTemplateImporter";
import ResponsiveA4Preview from "./ResponsiveA4Preview";
import WorkspaceWelcome from "./WorkspaceWelcome";
import DocumentLibraryPage from "../document-library/DocumentLibraryPage";
import { workspaceTabFromSearch, type WorkspaceTab } from "./workspaceRoutes";
import DocumentStudioPrintDialog from "./DocumentStudioPrintDialog";
import {
  documentFileUrl,
  downloadA4PageAsPng,
  downloadDocumentFile,
  shareDocument,
} from "./documentActions";

type StudioTab = WorkspaceTab;

const EMPTY_DOCUMENT_CONTENT: Record<string, unknown> = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const CATEGORIES = [
  { value: "general", label: "عام" },
  { value: "administrative", label: "إداري" },
  { value: "personnel", label: "شؤون الموظفين" },
  { value: "correspondence", label: "مراسلات" },
];

function defaultFieldValues(
  fields: DocumentTemplateField[]
): Record<string, string> {
  return Object.fromEntries(
    fields.map(field => [field.key, field.defaultValue ?? ""])
  );
}

function formatArabicDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar", {
    day: "numeric",
    month: "long",
    year: "numeric",
    numberingSystem: "latn",
  }).format(date);
}

function dateInputValue(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function makeDocumentDate(value: string): string {
  if (value.length > 0 && !value.trim()) return " ";
  return parseDocumentDate(value) ?? "";
}

function statusLabel(status: OfficialDocument["status"]): string {
  if (status === "issued") return "صادرة";
  if (status === "archived") return "مؤرشفة";
  return "مسودة";
}

function newTemplateField(index: number): DocumentTemplateField {
  return {
    key: `field_${index + 1}`,
    label: "حقل جديد",
    type: "text",
    required: false,
  };
}

export default function DocumentStudioPage() {
  const routeSearch = useSearch();
  const [, setLocation] = useLocation();
  const downloadOperation = useDocumentProgress();
  const [activeTab, setActiveTab] = useState<StudioTab>(() =>
    workspaceTabFromSearch(window.location.search)
  );
  const [previewMode, setPreviewMode] = useState(false);
  const [isCreatingDocument, setIsCreatingDocument] = useState(false);
  const [creationDialogOpen, setCreationDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPrintOpen, setImportPrintOpen] = useState(false);
  const [nativePrintOpen, setNativePrintOpen] = useState(false);
  const documentPageRef = useRef<HTMLDivElement>(null);
  const handledPrintIntentRef = useRef<string | null>(null);
  const [search, setSearch] = useState("");
  const [documentStatusFilter, setDocumentStatusFilter] = useState<
    "all" | "draft" | "issued" | "archived"
  >("all");

  const selectWorkspaceTab = (tab: StudioTab) => {
    setActiveTab(tab);
    if (tab === "documents") setDocumentStatusFilter("all");
    if (tab === "archive") setDocumentStatusFilter("archived");
    const params = new URLSearchParams(window.location.search);
    params.delete("status");
    if (tab === "documents") params.delete("tab");
    else params.set("tab", tab);
    const query = params.toString();
    setLocation(query ? `/documents?${query}` : "/documents");
  };

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null
  );
  useEffect(() => {
    const params = new URLSearchParams(routeSearch);
    const documentId = params.get("document");
    if (documentId) {
      setActiveTab("documents");
      setSelectedDocumentId(documentId);
      setPreviewMode(true);
    }
    if (params.has("tab")) {
      const nextTab = workspaceTabFromSearch(routeSearch);
      setActiveTab(nextTab);
      if (nextTab === "archive") setDocumentStatusFilter("archived");
    }
    const status = params.get("status");
    if (status === "draft" || status === "issued" || status === "archived") {
      setDocumentStatusFilter(status);
      setActiveTab(status === "archived" ? "archive" : "documents");
    }
  }, [routeSearch]);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [selectedTemplateRevision, setSelectedTemplateRevision] = useState<
    number | null
  >(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentCategory, setDocumentCategory] = useState("general");
  const [documentSubject, setDocumentSubject] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [documentContent, setDocumentContent] = useState(
    EMPTY_DOCUMENT_CONTENT
  );
  const [documentFieldValues, setDocumentFieldValues] = useState<
    Record<string, string>
  >({});
  const [templateValuesApplied, setTemplateValuesApplied] = useState(false);
  const [manualTemplateEditing, setManualTemplateEditing] = useState(false);

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  );
  const [editingTemplateRevision, setEditingTemplateRevision] = useState(1);
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateCategory, setTemplateCategory] = useState("general");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateContent, setTemplateContent] = useState(
    EMPTY_DOCUMENT_CONTENT
  );
  const [templateFields, setTemplateFields] = useState<DocumentTemplateField[]>(
    []
  );
  const templateImportInputRef = useRef<HTMLInputElement>(null);
  const datePickerRef = useRef<HTMLInputElement>(null);
  const [importingTemplate, setImportingTemplate] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("create") !== "1") return;

    setCreationDialogOpen(true);
    // Consume the one-shot command so refreshing /studio never opens the
    // creation dialog again without an explicit click on the create button.
    url.searchParams.delete("create");
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
    setActiveTab("documents");
  }, [routeSearch]);

  useEffect(() => {
    const params = new URLSearchParams(routeSearch);
    const uploadRequested = params.get("upload") === "1";

    if (!uploadRequested) return;

    setActiveTab("documents");
    setImportDialogOpen(true);
    params.delete("upload");

    const query = params.toString();
    setLocation(query ? `/documents?${query}` : "/documents");
  }, [routeSearch, setLocation]);

  const utils = trpc.useUtils();
  const documentsQuery = trpc.documentStudio.listDocuments.useQuery();
  const templatesQuery = trpc.documentStudio.listTemplates.useQuery();
  const contactsQuery = trpc.workspace.contacts.list.useQuery(undefined, {
    enabled: activeTab === "documents" && !previewMode,
    staleTime: 30_000,
  });
  const organizationContext = trpc.organizations.context.useQuery();
  const platformDocumentSettings = trpc.platformDocumentSettings.get.useQuery();

  const documents = documentsQuery.data ?? [];
  const userDocuments = useMemo(
    () => documents.filter(document => !isLegacyStarterDraft(document)),
    [documents]
  );
  const templates = templatesQuery.data ?? [];
  const selectedDocument = useMemo(
    () => userDocuments.find(item => item.id === selectedDocumentId) ?? null,
    [userDocuments, selectedDocumentId]
  );
  const selectedTemplate = useMemo(
    () => templates.find(item => item.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );
  const documentVersionsQuery =
    trpc.documentStudio.listDocumentVersions.useQuery(
      { id: selectedDocument?.id ?? "" },
      {
        enabled: Boolean(selectedDocument && activeTab !== "templates"),
      }
    );
  const importedFileUrlQuery = trpc.documentStudio.getFileUrl.useQuery(
    { id: selectedDocument?.id ?? "" },
    {
      enabled: Boolean(selectedDocument?.file),
      ...signedFileQueryOptions,
    }
  );
  useEffect(() => {
    const params = new URLSearchParams(routeSearch);
    if (params.get("print") !== "1") {
      handledPrintIntentRef.current = null;
      return;
    }
    if (handledPrintIntentRef.current === routeSearch) return;

    const documentId = params.get("document");
    if (!documentId || documentsQuery.isLoading) return;

    if (!selectedDocument || selectedDocument.id !== documentId) {
      handledPrintIntentRef.current = routeSearch;
      params.delete("print");
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        query
          ? `${window.location.pathname}?${query}${window.location.hash}`
          : `${window.location.pathname}${window.location.hash}`
      );
      toast.error("لم يتم العثور على الوثيقة المطلوب طباعتها");
      return;
    }

    if (selectedDocument.file && importedFileUrlQuery.isLoading) return;
    if (selectedDocument.file && !importedFileUrlQuery.data?.url) {
      if (importedFileUrlQuery.isError) {
        handledPrintIntentRef.current = routeSearch;
        params.delete("print");
        const query = params.toString();
        window.history.replaceState(
          {},
          "",
          query
            ? `${window.location.pathname}?${query}${window.location.hash}`
            : `${window.location.pathname}${window.location.hash}`
        );
        toast.error("تعذر تجهيز الملف للطباعة. أعد فتح الوثيقة وحاول مجدداً.");
      }
      return;
    }

    handledPrintIntentRef.current = routeSearch;
    params.delete("print");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      query
        ? `${window.location.pathname}?${query}${window.location.hash}`
        : `${window.location.pathname}${window.location.hash}`
    );
    setPreviewMode(false);
    if (selectedDocument.file) setImportPrintOpen(true);
    else setNativePrintOpen(true);
  }, [
    routeSearch,
    documentsQuery.isLoading,
    selectedDocument,
    importedFileUrlQuery.isLoading,
    importedFileUrlQuery.data?.url,
    importedFileUrlQuery.isError,
  ]);
  const documentOrganizationId =
    selectedDocument?.organizationId ??
    organizationContext.data?.organizationId;
  const letterheadSettings = trpc.documentStudio.getLetterheadSettings.useQuery(
    { organizationId: documentOrganizationId },
    { enabled: Boolean(documentOrganizationId) }
  );
  const documentTemplateFields = selectedDocument
    ? selectedDocument.templateFieldsSnapshot
    : (selectedTemplate?.fields ?? []);
  const editingTemplate = useMemo(
    () => templates.find(item => item.id === editingTemplateId) ?? null,
    [editingTemplateId, templates]
  );

  const visibleDocuments = useMemo(() => {
    const source = userDocuments.filter(
      item =>
        !item.file &&
        (documentStatusFilter === "all" || item.status === documentStatusFilter)
    );
    const normalizedSearch = search.trim().toLocaleLowerCase();
    if (!normalizedSearch) return source;
    return source.filter(item =>
      [item.title, item.subject, item.serialCode, item.category]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedSearch)
    );
  }, [documentStatusFilter, userDocuments, search]);

  const visibleTemplates = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    if (!normalizedSearch) return templates.filter(item => item.isActive);
    return templates.filter(
      item =>
        item.isActive &&
        [item.title, item.category, item.description ?? ""]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedSearch)
    );
  }, [search, templates]);

  useEffect(() => {
    if (!selectedDocument) return;
    setDocumentTitle(selectedDocument.title);
    setDocumentCategory(selectedDocument.category);
    setDocumentSubject(selectedDocument.subject);
    setDocumentDate(dateInputValue(selectedDocument.documentDate));
    setDocumentContent(selectedDocument.content);
    setDocumentFieldValues(selectedDocument.fieldValues);
    setTemplateValuesApplied(true);
    setManualTemplateEditing(true);
    setSelectedTemplateId(selectedDocument.templateId);
    setSelectedTemplateRevision(selectedDocument.templateRevision);
  }, [selectedDocument]);

  const handleDocumentContentChange = useCallback(
    (content: Record<string, unknown>) => setDocumentContent(content),
    []
  );
  const handleTemplateContentChange = useCallback(
    (content: Record<string, unknown>) => setTemplateContent(content),
    []
  );

  const recordDocumentPrintMutation =
    trpc.documentStudio.recordPrint.useMutation({
      onError: error => toast.error(error.message),
    });

  const createDocumentMutation = trpc.documentStudio.createDocument.useMutation(
    {
      onSuccess: async saved => {
        await utils.documentStudio.listDocuments.invalidate();
        setSelectedDocumentId(saved.id);
        setSelectedTemplateId(saved.templateId);
        setSelectedTemplateRevision(saved.templateRevision);
        toast.success("تم حفظ الوثيقة");
      },
      onError: error => toast.error(error.message),
    }
  );

  const updateDocumentMutation = trpc.documentStudio.updateDocument.useMutation(
    {
      onSuccess: async saved => {
        await utils.documentStudio.listDocuments.invalidate();
        setSelectedDocumentId(saved.id);
        setIsCreatingDocument(false);
        setDocumentTitle(saved.title);
        setDocumentCategory(saved.category);
        setDocumentSubject(saved.subject);
        setDocumentDate(dateInputValue(saved.documentDate));
        setDocumentContent(saved.content);
        setDocumentFieldValues(saved.fieldValues);
        setSelectedTemplateId(saved.templateId);
        setSelectedTemplateRevision(saved.templateRevision);
        setTemplateValuesApplied(true);
        setPreviewMode(false);
        toast.success("تم تحديث الوثيقة");
      },
      onError: error => toast.error(error.message),
    }
  );

  const restoreDocumentVersionMutation =
    trpc.documentStudio.restoreDocumentVersion.useMutation({
      onSuccess: async saved => {
        await Promise.all([
          utils.documentStudio.listDocuments.invalidate(),
          utils.documentStudio.listDocumentVersions.invalidate({
            id: saved.id,
          }),
        ]);
        setSelectedDocumentId(saved.id);
        setDocumentTitle(saved.title);
        setDocumentCategory(saved.category);
        setDocumentSubject(saved.subject);
        setDocumentDate(dateInputValue(saved.documentDate));
        setDocumentContent(saved.content);
        setDocumentFieldValues(saved.fieldValues);
        setSelectedTemplateId(saved.templateId);
        setSelectedTemplateRevision(saved.templateRevision);
        setTemplateValuesApplied(true);
        toast.success(
          "تمت استعادة النسخة وحفظ الحالة السابقة في سجل الإصدارات"
        );
      },
      onError: error => toast.error(error.message),
    });

  const createTemplateMutation = trpc.documentStudio.createTemplate.useMutation(
    {
      onSuccess: async result => {
        await utils.documentStudio.listTemplates.invalidate();
        setEditingTemplateId(result.template.id);
        setEditingTemplateRevision(result.template.revision);
        if (result.auditLogRecorded) {
          toast.success("تم حفظ النموذج");
        } else {
          toast.warning(
            "تم حفظ النموذج، لكن تعذر تسجيل العملية في سجل الحركات"
          );
        }
      },
      onError: error => toast.error(error.message),
    }
  );

  const updateTemplateMutation = trpc.documentStudio.updateTemplate.useMutation(
    {
      onSuccess: async result => {
        await utils.documentStudio.listTemplates.invalidate();
        setEditingTemplateId(result.template.id);
        setEditingTemplateRevision(result.template.revision);
        if (result.auditLogRecorded) {
          toast.success("تم تحديث النموذج");
        } else {
          toast.warning(
            "تم تحديث النموذج، لكن تعذر تسجيل العملية في سجل الحركات"
          );
        }
      },
      onError: error => toast.error(error.message),
    }
  );

  const issueDocumentMutation = trpc.documentStudio.issueDocument.useMutation({
    onSuccess: async result => {
      await utils.documentStudio.listDocuments.invalidate();
      setSelectedDocumentId(result.document.id);
      toast.success(
        result.alreadyIssued
          ? `الوثيقة صادرة مسبقاً بالرقم ${result.document.serialCode}`
          : `تم إصدار الوثيقة بالرقم ${result.document.serialCode}`
      );
      if (!result.auditLogRecorded) {
        toast.warning(
          "تم إصدار الوثيقة، لكن تعذر تسجيل العملية في سجل الحركات"
        );
      }
    },
    onError: error => toast.error(error.message),
  });

  const archiveDocumentMutation =
    trpc.documentStudio.archiveDocument.useMutation({
      onSuccess: async result => {
        await utils.documentStudio.listDocuments.invalidate();
        setSelectedDocumentId(result.document.id);
        setActiveTab("archive");
        toast.success("تم نقل الوثيقة إلى الأرشيف");
        if (!result.auditLogRecorded) {
          toast.warning("تمت الأرشفة، لكن تعذر تسجيل العملية في سجل الحركات");
        }
      },
      onError: error => toast.error(error.message),
    });

  const deleteDocumentMutation = trpc.documentStudio.deleteDocument.useMutation(
    {
      onSuccess: async result => {
        await utils.documentStudio.listDocuments.invalidate();
        setSelectedDocumentId(null);
        setIsCreatingDocument(false);
        setPreviewMode(false);
        toast.success("تم حذف الوثيقة");
        if (!result.fileCleanupSucceeded) {
          toast.warning("حُذف سجل الوثيقة، لكن تعذر حذف الملف من التخزين.");
        }
        if (!result.auditLogRecorded) {
          toast.warning("تم الحذف، لكن تعذر تسجيل العملية في سجل الحركات.");
        }
      },
      onError: error => toast.error(error.message),
    }
  );

  const deactivateTemplateMutation =
    trpc.documentStudio.deactivateTemplate.useMutation({
      onSuccess: async result => {
        await utils.documentStudio.listTemplates.invalidate();
        setEditingTemplateId(null);
        if (result.auditLogRecorded) {
          toast.success("تم إيقاف النموذج مع الاحتفاظ بسجلاته");
        } else {
          toast.warning(
            "تم إيقاف النموذج، لكن تعذر تسجيل العملية في سجل الحركات"
          );
        }
      },
      onError: error => toast.error(error.message),
    });

  function startNewDocument() {
    setIsCreatingDocument(true);
    setSelectedDocumentId(null);
    setSelectedTemplateId(null);
    setSelectedTemplateRevision(null);
    setPreviewMode(false);
    setDocumentTitle("");
    setDocumentCategory("general");
    setDocumentSubject("");
    setDocumentDate("");
    setDocumentContent(EMPTY_DOCUMENT_CONTENT);
    setDocumentFieldValues({});
    setTemplateValuesApplied(false);
    setManualTemplateEditing(false);
    setActiveTab("documents");
  }

  function useTemplate(template: DocumentTemplate) {
    setIsCreatingDocument(true);
    setSelectedDocumentId(null);
    setSelectedTemplateId(template.id);
    setSelectedTemplateRevision(template.revision);
    setPreviewMode(false);
    setDocumentTitle(template.title);
    setDocumentCategory(template.category);
    setDocumentSubject("");
    setDocumentDate("");
    setDocumentContent(template.content);
    setDocumentFieldValues(defaultFieldValues(template.fields));
    setTemplateValuesApplied(false);
    setManualTemplateEditing(false);
    setActiveTab("documents");
  }

  function saveDocument() {
    if (!documentTitle.trim()) {
      toast.error("أدخل اسم الوثيقة أولاً");
      return;
    }
    const validDate = parseDocumentDate(documentDate);
    if (documentDate.trim() && !validDate) {
      toast.error("أدخل تاريخاً صالحاً أو اترك الحقل فارغاً");
      return;
    }
    const missingFields = missingRequiredTemplateFields(
      documentTemplateFields,
      documentFieldValues
    );
    if (selectedTemplateId && missingFields.length > 0) {
      toast.error(
        `أكمل الحقول المطلوبة: ${missingFields
          .map(field => field.label)
          .join("، ")}`
      );
      return;
    }

    const normalizedFieldValues = normalizeTemplateFieldValues(
      documentTemplateFields,
      documentFieldValues
    );
    const input = {
      title: documentTitle.trim(),
      category: documentCategory,
      subject: makeDocumentNumber(documentSubject),
      content: applyDocumentTemplateVariables(
        contentForSave(
          documentContent,
          normalizedFieldValues,
          Boolean(selectedTemplateId) && !templateValuesApplied
        ),
        getDocumentSystemVariables()
      ),
      fieldValues: withDocumentRecipientLine(
        normalizedFieldValues,
        documentRecipientLine
      ),
      documentDate:
        documentDate.length > 0 && !documentDate.trim()
          ? " "
          : (validDate ?? undefined),
      templateId: selectedTemplateId,
      templateRevision: selectedTemplateRevision,
    };

    if (selectedDocument) {
      updateDocumentMutation.mutate({
        ...input,
        id: selectedDocument.id,
        expectedUpdatedAt: selectedDocument.updatedAt,
      });
    } else {
      createDocumentMutation.mutate(input);
    }
  }

  async function downloadSelectedDocument() {
    if (!selectedDocument) return;
    try {
      if (selectedDocument.file) {
        await downloadOperation.run(options =>
          downloadDocumentFile(
            documentFileUrl(selectedDocument.id),
            selectedDocument.file!.fileName,
            options
          )
        );
        toast.success("بدأ تنزيل الملف المستورد");
        return;
      }
      if (!documentPageRef.current) {
        throw new Error("تعذر العثور على صفحة الوثيقة الحالية");
      }
      const baseName = (selectedDocument.title || "وثيقة")
        .replace(/[\\/:*?"<>|]+/g, "-")
        .trim();
      const page = documentPageRef.current;
      await downloadOperation.run(options =>
        downloadA4PageAsPng(page, `${baseName || "وثيقة"}.png`, options)
      );
      toast.success("بدأ تنزيل الوثيقة كصورة PNG عالية الجودة");
    } catch (downloadError) {
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
    }
  }

  async function shareSelectedDocument() {
    if (!selectedDocument) {
      toast.error("احفظ الوثيقة أولاً قبل مشاركتها");
      return;
    }
    try {
      const result = await shareDocument({
        documentId: selectedDocument.id,
        title: selectedDocument.title,
        text: selectedDocument.subject || selectedDocument.title,
      });
      toast.success(
        result === "copied"
          ? "تم نسخ رابط الوثيقة الآمن"
          : "تم فتح خيارات مشاركة الوثيقة"
      );
    } catch (shareError) {
      if (
        shareError instanceof DOMException &&
        shareError.name === "AbortError"
      ) {
        return;
      }
      toast.error(
        shareError instanceof Error
          ? shareError.message
          : "تعذرت مشاركة الوثيقة"
      );
    }
  }

  function startNewTemplate() {
    setEditingTemplateId(null);
    setEditingTemplateRevision(1);
    setTemplateTitle("");
    setTemplateCategory("general");
    setTemplateDescription("");
    setTemplateContent(EMPTY_DOCUMENT_CONTENT);
    setTemplateFields([]);
  }

  async function importTemplateFromWord(file: File | null) {
    if (!file) return;
    setImportingTemplate(true);
    try {
      const imported = await importDocxTemplate(file);
      setEditingTemplateId(null);
      setEditingTemplateRevision(1);
      setTemplateTitle(current =>
        current.trim()
          ? current
          : imported.sourceFileName.replace(/\.docx$/iu, "")
      );
      setTemplateContent(imported.content);
      setTemplateFields(imported.fields);
      setTemplateDescription(current =>
        current.trim()
          ? current
          : `تم الاستيراد من ملف Word: ${imported.sourceFileName}`
      );
      toast.success(
        imported.fields.length
          ? `تم استيراد Word واكتشاف ${imported.fields.length} حقلاً متغيراً`
          : "تم استيراد Word؛ لم تُكتشف متغيرات تلقائية"
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر استيراد ملف Word"
      );
    } finally {
      setImportingTemplate(false);
      if (templateImportInputRef.current) {
        templateImportInputRef.current.value = "";
      }
    }
  }

  function selectTemplate(template: DocumentTemplate) {
    setEditingTemplateId(template.id);
    setEditingTemplateRevision(template.revision);
    setTemplateTitle(template.title);
    setTemplateCategory(template.category);
    setTemplateDescription(template.description ?? "");
    setTemplateContent(template.content);
    setTemplateFields(template.fields);
  }

  function saveTemplate() {
    if (!templateTitle.trim()) {
      toast.error("أدخل اسم النموذج أولاً");
      return;
    }

    const input = {
      title: templateTitle.trim(),
      category: templateCategory,
      description: templateDescription.trim() || null,
      content: templateContent,
      fields: templateFields,
    };

    if (editingTemplateId) {
      updateTemplateMutation.mutate({
        ...input,
        id: editingTemplateId,
        expectedRevision: editingTemplateRevision,
      });
    } else {
      createTemplateMutation.mutate(input);
    }
  }

  function updateTemplateField(
    index: number,
    patch: Partial<DocumentTemplateField>
  ) {
    setTemplateFields(current =>
      current.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field
      )
    );
  }

  function updateTemplateFieldOptions(index: number, value: string) {
    const labels = value
      .split(",")
      .map(label => label.trim())
      .filter(Boolean);
    updateTemplateField(index, {
      options: labels.map((label, optionIndex) => ({
        value: `option_${optionIndex + 1}`,
        label,
      })),
    });
  }

  const settings = letterheadSettings.data;
  const organizationName =
    settings?.departmentName ??
    (documentOrganizationId === organizationContext.data?.organizationId
      ? organizationContext.data?.organizationName
      : null) ??
    "";

  function getDocumentSystemVariables(): Record<string, string> {
    const values: Record<string, string> = {
      organization: organizationName,
      date: formatDocumentDate(
        makeDocumentDate(documentDate),
        platformDocumentSettings.data?.documentDateFormat
      ),
      subject: documentSubject.trim(),
      number: makeDocumentNumber(documentSubject),
    };
    if (selectedDocument?.serialCode) {
      values.number = selectedDocument.serialCode;
    }
    return values;
  }

  const documentPreviewContent =
    selectedDocument && selectedDocument.status !== "draft"
      ? applyDocumentTemplateVariables(documentContent, {
          number: selectedDocument.serialCode,
        })
      : selectedTemplateId && !templateValuesApplied
        ? applyDocumentTemplateVariables(
            applyFieldValues(
              documentContent,
              normalizeTemplateFieldValues(
                documentTemplateFields,
                documentFieldValues
              )
            ),
            getDocumentSystemVariables()
          )
        : documentContent;
  const logoUrl = settings?.logoUrl ?? null;
  const documentWatermarkText =
    platformDocumentSettings.data?.watermarkText?.replace(/^وثائقي$/, "") ?? "";
  const dividerColor =
    platformDocumentSettings.data?.headerDividerColor ?? "#334155";
  const isSavingDocument =
    createDocumentMutation.isPending || updateDocumentMutation.isPending;
  const isSavingTemplate =
    createTemplateMutation.isPending || updateTemplateMutation.isPending;
  const canEditDocument =
    activeTab !== "archive" &&
    !isSavingDocument &&
    !issueDocumentMutation.isPending &&
    (!selectedDocument || selectedDocument.status === "draft");
  const isNewDocumentWorkspace = isCreatingDocument && !selectedDocument;
  const canIssueDocuments =
    Boolean(letterheadSettings.data) &&
    (organizationContext.data?.isOwner === true ||
      ["system_admin", "organization_admin"].includes(
        organizationContext.data?.role ?? ""
      ));
  const hasUnsavedDocumentChanges = selectedDocument
    ? isDocumentFormDirty(selectedDocument, {
        title: documentTitle,
        category: documentCategory,
        subject: documentSubject,
        documentDate,
        content: documentContent,
        fieldValues: documentFieldValues,
        templateId: selectedTemplateId,
        templateRevision: selectedTemplateRevision,
      })
    : false;
  const documentRecipientLine = getDocumentRecipientLine(documentFieldValues);
  // prettier-ignore
  const documentFontStyle = {
    fontFamily: platformDocumentSettings.data?.documentFontFamily ?? "Cairo",
    fontSize: `${platformDocumentSettings.data?.documentFontSizePt ?? 12}pt`,
    fontWeight: platformDocumentSettings.data?.documentFontWeight ?? 400,
    color: platformDocumentSettings.data?.documentFontColor ?? "#0f172a",
  };
  // prettier-ignore
  const recipientFontStyle = {
    fontFamily: platformDocumentSettings.data?.recipientFontFamily ?? "Cairo",
    fontSize: `${platformDocumentSettings.data?.recipientFontSizePt ?? 12}pt`,
    fontWeight: platformDocumentSettings.data?.recipientFontWeight ?? 600,
    color: platformDocumentSettings.data?.recipientFontColor ?? "#0f172a",
  };
  const isDataTabActive = !previewMode && !nativePrintOpen && !importPrintOpen;
  const isPreviewTabActive =
    previewMode && !nativePrintOpen && !importPrintOpen;
  const isPrintTabActive = nativePrintOpen || importPrintOpen;
  const showMobileDocumentTabs =
    (activeTab === "documents" || activeTab === "archive") &&
    (selectedDocument || isCreatingDocument);

  return (
    <div className="document-studio-shell space-y-4" dir="rtl">
      {downloadOperation.progress ? (
        <div className="mb-3 w-full max-w-lg rounded-2xl border bg-card p-3 shadow-sm">
          <DocumentOperationProgress progress={downloadOperation.progress} />
          <Button
            className="mt-2"
            variant="outline"
            onClick={downloadOperation.cancel}
          >
            إلغاء التنزيل
          </Button>
        </div>
      ) : null}
      <div className="document-page-header document-studio-header document-studio-no-print">
        <div className="document-studio-heading">
          <p className="document-section-label mb-1">وثائقي · إدارة الوثائق</p>
          <h1 className="text-2xl font-bold text-foreground">إدارة الوثائق</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            أنشئ، نظّم، واطبع. وثائقك وقوالبك وملفاتك في مكان واحد.
          </p>
        </div>
        <div className="document-studio-controls">
          <div
            className="document-studio-tabs"
            aria-label="مساحات الوثائق"
            role="tablist"
          >
            <Button
              size="sm"
              variant={activeTab === "documents" ? "default" : "outline"}
              onClick={() => selectWorkspaceTab("documents")}
              aria-pressed={activeTab === "documents"}
              role="tab"
              aria-selected={activeTab === "documents"}
            >
              <FileText className="ml-2 h-4 w-4" />
              الوثائق
            </Button>
            <Button
              variant={activeTab === "archive" ? "default" : "outline"}
              onClick={() => selectWorkspaceTab("archive")}
              aria-pressed={activeTab === "archive"}
              role="tab"
              aria-selected={activeTab === "archive"}
            >
              <Archive className="ml-2 h-4 w-4" />
              الأرشيف
            </Button>
            <Button
              variant={activeTab === "templates" ? "default" : "outline"}
              onClick={() => selectWorkspaceTab("templates")}
              aria-pressed={activeTab === "templates"}
              role="tab"
              aria-selected={activeTab === "templates"}
            >
              <LayoutTemplate className="ml-2 h-4 w-4" />
              القوالب
            </Button>
            <Button
              variant={activeTab === "files" ? "default" : "outline"}
              onClick={() => selectWorkspaceTab("files")}
              aria-pressed={activeTab === "files"}
              role="tab"
              aria-selected={activeTab === "files"}
            >
              <FolderOpen className="ml-2 h-4 w-4" />
              الملفات المرفقة
            </Button>
          </div>
          <div className="document-studio-actions">
            {activeTab !== "files" ? (
              <>
                <Button
                  className="hidden md:inline-flex"
                  size="sm"
                  variant={previewMode ? "secondary" : "outline"}
                  onClick={() => setPreviewMode(current => !current)}
                >
                  {previewMode ? (
                    <EyeOff className="ml-2 h-4 w-4" />
                  ) : (
                    <Eye className="ml-2 h-4 w-4" />
                  )}
                  {previewMode ? "العودة للتحرير" : "معاينة الوثيقة"}
                </Button>
                {activeTab === "documents" || activeTab === "archive" ? (
                  <>
                    {!previewMode ? (
                      <div className="document-studio-secondary-actions">
                        <Button
                          className="hidden md:inline-flex"
                          size="sm"
                          variant="outline"
                          disabled={Boolean(
                            selectedDocument?.file &&
                            !importedFileUrlQuery.data?.url
                          )}
                          onClick={() => {
                            if (selectedDocument?.file)
                              setImportPrintOpen(true);
                            else setNativePrintOpen(true);
                          }}
                        >
                          <Printer className="ml-2 h-4 w-4" />
                          طباعة / PDF
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            !selectedDocument ||
                            Boolean(
                              selectedDocument.file &&
                              !importedFileUrlQuery.data?.url
                            )
                          }
                          onClick={downloadSelectedDocument}
                        >
                          <Download className="ml-2 h-4 w-4" />
                          تنزيل
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!selectedDocument}
                          onClick={() => void shareSelectedDocument()}
                        >
                          <Share2 className="ml-2 h-4 w-4" />
                          مشاركة رابط
                        </Button>
                      </div>
                    ) : null}
                    {!previewMode ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="document-studio-more-actions"
                            aria-label="إجراءات الوثيقة الإضافية"
                          >
                            <MoreHorizontal className="size-4" />
                            <span>المزيد</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuLabel>إجراءات الوثيقة</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={Boolean(
                              selectedDocument?.file &&
                              !importedFileUrlQuery.data?.url
                            )}
                            onSelect={() => {
                              if (selectedDocument?.file)
                                setImportPrintOpen(true);
                              else setNativePrintOpen(true);
                            }}
                          >
                            <Printer className="size-4" />
                            طباعة / PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              !selectedDocument ||
                              Boolean(
                                selectedDocument.file &&
                                !importedFileUrlQuery.data?.url
                              )
                            }
                            onSelect={() => void downloadSelectedDocument()}
                          >
                            <Download className="size-4" />
                            تنزيل الملف
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!selectedDocument}
                            onSelect={() => void shareSelectedDocument()}
                          >
                            <Share2 className="size-4" />
                            مشاركة الرابط
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                    {isNewDocumentWorkspace ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsCreatingDocument(false)}
                      >
                        <FolderOpen className="ml-2 h-4 w-4" />
                        العودة إلى الوثائق
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="hidden md:inline-flex"
                        onClick={() => setCreationDialogOpen(true)}
                        aria-haspopup="dialog"
                        aria-expanded={creationDialogOpen}
                      >
                        <FilePlus2 className="ml-2 h-4 w-4" />+ كتاب رسمي جديد
                      </Button>
                    )}
                  </>
                ) : (
                  <Button size="sm" onClick={startNewTemplate}>
                    <FilePlus2 className="ml-2 h-4 w-4" />
                    نموذج جديد
                  </Button>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {showMobileDocumentTabs ? (
        <nav
          className="sticky top-[calc(52px+env(safe-area-inset-top))] z-30 grid grid-cols-3 gap-1 rounded-xl border bg-card p-1 shadow-sm md:hidden"
          role="tablist"
          aria-label="خطوات إعداد الوثيقة"
        >
          <Button
            type="button"
            size="sm"
            className="h-10 gap-1 px-2 text-xs"
            variant={isDataTabActive ? "default" : "ghost"}
            role="tab"
            aria-selected={isDataTabActive}
            onClick={() => {
              setPreviewMode(false);
              setNativePrintOpen(false);
              setImportPrintOpen(false);
            }}
          >
            <FileText className="size-4" />
            البيانات
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-10 gap-1 px-2 text-xs"
            variant={isPreviewTabActive ? "default" : "ghost"}
            role="tab"
            aria-selected={isPreviewTabActive}
            onClick={() => {
              setPreviewMode(true);
              setNativePrintOpen(false);
              setImportPrintOpen(false);
            }}
          >
            <Eye className="size-4" />
            المعاينة
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-10 gap-1 px-2 text-xs"
            variant={isPrintTabActive ? "default" : "ghost"}
            role="tab"
            aria-selected={isPrintTabActive}
            disabled={Boolean(
              selectedDocument?.file && !importedFileUrlQuery.data?.url
            )}
            onClick={() => {
              setPreviewMode(true);
              if (selectedDocument?.file) setImportPrintOpen(true);
              else setNativePrintOpen(true);
            }}
          >
            <Printer className="size-4" />
            الطباعة
          </Button>
        </nav>
      ) : null}

      {activeTab === "files" ? (
        <DocumentLibraryPage embedded />
      ) : (
        <>
          {activeTab === "documents" || activeTab === "archive" ? (
            <nav
              aria-label="تصفية الوثائق حسب الحالة"
              className="document-studio-no-print document-status-tabs"
            >
              {(
                [
                  ["all", "الكل"],
                  ["draft", "مسودات"],
                  ["issued", "صادرة"],
                  ["archived", "مؤرشفة"],
                ] as const
              ).map(([status, label]) => {
                const count = userDocuments.filter(
                  document =>
                    !document.file &&
                    (status === "all" || document.status === status)
                ).length;
                const active = documentStatusFilter === status;
                return (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    aria-pressed={active}
                    onClick={() => {
                      setDocumentStatusFilter(status);
                      setActiveTab(
                        status === "archived" ? "archive" : "documents"
                      );
                      const params = new URLSearchParams(
                        window.location.search
                      );
                      params.delete("tab");
                      if (status === "all") params.delete("status");
                      else params.set("status", status);
                      const query = params.toString();
                      setLocation(query ? `/documents?${query}` : "/documents");
                    }}
                  >
                    {label}
                    <span className="mr-2 rounded-full bg-background/15 px-1.5 text-[11px] tabular-nums">
                      {count}
                    </span>
                  </Button>
                );
              })}
            </nav>
          ) : null}

          <div
            className={`grid grid-cols-1 gap-4 ${
              previewMode || isNewDocumentWorkspace
                ? "xl:grid-cols-1"
                : "xl:grid-cols-[360px_minmax(0,1fr)]"
            }`}
          >
            <aside
              className={`document-studio-no-print space-y-3 ${
                previewMode || isNewDocumentWorkspace ? "hidden" : ""
              }`}
            >
              <Card className="p-3">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="ابحث..."
                    className="pr-9"
                  />
                </div>
              </Card>

              {activeTab === "templates" ? (
                <Card className="space-y-2 p-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold">مكتبة النماذج</h2>
                    <Badge variant="secondary">{visibleTemplates.length}</Badge>
                  </div>
                  {templatesQuery.isLoading ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      جارٍ تحميل النماذج...
                    </p>
                  ) : visibleTemplates.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      لا توجد نماذج بعد. أنشئ أول نموذج معتمد.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {visibleTemplates.map(template => (
                        <div
                          key={template.id}
                          className={`rounded-lg border p-3 transition-colors ${editingTemplateId === template.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                        >
                          <button
                            type="button"
                            className="w-full text-right"
                            onClick={() => selectTemplate(template)}
                          >
                            <span className="block font-medium">
                              {template.title}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {template.category} · إصدار {template.revision}
                            </span>
                          </button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 w-full"
                            onClick={() => useTemplate(template)}
                          >
                            استخدام النموذج
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ) : (
                <Card className="space-y-2 p-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold">
                      {activeTab === "archive"
                        ? "الوثائق المؤرشفة"
                        : "قائمة الوثائق"}
                    </h2>
                    <Badge variant="secondary">{visibleDocuments.length}</Badge>
                  </div>
                  {documentsQuery.isLoading ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      جارٍ تحميل الوثائق...
                    </p>
                  ) : visibleDocuments.length === 0 ? (
                    <div className="py-6 text-center">
                      <FolderOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        لا توجد وثائق في هذه القائمة
                      </p>
                    </div>
                  ) : (
                    <div className="document-workspace-list max-h-[70vh] space-y-2 overflow-y-auto">
                      {visibleDocuments.map(document => (
                        <button
                          key={document.id}
                          type="button"
                          onClick={() => {
                            setIsCreatingDocument(false);
                            setSelectedDocumentId(document.id);
                            // Selecting a document is the primary edit action. The
                            // explicit preview button remains available for read-only
                            // viewing and shared links still open in preview mode.
                            setPreviewMode(
                              window.matchMedia("(max-width: 767px)").matches
                            );
                          }}
                          className={`w-full rounded-lg border p-3 text-right transition-colors ${selectedDocumentId === document.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                        >
                          <span className="block truncate font-medium">
                            {document.title}
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {document.subject || document.category}
                          </span>
                          <span className="mt-2 flex items-center justify-between gap-2">
                            <Badge variant="outline">
                              {statusLabel(document.status)}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {formatArabicDate(document.updatedAt)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </aside>

            <main className="min-w-0 space-y-3">
              {activeTab === "templates" ? (
                <Card className="space-y-4 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 document-studio-no-print">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {editingTemplateId
                          ? "تعديل النموذج"
                          : "إنشاء نموذج رسمي"}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        احفظ نصاً أساسياً وحقولاً تُملأ عند إنشاء الوثيقة
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <input
                        ref={templateImportInputRef}
                        type="file"
                        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="hidden"
                        onChange={event =>
                          void importTemplateFromWord(
                            event.target.files?.[0] ?? null
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={importingTemplate}
                        onClick={() => templateImportInputRef.current?.click()}
                      >
                        <FileUp className="ml-2 h-4 w-4" />
                        {importingTemplate
                          ? "جارٍ الاستيراد…"
                          : "استيراد Word كنموذج"}
                      </Button>
                      {editingTemplate ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deactivateTemplateMutation.isPending}
                          onClick={() =>
                            deactivateTemplateMutation.mutate({
                              id: editingTemplate.id,
                              expectedRevision: editingTemplateRevision,
                            })
                          }
                        >
                          <Trash2 className="ml-2 h-4 w-4" />
                          إيقاف النموذج
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        disabled={isSavingTemplate}
                        onClick={saveTemplate}
                      >
                        <Save className="ml-2 h-4 w-4" />
                        حفظ النموذج
                      </Button>
                    </div>
                  </div>

                  <div
                    className={`grid grid-cols-1 gap-3 md:grid-cols-2 document-studio-no-print ${previewMode ? "hidden" : ""}`}
                  >
                    <div className="space-y-1">
                      <label className="text-sm font-medium">اسم النموذج</label>
                      <Input
                        value={templateTitle}
                        onChange={event => setTemplateTitle(event.target.value)}
                        placeholder="مثال: كتاب تكليف"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">التصنيف</label>
                      <select
                        value={templateCategory}
                        onChange={event =>
                          setTemplateCategory(event.target.value)
                        }
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      >
                        {CATEGORIES.map(category => (
                          <option key={category.value} value={category.value}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-sm font-medium">وصف النموذج</label>
                      <Textarea
                        value={templateDescription}
                        onChange={event =>
                          setTemplateDescription(event.target.value)
                        }
                        rows={2}
                        placeholder="وصف مختصر لاستخدام النموذج"
                      />
                    </div>
                  </div>

                  <section
                    className={`space-y-3 document-studio-no-print ${previewMode ? "hidden" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">حقول التعبئة</h3>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setTemplateFields(current => [
                            ...current,
                            newTemplateField(current.length),
                          ])
                        }
                      >
                        <FilePlus2 className="ml-2 h-4 w-4" />
                        إضافة حقل
                      </Button>
                    </div>
                    {templateFields.length === 0 ? (
                      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                        لا توجد حقول متغيرة. يمكنك إضافة حقول مثل اسم الموظف أو
                        التاريخ أو الجهة.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {templateFields.map((field, index) => (
                          <div
                            key={`template-field-${index}`}
                            className="grid grid-cols-1 gap-3 rounded-[10px] border p-3 md:grid-cols-[1fr_1fr_150px_auto]"
                          >
                            <Input
                              value={field.label}
                              onChange={event =>
                                updateTemplateField(index, {
                                  label: event.target.value,
                                })
                              }
                              placeholder="اسم الحقل"
                            />
                            <div className="space-y-1">
                              <Input
                                value={field.key}
                                onChange={event =>
                                  updateTemplateField(index, {
                                    key: event.target.value
                                      .toLowerCase()
                                      .replace(/[^a-z0-9_]/g, "_"),
                                  })
                                }
                                aria-label={`المفتاح البرمجي للحقل ${index + 1}`}
                                aria-describedby={`template-field-key-hint-${index}`}
                                placeholder="employee_name"
                                dir="auto"
                              />
                              <p
                                id={`template-field-key-hint-${index}`}
                                className="text-xs text-muted-foreground"
                              >
                                المفتاح إنجليزي وتتحول المسافات فيه إلى _؛ أما
                                التسمية والقيم والخيارات فتقبل المسافات.
                              </p>
                            </div>
                            <select
                              value={field.type}
                              onChange={event => {
                                const type = event.target
                                  .value as DocumentTemplateFieldType;
                                updateTemplateField(index, {
                                  type,
                                  options:
                                    type === "select"
                                      ? field.options?.length
                                        ? field.options
                                        : [
                                            { value: "yes", label: "نعم" },
                                            { value: "no", label: "لا" },
                                          ]
                                      : undefined,
                                });
                              }}
                              className="h-10 rounded-md border bg-background px-2 text-sm"
                            >
                              <option value="text">نص</option>
                              <option value="multiline">نص متعدد الأسطر</option>
                              <option value="date">تاريخ</option>
                              <option value="number">رقم</option>
                              <option value="select">قائمة اختيار</option>
                            </select>
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1 text-xs">
                                <input
                                  type="checkbox"
                                  checked={field.required}
                                  onChange={event =>
                                    updateTemplateField(index, {
                                      required: event.target.checked,
                                    })
                                  }
                                />
                                مطلوب
                              </label>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label="حذف الحقل"
                                onClick={() =>
                                  setTemplateFields(current =>
                                    current.filter(
                                      (_, fieldIndex) => fieldIndex !== index
                                    )
                                  )
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            {field.type === "select" ? (
                              <Input
                                className="md:col-span-2"
                                aria-label={`خيارات الحقل ${index + 1}`}
                                value={(field.options ?? [])
                                  .map(option => option.label)
                                  .join(", ")}
                                onChange={event =>
                                  updateTemplateFieldOptions(
                                    index,
                                    event.target.value
                                  )
                                }
                                placeholder="الخيارات مفصولة بفواصل"
                              />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <ResponsiveA4Preview settings={platformDocumentSettings.data}>
                    <DocumentWatermark
                      logoUrl={logoUrl}
                      watermarkText={
                        platformDocumentSettings.data?.watermarkText ??
                        "وزارة الداخلية"
                      }
                      opacityPercent={
                        platformDocumentSettings.data
                          ?.watermarkOpacityPercent ?? 12
                      }
                      scalePercent={
                        platformDocumentSettings.data?.watermarkScalePercent ??
                        100
                      }
                      showMinistryText={
                        platformDocumentSettings.data
                          ?.showMinistryWatermarkText ?? true
                      }
                    />
                    <DocumentLetterhead
                      logoUrl={logoUrl}
                      dividerColor={dividerColor}
                      headerSettings={platformDocumentSettings.data}
                    />
                    <div className="py-6">
                      <DocumentEditor
                        content={templateContent}
                        onChange={handleTemplateContentChange}
                        editable={!previewMode}
                        containerClassName="rounded-none border-0 shadow-none"
                        textStyle={documentFontStyle}
                        placeholder="اكتب نص النموذج واستخدم {{employee_name}} للحقول المخصصة أو {{organization}} و{{date}} و{{number}} و{{subject}} للبيانات التلقائية."
                      />
                    </div>
                    <DocumentSignatureBlock
                      organizationName={organizationName}
                      unitName={settings?.unitName ?? ""}
                      chiefRank={settings?.unitChiefRank ?? ""}
                      chiefName={settings?.unitChiefName ?? ""}
                      settings={platformDocumentSettings.data}
                    />
                  </ResponsiveA4Preview>
                </Card>
              ) : selectedDocument || isCreatingDocument ? (
                <Card className="space-y-4 p-3 pb-24 sm:p-4 sm:pb-4">
                  {previewMode && selectedDocument ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="document-studio-no-print h-11 md:hidden"
                      onClick={() => setPreviewMode(false)}
                    >
                      <FolderOpen className="ml-2 h-4 w-4" />
                      العودة إلى قائمة الوثائق
                    </Button>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2 document-studio-no-print">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {activeTab === "archive"
                          ? "معاينة الوثيقة المؤرشفة"
                          : selectedDocument
                            ? "تحرير الوثيقة"
                            : "إعداد وثيقة جديدة"}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        تحفظ الوثائق كمسودات، ويظهر الإصدار عند إعداد ترويسة
                        الجهة
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedDocument?.status === "draft" &&
                      activeTab === "documents" &&
                      canIssueDocuments ? (
                        <Button
                          variant="secondary"
                          disabled={
                            issueDocumentMutation.isPending || isSavingDocument
                          }
                          onClick={() => {
                            if (hasUnsavedDocumentChanges) {
                              toast.error(
                                "احفظ التعديلات أولاً قبل إصدار الوثيقة"
                              );
                              return;
                            }
                            if (
                              window.confirm(
                                "سيتم تخصيص رقم صادر نهائي للوثيقة. هل تريد المتابعة؟"
                              )
                            ) {
                              issueDocumentMutation.mutate({
                                id: selectedDocument.id,
                                expectedUpdatedAt: selectedDocument.updatedAt,
                              });
                            }
                          }}
                        >
                          إصدار الوثيقة
                        </Button>
                      ) : null}
                      {selectedDocument?.status === "issued" &&
                      activeTab === "documents" ? (
                        <Button
                          variant="outline"
                          disabled={archiveDocumentMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm("هل تريد نقل الوثيقة إلى الأرشيف؟")
                            ) {
                              archiveDocumentMutation.mutate({
                                id: selectedDocument.id,
                                expectedUpdatedAt: selectedDocument.updatedAt,
                              });
                            }
                          }}
                        >
                          <Archive className="ml-2 h-4 w-4" />
                          أرشفة
                        </Button>
                      ) : null}
                      {selectedDocument ? (
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={deleteDocumentMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                "حذف الوثيقة نهائيًا؟ ستُفقد التعديلات غير المحفوظة."
                              )
                            ) {
                              deleteDocumentMutation.mutate({
                                id: selectedDocument.id,
                              });
                            }
                          }}
                        >
                          <Trash2 className="ml-2 h-4 w-4" />
                          {deleteDocumentMutation.isPending
                            ? "جارٍ الحذف…"
                            : "حذف الوثيقة"}
                        </Button>
                      ) : null}
                      <Button
                        onClick={saveDocument}
                        disabled={isSavingDocument || !canEditDocument}
                      >
                        <Save className="ml-2 h-4 w-4" />
                        حفظ الوثيقة
                      </Button>
                    </div>
                  </div>

                  {selectedDocument ? (
                    <section className="document-studio-no-print space-y-3 rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-semibold">سجل إصدارات الوثيقة</h3>
                          <p className="text-xs text-muted-foreground">
                            تُحفظ نسخة سابقة عند كل تعديل فعلي، ويمكن استعادتها
                            للمسودات.
                          </p>
                        </div>
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                          {(documentVersionsQuery.data ?? []).length} نسخة سابقة
                        </span>
                      </div>
                      {documentVersionsQuery.isLoading ? (
                        <p className="text-sm text-muted-foreground">
                          جارٍ تحميل سجل الإصدارات...
                        </p>
                      ) : documentVersionsQuery.isError ? (
                        <p className="text-sm text-destructive">
                          تعذر تحميل سجل الإصدارات:{" "}
                          {documentVersionsQuery.error.message}
                        </p>
                      ) : (documentVersionsQuery.data ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          لا توجد نسخ سابقة بعد. سيظهر السجل بعد أول تعديل
                          محفوظ.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {(documentVersionsQuery.data ?? []).map(version => (
                            <div
                              key={version.version}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 p-2"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium">
                                  النسخة {version.version} · {version.title}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(version.savedAt).toLocaleString(
                                    "ar"
                                  )}
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={
                                  selectedDocument.status !== "draft" ||
                                  restoreDocumentVersionMutation.isPending ||
                                  hasUnsavedDocumentChanges
                                }
                                onClick={() => {
                                  if (hasUnsavedDocumentChanges) {
                                    toast.error(
                                      "احفظ التعديلات الحالية أو ألغها قبل استعادة نسخة سابقة"
                                    );
                                    return;
                                  }
                                  if (
                                    !window.confirm(
                                      `استعادة النسخة ${version.version}؟ سيُحفظ المحتوى الحالي كنسخة قبل الاستعادة.`
                                    )
                                  ) {
                                    return;
                                  }
                                  restoreDocumentVersionMutation.mutate({
                                    id: selectedDocument.id,
                                    version: version.version,
                                    expectedUpdatedAt:
                                      selectedDocument.updatedAt,
                                  });
                                }}
                              >
                                استعادة هذه النسخة
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  ) : null}

                  <div
                    className={`grid grid-cols-1 gap-3 md:grid-cols-2 document-studio-no-print ${previewMode ? "hidden" : ""}`}
                  >
                    <div className="space-y-1">
                      <label className="text-sm font-medium">اسم الوثيقة</label>
                      <Input
                        value={documentTitle}
                        onChange={event => setDocumentTitle(event.target.value)}
                        placeholder="أدخل اسم الوثيقة"
                        disabled={!canEditDocument}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">التصنيف</label>
                      <select
                        value={documentCategory}
                        onChange={event =>
                          setDocumentCategory(event.target.value)
                        }
                        disabled={!canEditDocument}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60"
                      >
                        {CATEGORIES.map(category => (
                          <option key={category.value} value={category.value}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="document-number"
                        className="text-sm font-medium"
                      >
                        الرقم
                      </label>
                      <Input
                        id="document-number"
                        value={documentSubject}
                        onChange={event =>
                          setDocumentSubject(event.target.value)
                        }
                        placeholder="أدخل الرقم"
                        disabled={!canEditDocument}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">التاريخ</label>
                      <div className="relative">
                        <Input
                          type="text"
                          inputMode="text"
                          value={documentDate}
                          onChange={event =>
                            setDocumentDate(event.target.value)
                          }
                          placeholder="مثال: 2026/11/24 (اختياري)"
                          disabled={!canEditDocument}
                          className="pe-12"
                          aria-label="التاريخ الاختياري"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="اختيار التاريخ من التقويم"
                          disabled={!canEditDocument}
                          className="absolute end-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            const picker = datePickerRef.current;
                            if (!picker) return;
                            if (typeof picker.showPicker === "function")
                              picker.showPicker();
                            else picker.click();
                          }}
                        >
                          <CalendarDays className="size-4" />
                        </Button>
                        <input
                          ref={datePickerRef}
                          type="date"
                          tabIndex={-1}
                          aria-hidden="true"
                          value={
                            parseDocumentDate(documentDate)?.slice(0, 10) ?? ""
                          }
                          onChange={event =>
                            setDocumentDate(event.target.value)
                          }
                          className="pointer-events-none absolute size-px opacity-0"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        اتركه فارغًا إذا لم ترد إظهار التاريخ في الوثيقة.
                      </p>
                    </div>
                  </div>

                  <div
                    className={`grid grid-cols-1 gap-3 md:grid-cols-2 document-studio-no-print ${previewMode ? "hidden" : ""}`}
                  >
                    <div className="space-y-1 md:col-span-2">
                      <label
                        htmlFor="document-recipient-line"
                        className="text-sm font-medium"
                      >
                        الجهة المستلمة / التوجيه
                      </label>
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.65fr)]">
                        <Input
                          id="document-recipient-line"
                          value={documentRecipientLine}
                          onChange={event =>
                            setDocumentFieldValues(current => ({
                              ...current,
                              [DOCUMENT_RECIPIENT_LINE_KEY]: event.target.value,
                            }))
                          }
                          placeholder={DEFAULT_DOCUMENT_RECIPIENT_PLACEHOLDER}
                          disabled={!canEditDocument}
                        />
                        <select
                          aria-label="اختيار جهة مستلمة من جهات الاتصال"
                          className="h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                          value=""
                          disabled={
                            !canEditDocument ||
                            contactsQuery.isLoading ||
                            !(contactsQuery.data?.length ?? 0)
                          }
                          onChange={event => {
                            const contact = contactsQuery.data?.find(
                              item => item.id === event.target.value
                            );
                            if (!contact) return;
                            const prefix =
                              /^(إلى|الى)\s*/.exec(
                                documentRecipientLine
                              )?.[0] ??
                              (documentRecipientLine.trim() ? "" : "إلى ");
                            const recipient =
                              contact.organization?.trim() || contact.name;
                            setDocumentFieldValues(current => ({
                              ...current,
                              [DOCUMENT_RECIPIENT_LINE_KEY]: `${prefix}${recipient}`,
                            }));
                          }}
                        >
                          <option value="">
                            {contactsQuery.isLoading
                              ? "جارٍ تحميل جهات الاتصال..."
                              : contactsQuery.data?.length
                                ? "اختر جهة من جهات الاتصال"
                                : "أضف جهات اتصال لاختيارها هنا"}
                          </option>
                          {(contactsQuery.data ?? []).map(contact => (
                            <option key={contact.id} value={contact.id}>
                              {contact.name}
                              {contact.organization
                                ? ` — ${contact.organization}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        اختر جهة محفوظة لإدراج اسمها فوراً، أو اكتب صياغة مخصصة؛
                        «إلى» ليست إلزامية.
                      </p>
                    </div>
                  </div>

                  {documentTemplateFields.length > 0 && !previewMode ? (
                    <section className="space-y-3 rounded-lg border bg-muted/20 p-3 document-studio-no-print">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold">بيانات النموذج</h3>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canEditDocument}
                          onClick={() => {
                            setDocumentContent(current =>
                              applyDocumentTemplateVariables(
                                applyFieldValues(current, documentFieldValues),
                                getDocumentSystemVariables()
                              )
                            );
                            setTemplateValuesApplied(true);
                          }}
                        >
                          تطبيق البيانات في النص
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        تُستبدل المفاتيح الموجودة في عقد النص المدعومة فقط.
                        لتغيير قيمة بعد استبدالها، أعد إدراج مفتاحها في النص ثم
                        اضغط تطبيق البيانات؛ لا يعاد تطبيقها تلقائياً على وثيقة
                        محفوظة.
                      </p>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {documentTemplateFields.map(field => (
                          <div key={field.key} className="space-y-1">
                            <label className="text-[13px] font-extrabold">
                              {field.label}
                              {field.required ? " *" : ""}
                            </label>
                            {field.type === "multiline" ? (
                              <Textarea
                                rows={3}
                                value={documentFieldValues[field.key] ?? ""}
                                onChange={event => {
                                  setDocumentFieldValues(current => ({
                                    ...current,
                                    [field.key]: event.target.value,
                                  }));
                                  setTemplateValuesApplied(false);
                                }}
                                disabled={!canEditDocument}
                              />
                            ) : field.type === "select" ? (
                              <select
                                value={
                                  normalizeTemplateFieldValues(
                                    [field],
                                    documentFieldValues
                                  )[field.key] ?? ""
                                }
                                onChange={event => {
                                  setDocumentFieldValues(current => ({
                                    ...current,
                                    [field.key]: event.target.value,
                                  }));
                                  setTemplateValuesApplied(false);
                                }}
                                disabled={!canEditDocument}
                                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                              >
                                <option value="">اختر...</option>
                                {(field.options ?? []).map(option => (
                                  <option
                                    key={option.value}
                                    value={option.label}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <Input
                                type="text"
                                inputMode="text"
                                value={documentFieldValues[field.key] ?? ""}
                                onChange={event => {
                                  setDocumentFieldValues(current => ({
                                    ...current,
                                    [field.key]: event.target.value,
                                  }));
                                  setTemplateValuesApplied(false);
                                }}
                                disabled={!canEditDocument}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {selectedDocument?.file ? (
                    <section className="space-y-3 rounded-lg border p-3">
                      <div>
                        <h3 className="font-semibold">الملف المستورد</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selectedDocument.file.fileName} · الأصل محفوظ دون
                          تغيير
                        </p>
                      </div>
                      {importedFileUrlQuery.isLoading ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          جارٍ تجهيز معاينة الملف...
                        </p>
                      ) : importedFileUrlQuery.data?.url ? (
                        <FilePreview
                          url={importedFileUrlQuery.data.url}
                          fileName={selectedDocument.file.fileName}
                          mimeType={selectedDocument.file.mimeType}
                          documentId={selectedDocument.id}
                        />
                      ) : (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          تعذر تجهيز معاينة الملف. أعد فتح الوثيقة.
                        </p>
                      )}
                    </section>
                  ) : (
                    <ResponsiveA4Preview
                      pageRef={documentPageRef}
                      settings={platformDocumentSettings.data}
                    >
                      <DocumentWatermark
                        logoUrl={logoUrl}
                        watermarkText={documentWatermarkText}
                        opacityPercent={
                          platformDocumentSettings.data
                            ?.watermarkOpacityPercent ?? 12
                        }
                        scalePercent={
                          platformDocumentSettings.data
                            ?.watermarkScalePercent ?? 100
                        }
                        showMinistryText={
                          platformDocumentSettings.data
                            ?.showMinistryWatermarkText ?? true
                        }
                      />
                      <DocumentLetterhead
                        logoUrl={logoUrl}
                        dividerColor={dividerColor}
                        headerSettings={platformDocumentSettings.data}
                        serial={
                          selectedDocument?.serialCode ||
                          makeDocumentNumber(documentSubject) ||
                          undefined
                        }
                        date={formatDocumentDate(
                          makeDocumentDate(documentDate),
                          platformDocumentSettings.data?.documentDateFormat
                        )}
                      />
                      <div className="pt-6">
                        {documentRecipientLine ? (
                          <p
                            className="mb-4 text-center"
                            style={recipientFontStyle}
                          >
                            {documentRecipientLine}
                          </p>
                        ) : null}
                        {selectedTemplateId &&
                        documentTemplateFields.length > 0 &&
                        !previewMode ? (
                          <div className="document-studio-no-print mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3">
                            <p className="text-xs text-muted-foreground">
                              تُنشأ الوثيقة من قيم الحقول تلقائياً. تحرير النص
                              يدوياً اختياري.
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (!manualTemplateEditing) {
                                  setDocumentContent(current =>
                                    applyDocumentTemplateVariables(
                                      applyFieldValues(
                                        current,
                                        documentFieldValues
                                      ),
                                      getDocumentSystemVariables()
                                    )
                                  );
                                  setTemplateValuesApplied(true);
                                  setManualTemplateEditing(true);
                                } else {
                                  setManualTemplateEditing(false);
                                }
                              }}
                            >
                              {manualTemplateEditing
                                ? "إيقاف التحرير اليدوي"
                                : "تحرير النص يدوياً (اختياري)"}
                            </Button>
                          </div>
                        ) : null}
                        <DocumentEditor
                          content={documentPreviewContent}
                          onChange={handleDocumentContentChange}
                          editable={
                            canEditDocument &&
                            !previewMode &&
                            (!selectedTemplateId || manualTemplateEditing)
                          }
                          containerClassName="rounded-none border-0 shadow-none"
                          textStyle={documentFontStyle}
                        />
                        <DocumentSignatureBlock
                          organizationName={organizationName}
                          unitName={settings?.unitName ?? ""}
                          chiefRank={settings?.unitChiefRank ?? ""}
                          chiefName={settings?.unitChiefName ?? ""}
                          settings={platformDocumentSettings.data}
                        />
                      </div>
                      <footer
                        className="space-y-1 pb-8 pt-4 text-xs text-slate-500"
                        data-document-print-section="footer"
                      >
                        {platformDocumentSettings.data?.pageFooterRows?.map(
                          (row, index) => (
                            <div
                              key={`custom-footer-${index}`}
                              className="grid grid-cols-2 gap-4 font-semibold"
                            >
                              <span className="text-right">{row.right}</span>
                              <span className="text-left" dir="ltr">
                                {row.left}
                              </span>
                            </div>
                          )
                        )}
                      </footer>
                    </ResponsiveA4Preview>
                  )}
                  {previewMode && selectedDocument ? (
                    <div className="document-preview-actions document-studio-no-print mt-4 grid grid-cols-3 gap-2 border-t pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-16 flex-col gap-1"
                        disabled={!selectedDocument}
                        onClick={() => void downloadSelectedDocument()}
                      >
                        <Download className="h-5 w-5" />
                        <span className="text-xs">تنزيل</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-16 flex-col gap-1"
                        disabled={!selectedDocument}
                        onClick={() => void shareSelectedDocument()}
                      >
                        <Share2 className="h-5 w-5" />
                        <span className="text-xs">مشاركة رابط</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-16 flex-col gap-1"
                        disabled={Boolean(
                          selectedDocument.file &&
                          !importedFileUrlQuery.data?.url
                        )}
                        onClick={() => {
                          if (selectedDocument.file) setImportPrintOpen(true);
                          else setNativePrintOpen(true);
                        }}
                      >
                        <Printer className="h-5 w-5" />
                        <span className="text-xs">طباعة</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-16 flex-col gap-1"
                        onClick={() => setPreviewMode(false)}
                      >
                        <PenLine className="h-5 w-5" />
                        <span className="text-xs">تعديل الوثيقة</span>
                      </Button>
                    </div>
                  ) : null}
                </Card>
              ) : (
                <WorkspaceWelcome
                  documents={
                    userDocuments.filter(item => item.status !== "archived")
                      .length
                  }
                  templates={templates.filter(item => item.isActive).length}
                  archived={
                    userDocuments.filter(item => item.status === "archived")
                      .length
                  }
                  onCreate={() => setCreationDialogOpen(true)}
                  onTemplates={() => selectWorkspaceTab("templates")}
                  onFiles={() => selectWorkspaceTab("files")}
                />
              )}
            </main>
          </div>
        </>
      )}

      <DocumentStudioPrintDialog
        open={nativePrintOpen}
        onOpenChange={setNativePrintOpen}
        title={(selectedDocument?.title ?? documentTitle) || "وثيقة جديدة"}
        pageElement={documentPageRef.current}
        onBeforePrint={async () => {
          if (selectedDocument) {
            await recordDocumentPrintMutation.mutateAsync({
              id: selectedDocument.id,
            });
          }
        }}
      />
      <Dialog open={creationDialogOpen} onOpenChange={setCreationDialogOpen}>
        <DialogContent
          className="w-[calc(100%-1rem)] max-h-[min(90dvh,42rem)] max-w-lg overflow-y-auto p-4 sm:p-6"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-right">إنشاء وثيقة</DialogTitle>
            <DialogDescription className="text-right">
              اختر نموذجاً جاهزاً لتعبئة حقوله، أو ابدأ وثيقة فارغة، أو ارفع
              ملفاً للطباعة.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-auto w-full justify-start gap-3 p-4 text-right"
              onClick={() => {
                setCreationDialogOpen(false);
                setActiveTab("templates");
                setIsCreatingDocument(false);
                setPreviewMode(false);
              }}
            >
              <LayoutTemplate className="size-5 shrink-0" />
              <span className="flex-1 text-right">
                <span className="block font-semibold">تعبئة نموذج جاهز</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  اختر نموذجاً نشطاً ثم أدخل بيانات حقوله المطلوبة
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto w-full justify-start gap-3 p-4 text-right"
              onClick={() => {
                setCreationDialogOpen(false);
                startNewDocument();
              }}
            >
              <PenLine className="size-5 shrink-0" />
              <span className="flex-1 text-right">
                <span className="block font-semibold">وثيقة فارغة</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  افتح صفحة A4 واكتب النص يدوياً من البداية
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto w-full justify-start gap-3 p-4 text-right"
              onClick={() => {
                setCreationDialogOpen(false);
                setImportDialogOpen(true);
              }}
            >
              <FileUp className="size-5 shrink-0" />
              <span className="flex-1 text-right">
                <span className="block font-semibold">
                  استيراد PDF أو Word أو صورة
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  أرفق ملفاً موجوداً وأنشئ له سجلاً في مكتبة الوثائق
                </span>
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <UploadDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onUploaded={documentId => {
          setSelectedDocumentId(documentId);
          setActiveTab("documents");
          void utils.documentStudio.listDocuments.invalidate();
          toast.success("تم استيراد الملف وإضافته إلى الوثائق");
        }}
      />
      {selectedDocument?.file && importedFileUrlQuery.data?.url ? (
        <PrintDialog
          open={importPrintOpen}
          onOpenChange={setImportPrintOpen}
          title={selectedDocument.title}
          url={importedFileUrlQuery.data.url}
          fileName={selectedDocument.file.fileName}
          mimeType={selectedDocument.file.mimeType}
          getPrintUrl={async () => {
            const { data } = await importedFileUrlQuery.refetch({
              throwOnError: true,
            });
            if (!data?.url) throw new Error("تعذر تجديد رابط الملف للطباعة");
            return data.url;
          }}
        />
      ) : null}
    </div>
  );
}
