import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authenticatedProcedure, router } from "../../_core/ownerTrpc";
import { getRequestAuditContext } from "../../auditContext";
import { resolveOrganizationScope } from "../organizations/organizationAccess";
import { writeAuditLog } from "../audit/appwriteAuditRepository";
import {
  allocateDocumentOrganizationSerialNumber,
  getDocumentOrganizationSettings,
} from "./documentOrganizationRepository";
import { localizeDigits, normalizeNumberSystem } from "@shared/numberSystem";
import { validateTemplateFieldValues } from "../../../shared/documentStudio";
import type {
  DocumentTemplateField,
  OfficialDocument,
  UploadedDocumentFile,
} from "../../../shared/documentStudio";
import {
  DocumentStudioConflictError,
  archiveOfficialDocument,
  createDocumentTemplate,
  createOfficialDocument,
  deactivateDocumentTemplate,
  deleteOfficialDocument,
  getDocumentTemplate,
  getOfficialDocument,
  issueOfficialDocument,
  listDocumentTemplates,
  listOfficialDocumentVersions,
  restoreOfficialDocumentVersion,
  listOfficialDocuments,
  updateDocumentTemplate,
  updateOfficialDocument,
} from "./documentStudioRepository";
import { getStorageProvider } from "../../_core/storageProvider";
import {
  getAllowedDocumentMimeType,
  isValidDocumentFile,
  isSafeDocumentStorageKey,
  MAX_DOCUMENT_UPLOAD_BYTES,
} from "./documentUploadValidation";

function isEditorNode(value: unknown, depth = 0): boolean {
  if (
    depth > 100 ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }
  const node = value as Record<string, unknown>;
  if (typeof node.type !== "string" || node.type.length === 0) return false;
  if (node.type === "text" && typeof node.text !== "string") return false;
  if (node.content === undefined) return true;
  return (
    Array.isArray(node.content) &&
    node.content.every(child => isEditorNode(child, depth + 1))
  );
}

const editorDocumentSchema = z
  .record(z.string(), z.unknown())
  .refine(
    value =>
      (value.type === "doc" &&
        Array.isArray(value.content) &&
        value.content.every(child => isEditorNode(child))) ||
      (value.type === "legacy-text" && typeof value.text === "string") ||
      (value.type === "legacy-html" && typeof value.html === "string"),
    "محتوى المحرر غير صالح"
  );

const templateFieldOptionSchema = z.object({
  value: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
});

const templateFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  label: z.string().trim().min(1).max(160),
  type: z.enum(["text", "multiline", "date", "number", "select"]),
  required: z.boolean(),
  maxLength: z.number().int().min(1).max(10000).optional(),
  options: z.array(templateFieldOptionSchema).max(100).optional(),
  defaultValue: z.string().max(10000).optional(),
});

const templateFieldsSchema = z
  .array(templateFieldSchema)
  .max(50)
  .superRefine((fields, context) => {
    const keys = new Set<string>();
    fields.forEach((field, index) => {
      if (keys.has(field.key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: "مفتاح الحقل مكرر",
        });
      }
      keys.add(field.key);
      if (field.type === "select" && !field.options?.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "options"],
          message: "يجب تحديد خيارات الحقل",
        });
      }
    });
  });

const templateWriteSchema = z.object({
  title: z.string().trim().min(1).max(256),
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).nullable().optional(),
  content: editorDocumentSchema,
  fields: templateFieldsSchema,
});

const fieldValuesSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  z.string().max(10000)
);

const documentWriteSchema = z.object({
  title: z.string().trim().min(1).max(256),
  category: z.string().trim().min(1).max(100),
  subject: z.string().trim().max(256).default(""),
  content: editorDocumentSchema,
  fieldValues: fieldValuesSchema.default({}),
  documentDate: z.string().datetime().optional(),
  templateId: z.string().min(1).max(36).nullable().optional(),
  templateRevision: z.number().int().positive().nullable().optional(),
});

function throwIfNotFound(message: string): never {
  throw new TRPCError({ code: "NOT_FOUND", message });
}

type ClientDocument = Omit<OfficialDocument, "file"> & {
  file: Omit<UploadedDocumentFile, "storageKey"> | null;
};

