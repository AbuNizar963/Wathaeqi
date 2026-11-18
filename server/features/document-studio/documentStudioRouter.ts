import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { getRequestAuditContext } from "../../auditContext";
import {
  allocateOrganizationSerialNumber,
  getOrganizationSettings,
  getUserOrganizationMembership,
  writeAuditLog,
} from "../../db";
import { localizeDigits, normalizeNumberSystem } from "@shared/numberSystem";
import { validateTemplateFieldValues } from "../../../shared/documentStudio";
import {
  DocumentStudioConflictError,
  archiveOfficialDocument,
  createDocumentTemplate,
  createOfficialDocument,
  deactivateDocumentTemplate,
  getDocumentTemplate,
  getOfficialDocument,
  issueOfficialDocument,
  listDocumentTemplates,
  listOfficialDocuments,
  updateDocumentTemplate,
  updateOfficialDocument,
} from "./documentStudioRepository";

const editorDocumentSchema = z
  .record(z.string(), z.unknown())
  .refine(value => value.type === "doc", "محتوى المحرر غير صالح");

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
  templateFieldsSnapshot: import("../../../shared/documentStudio").DocumentTemplateField[];
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
  listTemplates: protectedProcedure.query(({ ctx }) =>
    listDocumentTemplates(ctx.user.authUserId)
  ),

  getTemplate: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .query(async ({ ctx, input }) => {
      const template = await getDocumentTemplate(ctx.user.authUserId, input.id);
      if (!template) throwIfNotFound("النموذج غير موجود");
      return template;
    }),

  createTemplate: protectedProcedure
    .input(templateWriteSchema)
    .mutation(async ({ ctx, input }) =>
      createDocumentTemplate(ctx.user.authUserId, {
        ...input,
        description: input.description ?? null,
      })
    ),

  updateTemplate: protectedProcedure
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

  deactivateTemplate: protectedProcedure
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

  listDocuments: protectedProcedure.query(({ ctx }) =>
    listOfficialDocuments(ctx.user.authUserId)
  ),

  getDocument: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .query(async ({ ctx, input }) => {
      const document = await getOfficialDocument(ctx.user.authUserId, input.id);
      if (!document) throwIfNotFound("الوثيقة غير موجودة");
      return document;
    }),

  createDocument: protectedProcedure
    .input(documentWriteSchema)
    .mutation(async ({ ctx, input }) => {
      const snapshot = await resolveTemplateSnapshot(
        ctx.user.authUserId,
        input.templateId,
        input.templateRevision,
        input.fieldValues
      );
      const membership = await getUserOrganizationMembership(ctx.user.id);
      return createOfficialDocument(ctx.user.authUserId, {
        title: input.title,
        category: input.category,
        subject: input.subject,
        content: input.content,
        fieldValues: input.fieldValues,
        documentDate: input.documentDate ?? new Date().toISOString(),
        organizationId: membership?.isActive ? membership.organizationId : null,
        ...snapshot,
      });
    }),

  updateDocument: protectedProcedure
    .input(
      documentWriteSchema.extend({
        id: z.string().min(1).max(36),
        expectedUpdatedAt: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getOfficialDocument(
        ctx.user.authUserId,
        input.id
      );
      if (!existing) throwIfNotFound("الوثيقة غير موجودة");

      let snapshot: {
        templateId: string | null;
        templateRevision: number | null;
        templateFieldsSnapshot: import("../../../shared/documentStudio").DocumentTemplateField[];
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
        return saved;
      } catch (error) {
        throwConflict(error);
      }
    }),

  archiveDocument: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1).max(36),
        expectedUpdatedAt: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getOfficialDocument(
        ctx.user.authUserId,
        input.id
      );
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
              beforeState: { status: existing.status },
              afterState: { status: saved.status },
            });
          } catch (error) {
            console.error("Document archive audit log failed", error);
          }
        }
        return saved;
      } catch (error) {
        throwConflict(error);
      }
    }),

  issueDocument: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1).max(36),
        expectedUpdatedAt: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getOfficialDocument(
        ctx.user.authUserId,
        input.id
      );
      if (!existing) throwIfNotFound("الوثيقة غير موجودة");
      if (existing.status === "issued") return existing;
      if (existing.status !== "draft") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "لا يمكن إصدار وثيقة مؤرشفة.",
        });
      }

      const membership = await getUserOrganizationMembership(ctx.user.id);
      if (!membership?.isActive) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "يجب أن تكون لديك عضوية نشطة في جهة العمل لإصدار الوثيقة.",
        });
      }
      if (
        existing.organizationId &&
        existing.organizationId !== membership.organizationId
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا تملك صلاحية إصدار وثيقة تابعة لجهة أخرى.",
        });
      }

      const organizationId =
        existing.organizationId ?? membership.organizationId;
      const settings = await getOrganizationSettings(organizationId);
      if (!settings) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "إعدادات الجهة غير مكتملة لإصدار الوثائق.",
        });
      }

      const serialNumber = await allocateOrganizationSerialNumber(
        organizationId,
        "outgoing"
      );
      const dateParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: settings.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const dateValues = Object.fromEntries(
        dateParts.map(part => [part.type, part.value])
      );
      const serialCode = localizeDigits(
        `${settings.serialPrefix}-${dateValues.year}-${dateValues.month}-${dateValues.day}-${String(serialNumber).padStart(5, "0")}`,
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
        try {
          await writeAuditLog({
            ...getRequestAuditContext(ctx.req),
            actorUserId: ctx.user.id,
            actorName: ctx.user.name ?? ctx.user.email ?? "User",
            action: "document.issue",
            entityType: "document",
            entityId: saved.id,
            organizationId,
            beforeState: { status: "draft" },
            afterState: {
              status: "issued",
              serialNumber: saved.serialNumber,
              serialCode: saved.serialCode,
            },
          });
        } catch (error) {
          console.error("Document issuance audit log failed", error);
        }
        return saved;
      } catch (error) {
        throwConflict(error);
      }
    }),
});
