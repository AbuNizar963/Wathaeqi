import { ID, Query } from "node-appwrite";
import type {
  DocumentTemplate,
  DocumentTemplateField,
  OfficialDocument,
} from "../../../shared/documentStudio";
import {
  decodeOfficialDocumentStorageContent,
  decodeTemplateStorageContent,
  encodeOfficialDocumentStorageContent,
  encodeTemplateStorageContent,
} from "../../../shared/documentStudio";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";

const TEMPLATES_TABLE_ID = "templates";
const DOCUMENTS_TABLE_ID = "documents";
const MAX_ROWS = 100;

type AppwriteRow = Record<string, unknown> & {
  $id: string;
  $createdAt?: string;
  $updatedAt?: string;
  data?: Record<string, unknown>;
};

export class DocumentStudioConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentStudioConflictError";
  }
}

export type TemplateWriteInput = {
  title: string;
  category: string;
  description: string | null;
  content: Record<string, unknown>;
  fields: DocumentTemplateField[];
};

export type DocumentWriteInput = {
  title: string;
  category: string;
  subject: string;
  content: Record<string, unknown>;
  fieldValues: Record<string, string>;
  documentDate: string;
  templateId: string | null;
  templateRevision: number | null;
};

function rowData(row: AppwriteRow): Record<string, unknown> {
  return row.data ?? row;
}

function isoDate(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function rowCreatedAt(row: AppwriteRow): string {
  return isoDate(row.$createdAt, new Date(0).toISOString());
}

function rowUpdatedAt(row: AppwriteRow, data: Record<string, unknown>): string {
  return isoDate(data.updatedAt ?? row.$updatedAt, rowCreatedAt(row));
}

function mapTemplateRow(row: AppwriteRow): DocumentTemplate {
  const data = rowData(row);
  const decoded = decodeTemplateStorageContent(data.content);
  return {
    id: row.$id,
    ownerId: String(data.ownerId ?? ""),
    title: String(data.title ?? ""),
    description: decoded.description,
    category: String(data.category ?? "general"),
    content: decoded.content,
    fields: decoded.fields,
    revision: decoded.revision,
    isActive: decoded.isActive,
    createdAt: rowCreatedAt(row),
    updatedAt: isoDate(row.$updatedAt, rowCreatedAt(row)),
  };
}

function mapDocumentRow(row: AppwriteRow): OfficialDocument {
  const data = rowData(row);
  const createdAt = rowCreatedAt(row);
  const decoded = decodeOfficialDocumentStorageContent(
    data.content,
    createdAt
  );
  return {
    id: row.$id,
    ownerId: String(data.ownerId ?? ""),
    title: String(data.title ?? ""),
    category: String(data.category ?? "general"),
    subject: decoded.subject,
    content: decoded.content,
    fieldValues: decoded.fieldValues,
    serialNumber: decoded.serialNumber,
    serialCode: decoded.serialCode,
    documentDate: decoded.documentDate,
    status: decoded.status,
    templateId: decoded.templateId,
    templateRevision: decoded.templateRevision,
    createdAt,
    updatedAt: rowUpdatedAt(row, data),
    issuedAt: decoded.issuedAt,
    archivedAt: decoded.archivedAt,
  };
}

async function getRowOrNull(
  tableId: string,
  rowId: string
): Promise<AppwriteRow | null> {
  try {
    return (await getAppwriteTablesDB().getRow({
      databaseId: getAppwriteDatabaseId(),
      tableId,
      rowId,
    })) as AppwriteRow;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? Number((error as { code?: unknown }).code)
        : 0;
    if (code === 404) return null;
    throw error;
  }
}

export async function listDocumentTemplates(
  ownerId: string
): Promise<DocumentTemplate[]> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: TEMPLATES_TABLE_ID,
    queries: [
      Query.equal("ownerId", ownerId),
      Query.orderDesc("$createdAt"),
      Query.limit(MAX_ROWS),
    ],
    total: false,
  });
  return (result.rows as AppwriteRow[]).map(mapTemplateRow);
}

export async function getDocumentTemplate(
  ownerId: string,
  templateId: string
): Promise<DocumentTemplate | null> {
  const row = await getRowOrNull(TEMPLATES_TABLE_ID, templateId);
  if (!row || rowData(row).ownerId !== ownerId) return null;
  return mapTemplateRow(row);
}

export async function createDocumentTemplate(
  ownerId: string,
  input: TemplateWriteInput
): Promise<DocumentTemplate> {
  const now = new Date().toISOString();
  const row = await getAppwriteTablesDB().createRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: TEMPLATES_TABLE_ID,
    rowId: ID.unique(),
    data: {
      ownerId,
      title: input.title,
      category: input.category,
      content: encodeTemplateStorageContent({
        content: input.content,
        description: input.description,
        fields: input.fields,
        revision: 1,
        isActive: true,
      }),
    },
  });
  return mapTemplateRow(row as AppwriteRow);
}

export async function updateDocumentTemplate(
  ownerId: string,
  templateId: string,
  expectedRevision: number,
  input: TemplateWriteInput
): Promise<DocumentTemplate | null> {
  const existing = await getDocumentTemplate(ownerId, templateId);
  if (!existing) return null;
  if (existing.revision !== expectedRevision) {
    throw new DocumentStudioConflictError(
      "تم تعديل هذا النموذج في مكان آخر. حدّث الصفحة ثم أعد المحاولة."
    );
  }

  const row = await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: TEMPLATES_TABLE_ID,
    rowId: templateId,
    data: {
      title: input.title,
      category: input.category,
      content: encodeTemplateStorageContent({
        content: input.content,
        description: input.description,
        fields: input.fields,
        revision: existing.revision + 1,
        isActive: existing.isActive,
      }),
    },
  });
  return mapTemplateRow(row as AppwriteRow);
}