function toClientDocument(document: OfficialDocument): ClientDocument {
  const { file, ...rest } = document;
  if (!file) return { ...rest, file: null };
  const { storageKey: _storageKey, ...publicFile } = file;
  return { ...rest, file: publicFile };
}

function throwConflict(error: unknown): never {
  if (error instanceof DocumentStudioConflictError) {
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }
  throw error;
}

function assertTemplateFieldValues(
  fields: Parameters<typeof validateTemplateFieldValues>[0],
  values: Record<string, string>
): void {
  const issues = validateTemplateFieldValues(fields, values);
  if (issues.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: issues.map(issue => issue.message).join(" "),
    });
  }
}

async function resolveTemplateSnapshot(
  ownerId: string,
  templateId: string | null | undefined,
  requestedRevision: number | null | undefined,
  fieldValues: Record<string, string>
): Promise<{
  templateId: string | null;
  templateRevision: number | null;
  templateFieldsSnapshot: DocumentTemplateField[];
}> {
  if (!templateId) {
    return {
      templateId: null,
      templateRevision: null,
      templateFieldsSnapshot: [],
    };
  }

  const template = await getDocumentTemplate(ownerId, templateId);
  if (!template || !template.isActive) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "النموذج غير موجود أو غير متاح",
    });
  }
  if (
    requestedRevision !== undefined &&
    requestedRevision !== null &&
    requestedRevision !== template.revision
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "تم تحديث النموذج. اختر النسخة الحالية قبل إنشاء الوثيقة.",
    });
  }
  assertTemplateFieldValues(template.fields, fieldValues);
  return {
    templateId: template.id,
    templateRevision: template.revision,
    templateFieldsSnapshot: template.fields,
  };
}

