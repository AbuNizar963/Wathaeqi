import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { ownerTrpc } from "@/lib/ownerTrpc";
import { applyDocumentTemplateVariables } from "@shared/documentTemplateVariables";
import type { PlatformDocumentSettings } from "@shared/features/platform-settings/platformDocumentSettings";
import DocumentEditor from "@/features/document-studio/DocumentEditor";
import DocumentLetterhead from "@/features/document-studio/DocumentLetterhead";
import DocumentSignatureBlock from "@/features/document-studio/DocumentSignatureBlock";
import DocumentWatermark from "@/features/document-studio/DocumentWatermark";
import ResponsiveA4Preview from "@/features/document-studio/ResponsiveA4Preview";

type PreviewSettings = Omit<PlatformDocumentSettings, "updatedAt">;

type PlatformDocumentPreviewProps = {
  settings: PreviewSettings;
  logoUrl: string;
  organizationId?: string;
  organizationName?: string;
  updatedAt?: string;
};

export default function PlatformDocumentPreview({
  settings,
  logoUrl,
  organizationId,
  organizationName,
  updatedAt,
}: PlatformDocumentPreviewProps) {
  const documentsQuery = ownerTrpc.documentStudio.listDocuments.useQuery();
  const letterheadSettings =
    ownerTrpc.documentStudio.getLetterheadSettings.useQuery(
      { organizationId },
      { enabled: Boolean(organizationId) }
    );
  const [selectedDocumentId, setSelectedDocumentId] = useState("");

  const previewDocuments = useMemo(
    () => (documentsQuery.data ?? []).filter(document => !document.file),
    [documentsQuery.data]
  );
  const previewDocument = useMemo(
    () =>
      previewDocuments.find(document => document.id === selectedDocumentId) ??
      previewDocuments[0] ??
      null,
    [previewDocuments, selectedDocumentId]
  );

  useEffect(() => {
    if (!selectedDocumentId && previewDocuments[0]) {
      setSelectedDocumentId(previewDocuments[0].id);
    }
  }, [previewDocuments, selectedDocumentId]);

  const previewDocumentContent = useMemo(
    () =>
      previewDocument && previewDocument.status !== "draft"
        ? applyDocumentTemplateVariables(previewDocument.content, {
            number: previewDocument.serialCode,
          })
        : previewDocument?.content ?? {
            type: "doc",
            content: [{ type: "paragraph" }],
          },
    [previewDocument]
  );

  const previewDate = previewDocument
    ? formatArabicDate(previewDocument.documentDate)
    : undefined;
  const previewLogoUrl =
    letterheadSettings.data?.logoUrl ?? (logoUrl || null);
  const previewOrganizationName =
    letterheadSettings.data?.departmentName ??
    organizationName ??
    "وثائقي";

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

  return (
    <Card className="space-y-3 p-5">
      <div>
        <h2 className="font-semibold">معاينة الوثيقة الفعلية</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          تعرض هذه المعاينة آخر وثيقة محفوظة بالمحتوى والترويسة والتذييل
          نفسيهما المستخدمين في الطباعة. تغييرات الإعدادات تظهر مباشرة هنا.
        </p>
      </div>

      {documentsQuery.isLoading ? (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">
          جارٍ تحميل الوثائق لعرض معاينة حقيقية...
        </p>
      ) : documentsQuery.isError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
        >
          تعذر تحميل وثيقة للمعاينة: {documentsQuery.error.message}
        </p>
      ) : previewDocuments.length > 0 ? (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">الوثيقة المعروضة</span>
          <select
            value={previewDocument?.id ?? ""}
            onChange={event => setSelectedDocumentId(event.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2"
          >
            {previewDocuments.map(document => (
              <option key={document.id} value={document.id}>
                {document.title}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">
          لا توجد وثيقة محفوظة قابلة للمعاينة بعد. أنشئ وثيقة من قسم الوثائق
          لتظهر هنا بنفس شكل الطباعة الفعلي.
        </p>
      )}

      <ResponsiveA4Preview settings={settings}>
        <DocumentWatermark
          logoUrl={previewLogoUrl}
          watermarkText={settings.watermarkText}
          opacityPercent={settings.watermarkOpacityPercent}
          scalePercent={settings.watermarkScalePercent}
          showMinistryText={settings.showMinistryWatermarkText}
        />
        <DocumentLetterhead
          logoUrl={previewLogoUrl}
          dividerColor={settings.headerDividerColor}
          headerSettings={settings}
          serial={
            previewDocument?.serialCode ||
            (previewDocument ? "يخصص عند الإصدار" : undefined)
          }
          date={previewDate}
        />
        <div className="pt-6">
          {previewDocument?.subject ? (
            <p className="mb-4 text-right font-semibold">
              الموضوع: {previewDocument.subject}
            </p>
          ) : null}
          {previewDocument ? (
            <DocumentEditor
              content={previewDocumentContent}
              onChange={() => undefined}
              editable={false}
              containerClassName="rounded-none border-0 shadow-none"
            />
          ) : null}
          <DocumentSignatureBlock
            organizationName={previewOrganizationName}
            unitName={letterheadSettings.data?.unitName ?? ""}
            chiefRank={letterheadSettings.data?.unitChiefRank ?? ""}
            chiefName={letterheadSettings.data?.unitChiefName ?? ""}
            settings={settings}
          />
        </div>
        <footer className="space-y-1 pb-8 pt-4 text-xs text-slate-500">
          {settings.pageFooterRows.map((row, index) => (
            <div
              key={"preview-footer-" + index}
              className="grid grid-cols-2 gap-4 font-semibold"
            >
              <span className="text-right">{row.right}</span>
              <span className="text-left" dir="ltr">
                {row.left}
              </span>
            </div>
          ))}
          {!settings.pageFooterRows.length ? (
            <div className="text-center">وثائقي</div>
          ) : null}
        </footer>
      </ResponsiveA4Preview>

      {updatedAt ? (
        <p className="text-xs text-muted-foreground">
          آخر تحديث محفوظ: {new Date(updatedAt).toLocaleString("ar")}
        </p>
      ) : null}
    </Card>
  );
}
