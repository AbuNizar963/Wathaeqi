import { ID, Query } from "node-appwrite";
import type {
  DocumentTemplate,
  DocumentTemplateField,
  OfficialDocument,
  UploadedDocumentFile,
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
const PAGE_SIZE = 100;

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
  organizationId: string | null;
  templateId: string | null;
  templateRevision: number | null;
  templateFieldsSnapshot: DocumentTemplateField[];
  file?: UploadedDocumentFile | null;
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
  const decoded = decodeOfficialDocumentStorageContent(data.content, createdAt);
  return {
    id: row.$id,
    ownerId: String(data.ownerId ?? ""),
    organizationId: decoded.organizationId,
    templateId: decoded.templateId,
    templateRevision: decoded.templateRevision,
    templateFieldsSnapshot: decoded.templateFieldsSnapshot,
    title: String(data.title ?? ""),
    category: String(data.category ?? "general"),
    subject: decoded.subject,
    content: decoded.content,
    fieldValues: decoded.fieldValues,
    serialNumber: decoded.serialNumber,
    serialCode: decoded.serialCode,
    documentDate: decoded.documentDate,
    status: decoded.status,
    file: decoded.file,
    createdAt,
    updatedAt: rowUpdatedAt(row, data),
    issuedAt: decoded.issuedAt,
    archivedAt: decoded.archivedAt,
  };
}