export const documentStudioRouter = router({
  getLetterheadSettings: authenticatedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1).max(36).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveOrganizationScope(ctx.user);
      const organizationId = input.organizationId ?? scope.organizationId;
      if (organizationId !== scope.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا تملك صلاحية عرض ترويسة هذه الجهة.",
        });
      }

      const settings = await getDocumentOrganizationSettings(organizationId);
      if (!settings) return null;
      return {
        organizationId,
        departmentName: settings.departmentName,
        unitName: settings.unitName,
        unitChiefRank: settings.unitChiefRank,
        unitChiefName: settings.unitChiefName,
        logoUrl: settings.logoUrl,
        serialPrefix: settings.serialPrefix,
        numberSystem: settings.numberSystem,
        dateFormat: settings.dateFormat,
        timezone: settings.timezone,
      };
    }),
  listTemplates: authenticatedProcedure.query(({ ctx }) =>
    listDocumentTemplates(ctx.user.authUserId)
  ),

  getTemplate: authenticatedProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .query(async ({ ctx, input }) => {
      const template = await getDocumentTemplate(ctx.user.authUserId, input.id);
      if (!template) throwIfNotFound("النموذج غير موجود");
      return template;
    }),

  createTemplate: authenticatedProcedure
    .input(templateWriteSchema)
    .mutation(async ({ ctx, input }) =>
      createDocumentTemplate(ctx.user.authUserId, {
        ...input,
        description: input.description ?? null,
      })
    ),

  updateTemplate: authenticatedProcedure
    .input(
      templateWriteSchema.extend({
        id: z.string().min(1).max(36),
        expectedRevision: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const saved = await updateDocumentTemplate(
          ctx.user.authUserId,
          input.id,
          input.expectedRevision,
          {
            title: input.title,
            category: input.category,
            description: input.description ?? null,
            content: input.content,
            fields: input.fields,
          }
        );
        if (!saved) throwIfNotFound("النموذج غير موجود");
        return saved;
      } catch (error) {
        throwConflict(error);
      }
    }),

  deactivateTemplate: authenticatedProcedure
    .input(
      z.object({
        id: z.string().min(1).max(36),
        expectedRevision: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const saved = await deactivateDocumentTemplate(
          ctx.user.authUserId,
          input.id,
          input.expectedRevision
        );
        if (!saved) throwIfNotFound("النموذج غير موجود");
        return saved;
      } catch (error) {
        throwConflict(error);
      }
    }),

  listDocuments: authenticatedProcedure.query(async ({ ctx }) =>
    (await listOfficialDocuments(ctx.user.authUserId)).map(toClientDocument)
  ),

  getDocument: authenticatedProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .query(async ({ ctx, input }) => {
      const document = await getOfficialDocument(ctx.user.authUserId, input.id);
      if (!document) throwIfNotFound("الوثيقة غير موجودة");
      return toClientDocument(document);
    }),

  listDocumentVersions: authenticatedProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .query(async ({ ctx, input }) => {
      const versions = await listOfficialDocumentVersions(
        ctx.user.authUserId,
        input.id
      );
      if (!versions) throwIfNotFound("الوثيقة غير موجودة");
      return versions;
    }),

  restoreDocumentVersion: authenticatedProcedure
    .input(
      z.object({
        id: z.string().min(1).max(36),
        version: z.number().int().positive(),
        expectedUpdatedAt: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const restored = await restoreOfficialDocumentVersion(
          ctx.user.authUserId,
          input.id,
          input.version,
          input.expectedUpdatedAt
        );
        if (!restored) throwIfNotFound("الوثيقة غير موجودة");
        return toClientDocument(restored);
      } catch (error) {
        throwConflict(error);
      }
    }),

  createUploadedDocument: authenticatedProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).max(256),
        category: z.string().trim().min(1).max(100).default("general"),
        subject: z.string().trim().max(256).default(""),
        documentDate: z.string().datetime().optional(),
        storageKey: z.string().trim().min(1).max(512),
        fileName: z.string().trim().min(1).max(256),
        mimeType: z.string().trim().min(1).max(160),
        sizeBytes: z.number().int().positive().max(MAX_DOCUMENT_UPLOAD_BYTES),
        pageCount: z.number().int().min(0).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        !isSafeDocumentStorageKey(
          input.storageKey,
          ctx.user.authUserId,
          input.fileName
        ) ||
        getAllowedDocumentMimeType(input.fileName) !== input.mimeType
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "بيانات الملف أو ملكيته غير صالحة",
        });
      }
      const storage = getStorageProvider();
      const info = await storage.getObjectInfo(input.storageKey);
      if (
        !Number.isSafeInteger(info.size) ||
        info.size !== input.sizeBytes ||
        info.size > MAX_DOCUMENT_UPLOAD_BYTES ||
        info.contentType !== input.mimeType
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "حجم الملف المسجل لا يطابق الملف المرفوع",
        });
      }
      const stored = await storage.download(input.storageKey);
      if (
        stored.body.length !== input.sizeBytes ||
        !(await isValidDocumentFile(stored.body, input.fileName))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "محتوى الملف لا يطابق بياناته أو أنه تالف",
        });
      }
      const scope = await resolveOrganizationScope(ctx.user);
      const created = await createOfficialDocument(ctx.user.authUserId, {
        title: input.title,
        category: input.category,
        subject: input.subject,
        content: { type: "doc", content: [{ type: "paragraph" }] },
        fieldValues: {},
        documentDate: input.documentDate ?? new Date().toISOString(),
        organizationId: scope.organizationId,
        templateId: null,
        templateRevision: null,
        templateFieldsSnapshot: [],
        file: {
          storageKey: input.storageKey,
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          pageCount: input.pageCount,
        },
      });
      return toClientDocument(created);
    }),

  getFileUrl: authenticatedProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .query(async ({ ctx, input }) => {
      const document = await getOfficialDocument(ctx.user.authUserId, input.id);
      if (!document) throwIfNotFound("الوثيقة غير موجودة");
      if (!document.file) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "هذه الوثيقة لا تحتوي على ملف مرفوع",
        });
      }
      const url = await getStorageProvider().createSignedUrl(
        document.file.storageKey,
        300
      );
      return { url, expiresInSeconds: 300 as const };
    }),

  deleteDocument: authenticatedProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .mutation(async ({ ctx, input }) => {
      const removed = await deleteOfficialDocument(
        ctx.user.authUserId,
        input.id
      );
      if (!removed) throwIfNotFound("الوثيقة غير موجودة");

      let fileCleanupSucceeded = true;
      if (removed.file) {
        const storage = getStorageProvider();
        if (!storage.remove) {
          fileCleanupSucceeded = false;
        } else {
          try {
            await storage.remove(removed.file.storageKey);
          } catch (error) {
            fileCleanupSucceeded = false;
            console.error("Document attachment cleanup failed", error);
          }
        }
      }

      let auditLogRecorded = true;
      try {
        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "مستخدم",
          actorRole: ctx.user.role,
          organizationId: removed.organizationId ?? undefined,
          action: "document.deleted",
          entityType: "document",
          entityId: removed.id,
          metadata: {
            title: removed.title,
            category: removed.category,
            fileName: removed.file?.fileName ?? null,
            fileCleanupSucceeded,
          },
          beforeState: {
            title: removed.title,
            status: removed.status,
          },
          afterState: { deleted: true },
        });
      } catch (error) {
        auditLogRecorded = false;
        console.error("Document deletion audit log failed", error);
      }

      return {
        success: true as const,
        auditLogRecorded,
        fileCleanupSucceeded,
      };
    }),

  createDocument: authenticatedProcedure
    .input(documentWriteSchema)
    .mutation(async ({ ctx, input }) => {
      const snapshot = await resolveTemplateSnapshot(
        ctx.user.authUserId,
        input.templateId,
        input.templateRevision,
        input.fieldValues
      );
      const scope = await resolveOrganizationScope(ctx.user);
      const saved = await createOfficialDocument(ctx.user.authUserId, {
        title: input.title,
        category: input.category,
        subject: input.subject,
        content: input.content,
        fieldValues: input.fieldValues,
        documentDate: input.documentDate ?? new Date().toISOString(),
        organizationId: scope.organizationId,
        ...snapshot,
      });
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.email ?? "مستخدم",
        actorRole: ctx.user.role,
        organizationId: scope.organizationId,
        action: "document.created",
        entityType: "document",
        entityId: saved.id,
        metadata: { title: saved.title, category: saved.category },
        afterState: { status: saved.status, title: saved.title },
      });
      return toClientDocument(saved);
    }),

  updateDocument: authenticatedProcedure
    .input(
      documentWriteSchema.extend({
        id: z.string().min(1).max(36),
        expectedUpdatedAt: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getOfficialDocument(ctx.user.authUserId, input.id);
      if (!existing) throwIfNotFound("الوثيقة غير موجودة");

      let snapshot: {
        templateId: string | null;
        templateRevision: number | null;
        templateFieldsSnapshot: DocumentTemplateField[];
      };
      if (input.templateId === existing.templateId) {
        if (
          input.templateRevision !== undefined &&
          input.templateRevision !== existing.templateRevision
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "نسخة النموذج المرتبطة بهذه الوثيقة غير متطابقة.",
          });
        }
        snapshot = {
          templateId: existing.templateId,
          templateRevision: existing.templateRevision,
          templateFieldsSnapshot: existing.templateFieldsSnapshot,
        };
        assertTemplateFieldValues(
          snapshot.templateFieldsSnapshot,
          input.fieldValues
        );
      } else {
        snapshot = await resolveTemplateSnapshot(
          ctx.user.authUserId,
          input.templateId,
          input.templateRevision,
          input.fieldValues
        );
      }

      try {
        const saved = await updateOfficialDocument(
          ctx.user.authUserId,
          input.id,
          input.expectedUpdatedAt,
          {
            title: input.title,
            category: input.category,
            subject: input.subject,
            content: input.content,
            fieldValues: input.fieldValues,
            documentDate: input.documentDate ?? new Date().toISOString(),
            organizationId: existing.organizationId,
            ...snapshot,
          }
        );
        if (!saved) throwIfNotFound("الوثيقة غير موجودة");
        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "مستخدم",
          actorRole: ctx.user.role,
          organizationId: saved.organizationId ?? undefined,
          action: "document.updated",
          entityType: "document",
          entityId: saved.id,
          metadata: { title: saved.title, category: saved.category },
          beforeState: { title: existing.title, category: existing.category },
          afterState: { title: saved.title, category: saved.category },
        });
        return toClientDocument(saved);
      } catch (error) {
        throwConflict(error);
      }
    }),

  recordPrint: authenticatedProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .mutation(async ({ ctx, input }) => {
      const document = await getOfficialDocument(ctx.user.authUserId, input.id);
      if (!document) throwIfNotFound("الوثيقة غير موجودة");
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.email ?? "مستخدم",
        actorRole: ctx.user.role,
        organizationId: document.organizationId ?? undefined,
        action: "document.print",
        entityType: "document",
        entityId: document.id,
        metadata: {
          title: document.title,
          status: document.status,
          serialCode: document.serialCode,
        },
      });
      return { success: true as const };
    }),

  archiveDocument: authenticatedProcedure
    .input(
      z.object({
        id: z.string().min(1).max(36),
        expectedUpdatedAt: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getOfficialDocument(ctx.user.authUserId, input.id);
      if (!existing) throwIfNotFound("الوثيقة غير موجودة");
      try {
        const saved = await archiveOfficialDocument(
          ctx.user.authUserId,
          input.id,
          input.expectedUpdatedAt
        );
        if (!saved) throwIfNotFound("الوثيقة غير موجودة");
        if (existing.status !== "archived") {
          try {
            await writeAuditLog({
              ...getRequestAuditContext(ctx.req),
              actorUserId: ctx.user.id,
              actorName: ctx.user.name ?? ctx.user.email ?? "User",
              action: "document.archive",
              entityType: "document",
              entityId: saved.id,
              organizationId: saved.organizationId ?? undefined,
              metadata: JSON.stringify({ status: saved.status }),
              beforeState: JSON.stringify({ status: existing.status }),
              afterState: JSON.stringify({ status: saved.status }),
            });
          } catch (error) {
            console.error("Document archive audit log failed", error);
          }
        }
        return toClientDocument(saved);
      } catch (error) {
        throwConflict(error);
      }
    }),

  issueDocument: authenticatedProcedure
    .input(
      z.object({
        id: z.string().min(1).max(36),
        expectedUpdatedAt: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getOfficialDocument(ctx.user.authUserId, input.id);
      if (!existing) throwIfNotFound("الوثيقة غير موجودة");
      if (existing.status === "issued") return toClientDocument(existing);
      if (existing.status !== "draft") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "لا يمكن إصدار وثيقة مؤرشفة.",
        });
      }

      const scope = await resolveOrganizationScope(ctx.user);
      if (!scope.canAdministrate) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا تملك صلاحية إصدار الوثائق الرسمية في هذه الجهة.",
        });
      }
      if (
        existing.organizationId &&
        existing.organizationId !== scope.organizationId
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا تملك صلاحية إصدار وثيقة تابعة لجهة أخرى.",
        });
      }

      const organizationId = existing.organizationId ?? scope.organizationId;
      const settings = await getDocumentOrganizationSettings(organizationId);
      if (!settings) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "إعدادات الجهة غير مكتملة لإصدار الوثائق.",
        });
      }

      const serialNumber =
        await allocateDocumentOrganizationSerialNumber(organizationId);
      const serialCode = localizeDigits(
        `${settings.serialPrefix}-${String(serialNumber).padStart(5, "0")}`,
        normalizeNumberSystem(settings.numberSystem)
      );
      const issuedAt = new Date().toISOString();

      try {
        const saved = await issueOfficialDocument(
          ctx.user.authUserId,
          input.id,
          input.expectedUpdatedAt,
          {
            organizationId,
            serialNumber,
            serialCode,
            issuedAt,
          }
        );
        if (!saved) throwIfNotFound("الوثيقة غير موجودة");
        if (saved.serialNumber === serialNumber) {
          try {
            await writeAuditLog({
              ...getRequestAuditContext(ctx.req),
              actorUserId: ctx.user.id,
              actorName: ctx.user.name ?? ctx.user.email ?? "User",
              action: "document.issue",
              entityType: "document",
              entityId: saved.id,
              organizationId,
              metadata: JSON.stringify({
                serialNumber: saved.serialNumber,
                serialCode: saved.serialCode,
                issuedAt: saved.issuedAt,
              }),
              beforeState: JSON.stringify({ status: "draft" }),
              afterState: JSON.stringify({
                status: "issued",
                serialNumber: saved.serialNumber,
                serialCode: saved.serialCode,
              }),
            });
          } catch (error) {
            console.error("Document issuance audit log failed", error);
          }
        }
        return toClientDocument(saved);
      } catch (error) {
        throwConflict(error);
      }
    }),
});
