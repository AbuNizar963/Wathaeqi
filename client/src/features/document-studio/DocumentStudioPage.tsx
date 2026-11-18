import {
  Archive,
  FilePlus2,
  FileText,
  FolderOpen,
  LayoutTemplate,
  Printer,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import type {
  DocumentTemplate,
  DocumentTemplateField,
  DocumentTemplateFieldType,
  OfficialDocument,
} from "../../../../shared/documentStudio";
import DocumentEditor from "./DocumentEditor";

type StudioTab = "documents" | "templates" | "archive";

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

function applyFieldValues(
  content: Record<string, unknown>,
  values: Record<string, string>
): Record<string, unknown> {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;

    const node = value as Record<string, unknown>;
    if (node.type === "text" && typeof node.text === "string") {
      const text = Object.entries(values).reduce(
        (result, [key, fieldValue]) =>
          result.split(`{{${key}}}`).join(fieldValue),
        node.text
      );
      return { ...node, text };
    }

    return Object.fromEntries(
      Object.entries(node).map(([key, child]) => [key, visit(child)])
    );
  };

  return visit(content) as Record<string, unknown>;
}

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
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function dateInputValue(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function makeDocumentDate(value: string): string {
  return new Date(`${value}T12:00:00.000Z`).toISOString();
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
  const [activeTab, setActiveTab] = useState<StudioTab>("documents");
  const [search, setSearch] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [selectedTemplateRevision, setSelectedTemplateRevision] = useState<
    number | null
  >(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentCategory, setDocumentCategory] = useState("general");
  const [documentSubject, setDocumentSubject] = useState("");
  const [documentDate, setDocumentDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [documentContent, setDocumentContent] = useState(
    EMPTY_DOCUMENT_CONTENT
  );
  const [templateBaseContent, setTemplateBaseContent] = useState(
    EMPTY_DOCUMENT_CONTENT
  );
  const [documentFieldValues, setDocumentFieldValues] = useState<
    Record<string, string>
  >({});

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

  const utils = trpc.useUtils();
  const documentsQuery = trpc.documentStudio.listDocuments.useQuery();
  const templatesQuery = trpc.documentStudio.listTemplates.useQuery();
  const organizationContext = trpc.organizations.context.useQuery();
  const platformDocumentSettings = trpc.platformDocumentSettings.get.useQuery();

  const documents = documentsQuery.data ?? [];
  const templates = templatesQuery.data ?? [];
  const selectedDocument = useMemo(
    () => documents.find(item => item.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId]
  );
  const selectedTemplate = useMemo(
    () => templates.find(item => item.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );
  const documentOrganizationId =
    selectedDocument?.organizationId ?? organizationContext.data?.organizationId;
  const letterheadSettings = trpc.documentStudio.getLetterheadSettings.useQuery(
    { organizationId: documentOrganizationId },
    { enabled: Boolean(documentOrganizationId) }
  );
  const documentTemplateFields = selectedDocument
    ? selectedDocument.templateFieldsSnapshot
    : selectedTemplate?.fields ?? [];
  const editingTemplate = useMemo(
    () => templates.find(item => item.id === editingTemplateId) ?? null,
    [editingTemplateId, templates]
  );

  const visibleDocuments = useMemo(() => {
    const source =
      activeTab === "archive"
        ? documents.filter(item => item.status === "archived")
        : documents.filter(item => item.status !== "archived");
    const normalizedSearch = search.trim().toLocaleLowerCase();
    if (!normalizedSearch) return source;
    return source.filter(item =>
      [item.title, item.subject, item.serialCode, item.category]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedSearch)
    );
  }, [activeTab, documents, search]);

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
    setTemplateBaseContent(selectedDocument.content);
    setDocumentFieldValues(selectedDocument.fieldValues);
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
        toast.success("تم تحديث الوثيقة");
      },
      onError: error => toast.error(error.message),
    }
  );

  const createTemplateMutation = trpc.documentStudio.createTemplate.useMutation(
    {
      onSuccess: async saved => {
        await utils.documentStudio.listTemplates.invalidate();
        setEditingTemplateId(saved.id);
        setEditingTemplateRevision(saved.revision);
        toast.success("تم حفظ النموذج");
      },
      onError: error => toast.error(error.message),
    }
  );

  const updateTemplateMutation = trpc.documentStudio.updateTemplate.useMutation(
    {
      onSuccess: async saved => {
        await utils.documentStudio.listTemplates.invalidate();
        setEditingTemplateId(saved.id);
        setEditingTemplateRevision(saved.revision);
        toast.success("تم تحديث النموذج");
      },
      onError: error => toast.error(error.message),
    }
  );

  const issueDocumentMutation = trpc.documentStudio.issueDocument.useMutation({
    onSuccess: async saved => {
      await utils.documentStudio.listDocuments.invalidate();
      setSelectedDocumentId(saved.id);
      toast.success(`تم إصدار الوثيقة بالرقم ${saved.serialCode}`);
    },
    onError: error => toast.error(error.message),
  });

  const archiveDocumentMutation = trpc.documentStudio.archiveDocument.useMutation({
    onSuccess: async saved => {
      await utils.documentStudio.listDocuments.invalidate();
      setSelectedDocumentId(saved.id);
      setActiveTab("archive");
      toast.success("تم نقل الوثيقة إلى الأرشيف");
    },
    onError: error => toast.error(error.message),
  });

  const deactivateTemplateMutation =
    trpc.documentStudio.deactivateTemplate.useMutation({
      onSuccess: async () => {
        await utils.documentStudio.listTemplates.invalidate();
        setEditingTemplateId(null);
        toast.success("تم إيقاف النموذج مع الاحتفاظ بسجلاته");
      },
      onError: error => toast.error(error.message),
    });

  function startNewDocument() {
    setSelectedDocumentId(null);
    setSelectedTemplateId(null);
    setSelectedTemplateRevision(null);
    setDocumentTitle("");
    setDocumentCategory("general");
    setDocumentSubject("");
    setDocumentDate(new Date().toISOString().slice(0, 10));
    setDocumentContent(EMPTY_DOCUMENT_CONTENT);
    setTemplateBaseContent(EMPTY_DOCUMENT_CONTENT);
    setDocumentFieldValues({});
    setActiveTab("documents");
  }

  function useTemplate(template: DocumentTemplate) {
    setSelectedDocumentId(null);
    setSelectedTemplateId(template.id);
    setSelectedTemplateRevision(template.revision);
    setDocumentTitle(template.title);
    setDocumentCategory(template.category);
    setDocumentSubject("");
    setDocumentDate(new Date().toISOString().slice(0, 10));
    setTemplateBaseContent(template.content);
    setDocumentContent(template.content);
    setDocumentFieldValues(defaultFieldValues(template.fields));
    setActiveTab("documents");
  }

  function saveDocument() {
    if (!documentTitle.trim()) {
      toast.error("أدخل عنوان الوثيقة أولاً");
      return;
    }

    const input = {
      title: documentTitle.trim(),
      category: documentCategory,
      subject: documentSubject.trim(),
      content: selectedTemplateId
        ? applyFieldValues(documentContent, documentFieldValues)
        : documentContent,
      fieldValues: documentFieldValues,
      documentDate: makeDocumentDate(documentDate),
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

  function startNewTemplate() {
    setEditingTemplateId(null);
    setEditingTemplateRevision(1);
    setTemplateTitle("");
    setTemplateCategory("general");
    setTemplateDescription("");
    setTemplateContent(EMPTY_DOCUMENT_CONTENT);
    setTemplateFields([]);
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
    "وثائقي";
  const logoUrl = settings?.logoUrl ?? null;
  const dividerColor =
    platformDocumentSettings.data?.headerDividerColor ?? "#334155";
  const isSavingDocument =
    createDocumentMutation.isPending || updateDocumentMutation.isPending;
  const isSavingTemplate =
    createTemplateMutation.isPending || updateTemplateMutation.isPending;
  const canEditDocument =
    activeTab !== "archive" &&
    (!selectedDocument || selectedDocument.status === "draft");
  const canIssueDocuments =
    organizationContext.data?.isOwner === true ||
    ["system_admin", "organization_admin"].includes(
      organizationContext.data?.role ?? ""
    );

  return (
    <div className="document-studio-shell space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 document-studio-no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">وثائقي</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إعداد الوثائق الرسمية وإدارة النماذج والأرشيف
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeTab === "documents" ? "default" : "outline"}
            onClick={() => setActiveTab("documents")}
          >
            <FileText className="ml-2 h-4 w-4" />
            الوثائق
          </Button>
          <Button
            variant={activeTab === "templates" ? "default" : "outline"}
            onClick={() => setActiveTab("templates")}
          >
            <LayoutTemplate className="ml-2 h-4 w-4" />
            القوالب
          </Button>
          <Button
            variant={activeTab === "archive" ? "default" : "outline"}
            onClick={() => setActiveTab("archive")}
          >
            <Archive className="ml-2 h-4 w-4" />
            الأرشيف
          </Button>
          {activeTab === "documents" || activeTab === "archive" ? (
            <>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="ml-2 h-4 w-4" />
                طباعة / PDF
              </Button>
              <Button onClick={startNewDocument}>
                <FilePlus2 className="ml-2 h-4 w-4" />
                وثيقة جديدة
              </Button>
            </>
          ) : (
            <Button onClick={startNewTemplate}>
              <FilePlus2 className="ml-2 h-4 w-4" />
              نموذج جديد
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="document-studio-no-print space-y-3">
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
                <div className="max-h-[70vh] space-y-2 overflow-y-auto">
                  {visibleDocuments.map(document => (
                    <button
                      key={document.id}
                      type="button"
                      onClick={() => setSelectedDocumentId(document.id)}
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
                    {editingTemplateId ? "تعديل النموذج" : "إنشاء نموذج رسمي"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    احفظ نصاً أساسياً وحقولاً تُملأ عند إنشاء الوثيقة
                  </p>
                </div>
                <div className="flex gap-2">
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

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 document-studio-no-print">
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
                    onChange={event => setTemplateCategory(event.target.value)}
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

              <section className="space-y-3 document-studio-no-print">
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
                        key={`${field.key}-${index}`}
                        className="grid grid-cols-1 gap-2 rounded-lg border p-3 md:grid-cols-[1fr_1fr_150px_auto]"
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
                        <Input
                          value={field.key}
                          onChange={event =>
                            updateTemplateField(index, {
                              key: event.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9_]/g, "_"),
                            })
                          }
                          placeholder="employee_name"
                          dir="ltr"
                        />
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

              <div className="document-a4-page mx-auto w-full max-w-[210mm] bg-white text-slate-900">
                <DocumentLetterhead
                  organizationName={organizationName}
                  unitName={settings?.unitName ?? ""}
                  chiefRank={settings?.unitChiefRank ?? ""}
                  chiefName={settings?.unitChiefName ?? ""}
                  logoUrl={logoUrl}
                  dividerColor={dividerColor}
                />
                <div className="px-[18mm] py-6">
                  <DocumentEditor
                    content={templateContent}
                    onChange={handleTemplateContentChange}
                    containerClassName="rounded-none border-0 shadow-none"
                    placeholder="اكتب النص الثابت للنموذج، واستخدم مفاتيح الحقول مثل {{employee_name}}"
                  />
                </div>
              </div>
            </Card>
          ) : (
            <Card className="space-y-4 p-3 sm:p-4">
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
                    تحفظ الوثائق كمسودات حتى إصدارها
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedDocument?.status === "draft" &&
                  activeTab === "documents" &&
                  canIssueDocuments ? (
                    <Button
                      variant="secondary"
                      disabled={issueDocumentMutation.isPending}
                      onClick={() => {
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
                  {selectedDocument?.status === "issued" && activeTab === "documents" ? (
                    <Button
                      variant="outline"
                      disabled={archiveDocumentMutation.isPending}
                      onClick={() => {
                        if (window.confirm("هل تريد نقل الوثيقة إلى الأرشيف؟")) {
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
                  <Button onClick={saveDocument} disabled={isSavingDocument || !canEditDocument}>
                    <Save className="ml-2 h-4 w-4" />
                    حفظ الوثيقة
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 document-studio-no-print">
                <div className="space-y-1">
                  <label className="text-sm font-medium">عنوان الوثيقة</label>
                  <Input
                    value={documentTitle}
                    onChange={event => setDocumentTitle(event.target.value)}
                    placeholder="عنوان الوثيقة"
                    disabled={!canEditDocument}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">التصنيف</label>
                  <select
                    value={documentCategory}
                    onChange={event => setDocumentCategory(event.target.value)}
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
                  <label className="text-sm font-medium">الموضوع</label>
                  <Input
                    value={documentSubject}
                    onChange={event => setDocumentSubject(event.target.value)}
                    placeholder="موضوع الوثيقة"
                    disabled={!canEditDocument}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">التاريخ</label>
                  <Input
                    type="date"
                    value={documentDate}
                    onChange={event => setDocumentDate(event.target.value)}
                    disabled={!canEditDocument}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium">النموذج الأساسي</label>
                  <select
                    value={selectedTemplateId ?? ""}
                    disabled={!canEditDocument}
                    onChange={event => {
                      const template = templates.find(
                        item => item.id === event.target.value
                      );
                      if (template) useTemplate(template);
                      else {
                        setSelectedTemplateId(null);
                        setSelectedTemplateRevision(null);
                      }
                    }}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60"
                  >
                    <option value="">بدون نموذج</option>
                    {templates
                      .filter(item => item.isActive)
                      .map(template => (
                        <option key={template.id} value={template.id}>
                          {template.title}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {documentTemplateFields.length > 0 ? (
                <section className="space-y-3 rounded-lg border bg-muted/20 p-3 document-studio-no-print">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">بيانات النموذج</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDocumentContent(
                          applyFieldValues(
                            templateBaseContent,
                            documentFieldValues
                          )
                        )
                      }
                    >
                      تطبيق البيانات في النص
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {documentTemplateFields.map(field => (
                      <div key={field.key} className="space-y-1">
                        <label className="text-sm font-medium">
                          {field.label}
                          {field.required ? " *" : ""}
                        </label>
                        {field.type === "multiline" ? (
                          <Textarea
                            rows={3}
                            value={documentFieldValues[field.key] ?? ""}
                            onChange={event =>
                              setDocumentFieldValues(current => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            disabled={!canEditDocument}
                          />
                        ) : field.type === "select" ? (
                          <select
                            value={documentFieldValues[field.key] ?? ""}
                            onChange={event =>
                              setDocumentFieldValues(current => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            disabled={!canEditDocument}
                            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          >
                            <option value="">اختر...</option>
                            {(field.options ?? []).map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            type={
                              field.type === "date"
                                ? "date"
                                : field.type === "number"
                                  ? "number"
                                  : "text"
                            }
                            value={documentFieldValues[field.key] ?? ""}
                            onChange={event =>
                              setDocumentFieldValues(current => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            disabled={!canEditDocument}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="document-a4-page mx-auto w-full max-w-[210mm] bg-white text-slate-900">
                <DocumentLetterhead
                  organizationName={organizationName}
                  unitName={settings?.unitName ?? ""}
                  chiefRank={settings?.unitChiefRank ?? ""}
                  chiefName={settings?.unitChiefName ?? ""}
                  logoUrl={logoUrl}
                  dividerColor={dividerColor}
                />
                <div className="flex items-center justify-between gap-4 px-[18mm] pt-5 text-sm">
                  <span>
                    الرقم: {selectedDocument?.serialCode || "يخصص عند الإصدار"}
                  </span>
                  <span>
                    التاريخ: {formatArabicDate(makeDocumentDate(documentDate))}
                  </span>
                </div>
                <div className="px-[18mm] pt-6">
                  {documentSubject ? (
                    <p className="mb-4 text-right font-semibold">
                      الموضوع: {documentSubject}
                    </p>
                  ) : null}
                  <DocumentEditor
                    content={documentContent}
                    onChange={handleDocumentContentChange}
                    editable={canEditDocument}
                    containerClassName="rounded-none border-0 shadow-none"
                  />
                </div>
                <footer className="px-[18mm] pb-8 pt-4 text-center text-xs text-slate-500">
                  وثائقي
                </footer>
              </div>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}

function DocumentLetterhead({
  organizationName,
  unitName,
  chiefRank,
  chiefName,
  logoUrl,
  dividerColor,
}: {
  organizationName: string;
  unitName: string;
  chiefRank: string;
  chiefName: string;
  logoUrl: string | null;
  dividerColor: string;
}) {
  return (
    <header
      className="flex items-center justify-between gap-4 border-b-2 px-[18mm] pb-4 pt-8"
      style={{ borderColor: dividerColor }}
      dir="rtl"
    >
      <div className="flex min-w-0 items-center gap-3">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="شعار الجهة"
            className="h-16 w-16 shrink-0 object-contain"
          />
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-base font-bold">{organizationName}</p>
          {unitName ? (
            <p className="mt-1 text-sm text-slate-700">{unitName}</p>
          ) : null}
        </div>
      </div>
      {chiefRank || chiefName ? (
        <div className="shrink-0 text-center text-sm">
          {chiefRank ? <p>{chiefRank}</p> : null}
          {chiefName ? <p className="mt-1 font-semibold">{chiefName}</p> : null}
        </div>
      ) : null}
    </header>
  );
}