async function getRowOrNull(
  tableId: string,
  rowId: string,
  transactionId?: string
): Promise<AppwriteRow | null> {
  try {
    return (await getAppwriteTablesDB().getRow({
      databaseId: getAppwriteDatabaseId(),
      tableId,
      rowId,
      ...(transactionId ? { transactionId } : {}),
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

async function listAllRows(
  tableId: string,
  baseQueries: string[]
): Promise<AppwriteRow[]> {
  const rows: AppwriteRow[] = [];
  let cursorAfter: string | undefined;

  while (true) {
    const result = await getAppwriteTablesDB().listRows({
      databaseId: getAppwriteDatabaseId(),
      tableId,
      queries: [
        ...baseQueries,
        ...(cursorAfter ? [Query.cursorAfter(cursorAfter)] : []),
        Query.limit(PAGE_SIZE),
      ],
      total: false,
    });
    const page = result.rows as AppwriteRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) return rows;

    const nextCursor = page[page.length - 1]?.$id;
    if (!nextCursor || nextCursor === cursorAfter) {
      throw new Error(`Appwrite pagination did not advance for table ${tableId}`);
    }
    cursorAfter = nextCursor;
  }
}
async function withTableTransaction<T>(
  operation: (transactionId: string) => Promise<T>
): Promise<T> {
  const tables = getAppwriteTablesDB();
  const transaction = await tables.createTransaction({ ttl: 60 });
  try {
    const result = await operation(transaction.$id);
    await tables.updateTransaction({
      transactionId: transaction.$id,
      commit: true,
    });
    return result;
  } catch (error) {
    try {
      await tables.updateTransaction({
        transactionId: transaction.$id,
        rollback: true,
      });
    } catch {
      // Preserve the original failure if the transaction already expired.
    }
    const code =
      error && typeof error === "object" && "code" in error
        ? Number((error as { code?: unknown }).code)
        : 0;
    if (code === 409) {
      throw new DocumentStudioConflictError(
        "تغيرت البيانات أثناء الحفظ. حدّث الصفحة ثم أعد المحاولة."
      );
    }
    throw error;
  }
}

export async function listDocumentTemplates(
  ownerId: string
): Promise<DocumentTemplate[]> {
  const rows = await listAllRows(TEMPLATES_TABLE_ID, [
    Query.equal("ownerId", ownerId),
    Query.orderDesc("$createdAt"),
  ]);
  return rows.map(mapTemplateRow);
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
  return withTableTransaction(async transactionId => {
    const row = await getRowOrNull(
      TEMPLATES_TABLE_ID,
      templateId,
      transactionId
    );
    if (!row || rowData(row).ownerId !== ownerId) return null;

    const existing = mapTemplateRow(row);
    if (existing.revision !== expectedRevision) {
      throw new DocumentStudioConflictError(
        "تم تعديل هذا النموذج في مكان آخر. حدّث الصفحة ثم أعد المحاولة."
      );
    }

    const updated = await getAppwriteTablesDB().updateRow({
      databaseId: getAppwriteDatabaseId(),
      tableId: TEMPLATES_TABLE_ID,
      rowId: templateId,
      transactionId,
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
    return mapTemplateRow(updated as AppwriteRow);
  });
}

export async function deactivateDocumentTemplate(
  ownerId: string,
  templateId: string,
  expectedRevision: number
): Promise<DocumentTemplate | null> {
  return withTableTransaction(async transactionId => {
    const row = await getRowOrNull(
      TEMPLATES_TABLE_ID,
      templateId,
      transactionId
    );
    if (!row || rowData(row).ownerId !== ownerId) return null;

    const existing = mapTemplateRow(row);
    if (existing.revision !== expectedRevision) {
      throw new DocumentStudioConflictError(
        "تم تعديل هذا النموذج في مكان آخر. حدّث الصفحة ثم أعد المحاولة."
      );
    }
    if (!existing.isActive) return existing;

    const updated = await getAppwriteTablesDB().updateRow({
      databaseId: getAppwriteDatabaseId(),
      tableId: TEMPLATES_TABLE_ID,
      rowId: templateId,
      transactionId,
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
    return mapTemplateRow(updated as AppwriteRow);
  });
}

export async function listOfficialDocuments(
  ownerId: string
): Promise<OfficialDocument[]> {
  const rows = await listAllRows(DOCUMENTS_TABLE_ID, [
    Query.equal("ownerId", ownerId),
    Query.orderDesc("updatedAt"),
  ]);
  return rows.map(mapDocumentRow);
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
  input: DocumentWriteInput,
  documentId = ID.unique()
): Promise<OfficialDocument> {
  const now = new Date().toISOString();
  const row = await getAppwriteTablesDB().createRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: DOCUMENTS_TABLE_ID,
    rowId: documentId,
    data: {
      ownerId,
      title: input.title,
      category: input.category,
      updatedAt: now,
      content: encodeOfficialDocumentStorageContent({
        content: input.content,
        subject: input.subject,
        fieldValues: input.fieldValues,
        organizationId: input.organizationId,
        templateFieldsSnapshot: input.templateFieldsSnapshot,
        serialNumber: 0,
        serialCode: "",
        documentDate: input.documentDate,
        status: "draft",
        file: input.file ?? null,
        templateId: input.templateId,
        templateRevision: input.templateRevision,
        issuedAt: null,
        archivedAt: null,
      }),
    },
  });
  return mapDocumentRow(row as AppwriteRow);
}

export async function deleteOfficialDocument(
  ownerId: string,
  documentId: string
): Promise<OfficialDocument | null> {
  const row = await getRowOrNull(DOCUMENTS_TABLE_ID, documentId);
  if (!row || rowData(row).ownerId !== ownerId) return null;
  const document = mapDocumentRow(row);
  await getAppwriteTablesDB().deleteRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: DOCUMENTS_TABLE_ID,
    rowId: documentId,
  });
  return document;
}

export async function updateOfficialDocument(
  ownerId: string,
  documentId: string,
  expectedUpdatedAt: string,
  input: DocumentWriteInput
): Promise<OfficialDocument | null> {
  return withTableTransaction(async transactionId => {
    const row = await getRowOrNull(
      DOCUMENTS_TABLE_ID,
      documentId,
      transactionId
    );
    if (!row || rowData(row).ownerId !== ownerId) return null;

    const existing = mapDocumentRow(row);
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
    const updated = await getAppwriteTablesDB().updateRow({
      databaseId: getAppwriteDatabaseId(),
      tableId: DOCUMENTS_TABLE_ID,
      rowId: documentId,
      transactionId,
      data: {
        title: input.title,
        category: input.category,
        updatedAt: now,
        content: encodeOfficialDocumentStorageContent({
          content: input.content,
          organizationId: input.organizationId,
          templateFieldsSnapshot: input.templateFieldsSnapshot,
          subject: input.subject,
          fieldValues: input.fieldValues,
          serialNumber: existing.serialNumber,
          serialCode: existing.serialCode,
          documentDate: input.documentDate,
          status: existing.status,
          file: existing.file,
          templateId: input.templateId,
          templateRevision: input.templateRevision,
          issuedAt: existing.issuedAt,
          archivedAt: existing.archivedAt,
        }),
      },
    });
    return mapDocumentRow(updated as AppwriteRow);
  });
}

export async function issueOfficialDocument(
  ownerId: string,
  documentId: string,
  expectedUpdatedAt: string,
  input: {
    organizationId: string;
    serialNumber: number;
    serialCode: string;
    issuedAt: string;
  }
): Promise<OfficialDocument | null> {
  return withTableTransaction(async transactionId => {
    const row = await getRowOrNull(
      DOCUMENTS_TABLE_ID,
      documentId,
      transactionId
    );
    if (!row || rowData(row).ownerId !== ownerId) return null;

    const existing = mapDocumentRow(row);
    if (existing.status === "issued") return existing;
    if (existing.status !== "draft") {
      throw new DocumentStudioConflictError("لا يمكن إصدار وثيقة مؤرشفة.");
    }
    if (existing.updatedAt !== expectedUpdatedAt) {
      throw new DocumentStudioConflictError(
        "تم تعديل الوثيقة قبل إصدارها. حدّث الصفحة ثم أعد المحاولة."
      );
    }

    const updated = await getAppwriteTablesDB().updateRow({
      databaseId: getAppwriteDatabaseId(),
      tableId: DOCUMENTS_TABLE_ID,
      rowId: documentId,
      transactionId,
      data: {
        updatedAt: input.issuedAt,
        content: encodeOfficialDocumentStorageContent({
          content: existing.content,
          organizationId: input.organizationId,
          templateFieldsSnapshot: existing.templateFieldsSnapshot,
          subject: existing.subject,
          fieldValues: existing.fieldValues,
          serialNumber: input.serialNumber,
          serialCode: input.serialCode,
          documentDate: existing.documentDate,
          status: "issued",
          file: existing.file,
          templateId: existing.templateId,
          templateRevision: existing.templateRevision,
          issuedAt: input.issuedAt,
          archivedAt: null,
        }),
      },
    });
    return mapDocumentRow(updated as AppwriteRow);
  });
}

export async function archiveOfficialDocument(
  ownerId: string,
  documentId: string,
  expectedUpdatedAt: string
): Promise<OfficialDocument | null> {
  return withTableTransaction(async transactionId => {
    const row = await getRowOrNull(
      DOCUMENTS_TABLE_ID,
      documentId,
      transactionId
    );
    if (!row || rowData(row).ownerId !== ownerId) return null;

    const existing = mapDocumentRow(row);
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
    const updated = await getAppwriteTablesDB().updateRow({
      databaseId: getAppwriteDatabaseId(),
      tableId: DOCUMENTS_TABLE_ID,
      rowId: documentId,
      transactionId,
      data: {
        updatedAt: now,
        content: encodeOfficialDocumentStorageContent({
          content: existing.content,
          organizationId: existing.organizationId,
          templateFieldsSnapshot: existing.templateFieldsSnapshot,
          subject: existing.subject,
          fieldValues: existing.fieldValues,
          serialNumber: existing.serialNumber,
          serialCode: existing.serialCode,
          documentDate: existing.documentDate,
          status: "archived",
          file: existing.file,
          templateId: existing.templateId,
          templateRevision: existing.templateRevision,
          issuedAt: existing.issuedAt,
          archivedAt: now,
        }),
      },
    });
    return mapDocumentRow(updated as AppwriteRow);
  });
}