export async function deactivateDocumentTemplate(
  ownerId: string,
  templateId: string,
  expectedRevision: number
): Promise<DocumentTemplate | null> {
  const existing = await getDocumentTemplate(ownerId, templateId);
  if (!existing) return null;
  if (existing.revision !== expectedRevision) {
    throw new DocumentStudioConflictError(
      "تم تعديل هذا النموذج في مكان آخر. حدّث الصفحة ثم أعد المحاولة."
    );
  }
  if (!existing.isActive) return existing;

  const row = await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: TEMPLATES_TABLE_ID,
    rowId: templateId,
    data: {
      content: encodeTemplateStorageContent({
        content: existing.content,
        description: existing.description,
        fields: existing.fields,
        revision: existing.revision + 1,
        isActive: false,
      }),
    },
  });
  return mapTemplateRow(row as AppwriteRow);
}

export async function listOfficialDocuments(
  ownerId: string
): Promise<OfficialDocument[]> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: DOCUMENTS_TABLE_ID,
    queries: [
      Query.equal("ownerId", ownerId),
      Query.orderDesc("updatedAt"),
      Query.limit(MAX_ROWS),
    ],
    total: false,
  });
  return (result.rows as AppwriteRow[]).map(mapDocumentRow);
}

export async function getOfficialDocument(
  ownerId: string,
  documentId: string
): Promise<OfficialDocument | null> {
  const row = await getRowOrNull(DOCUMENTS_TABLE_ID, documentId);
  if (!row || rowData(row).ownerId !== ownerId) return null;
  return mapDocumentRow(row);
}

export async function createOfficialDocument(
  ownerId: string,
  input: DocumentWriteInput
): Promise<OfficialDocument> {
  const now = new Date().toISOString();
  const row = await getAppwriteTablesDB().createRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: DOCUMENTS_TABLE_ID,
    rowId: ID.unique(),
    data: {
      ownerId,
      title: input.title,
      category: input.category,
      updatedAt: now,
      content: encodeOfficialDocumentStorageContent({
        content: input.content,
        subject: input.subject,
        fieldValues: input.fieldValues,
        serialNumber: 0,
        serialCode: "",
        documentDate: input.documentDate,
        status: "draft",
        templateId: input.templateId,
        templateRevision: input.templateRevision,
        issuedAt: null,
        archivedAt: null,
      }),
    },
  });
  return mapDocumentRow(row as AppwriteRow);
}

export async function updateOfficialDocument(
  ownerId: string,
  documentId: string,
  expectedUpdatedAt: string,
  input: DocumentWriteInput
): Promise<OfficialDocument | null> {
  const existing = await getOfficialDocument(ownerId, documentId);
  if (!existing) return null;
  if (existing.updatedAt !== expectedUpdatedAt) {
    throw new DocumentStudioConflictError(
      "تم تعديل الوثيقة في مكان آخر. حدّث الصفحة ثم أعد المحاولة."
    );
  }
  if (existing.status !== "draft") {
    throw new DocumentStudioConflictError(
      "لا يمكن تعديل وثيقة صادرة أو مؤرشفة."
    );
  }

  const now = new Date().toISOString();
  const row = await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: DOCUMENTS_TABLE_ID,
    rowId: documentId,
    data: {
      title: input.title,
      category: input.category,
      updatedAt: now,
      content: encodeOfficialDocumentStorageContent({
        content: input.content,
        subject: input.subject,
        fieldValues: input.fieldValues,
        serialNumber: existing.serialNumber,
        serialCode: existing.serialCode,
        documentDate: input.documentDate,
        status: existing.status,
        templateId: input.templateId,
        templateRevision: input.templateRevision,
        issuedAt: existing.issuedAt,
        archivedAt: existing.archivedAt,
      }),
    },
  });
  return mapDocumentRow(row as AppwriteRow);
}

export async function archiveOfficialDocument(
  ownerId: string,
  documentId: string,
  expectedUpdatedAt: string
): Promise<OfficialDocument | null> {
  const existing = await getOfficialDocument(ownerId, documentId);
  if (!existing) return null;
  if (existing.updatedAt !== expectedUpdatedAt) {
    throw new DocumentStudioConflictError(
      "تم تعديل الوثيقة في مكان آخر. حدّث الصفحة ثم أعد المحاولة."
    );
  }
  if (existing.status === "archived") return existing;
  if (existing.status !== "issued") {
    throw new DocumentStudioConflictError(
      "يجب إصدار الوثيقة قبل نقلها إلى الأرشيف."
    );
  }

  const now = new Date().toISOString();
  const row = await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: DOCUMENTS_TABLE_ID,
    rowId: documentId,
    data: {
      updatedAt: now,
      content: encodeOfficialDocumentStorageContent({
        content: existing.content,
        subject: existing.subject,
        fieldValues: existing.fieldValues,
        serialNumber: existing.serialNumber,
        serialCode: existing.serialCode,
        documentDate: existing.documentDate,
        status: "archived",
        templateId: existing.templateId,
        templateRevision: existing.templateRevision,
        issuedAt: existing.issuedAt,
        archivedAt: now,
      }),
    },
  });
  return mapDocumentRow(row as AppwriteRow);
}
