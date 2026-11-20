import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authenticatedProcedure, router } from "../../_core/ownerTrpc";
import { getRequestAuditContext } from "../../auditContext";
import type { TrpcContext } from "../../_core/context";
import { writeAuditLog } from "../audit/appwriteAuditRepository";
import { getStorageProvider } from "../../_core/storageProvider";
import {
  TELEGRAM_CATEGORIES,
  TELEGRAM_CLASSIFICATIONS,
  TELEGRAM_DIRECTIONS,
  TELEGRAM_PRIORITIES,
  TELEGRAM_STATUSES,
  buildTelegramSerialCode,
  getImportDirection,
  isDeletableTelegramStatus,
  isEditableTelegramStatus,
  makeImportSerialKey,
  nextTelegramStatuses,
  type TelegramClassification,
  type TelegramCategory,
  type TelegramPriority,
  type TelegramRecord,
  type TelegramStatus,
} from "../../../shared/telegrams";
import {
  assertTelegramActionable,
  assertTelegramVisible,
  resolveTelegramScope,
  type TelegramScope,
} from "./telegramAccess";
import {
  TelegramConflictError,
  TelegramNotFoundError,
  TelegramValidationError,
  allocateIncomingSerial,
  createTelegram,
  createTelegramAttachment,
  createTelegramRoute,
  deleteTelegramPermanently,
  ensureDepartmentSettings,
  findTelegramByOfficialSerial,
  getTelegramAttachment,
  getTelegramById,
  getTelegramByIdempotencyKey,
  getTelegramRoute,
  listIncomingRoutes,
  listTelegramActions,
  listTelegramAttachments,
  listTelegramRoutes,
  listTelegrams,
  listTelegramVersions,
  recordTelegramAction,
  recordTelegramVersion,
  setTelegramRevision,
  setTelegramStatusAfterRoute,
  transitionTelegram,
  updateTelegram,
  updateTelegramRoute,
} from "./telegramRepository";
import {
  getOrganization,
  listOrganizationDescendants,
  listRoutingTargets,
} from "../organizations/organizationService";
import { notifyOrganization } from "../notifications/notificationService";
import { parseTelegramWorkbookBase64 } from "../../telegramImportWorkbook";
import { buildTelegramWorkbook } from "../../telegramWorkbook";
import { parseImportedDate } from "../../importedDate";
import {
  localizeDigits,
  normalizeNumberSystem,
} from "../../../shared/numberSystem";

const idSchema = z.coerce.number().int().positive();

const filterSchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    classification: z.enum(TELEGRAM_CLASSIFICATIONS).optional(),
    priority: z.enum(TELEGRAM_PRIORITIES).optional(),
    category: z.enum(TELEGRAM_CATEGORIES).optional(),
    status: z.enum(TELEGRAM_STATUSES).optional(),
    direction: z.enum(TELEGRAM_DIRECTIONS).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    organizationScope: z.string().max(36).optional(),
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
  })
  .optional();

const contentSchema = z.object({
  subject: z.string().trim().min(2).max(255),
  recipient: z.string().trim().min(2).max(255),
  body: z.string().trim().min(3).max(20000),
  classification: z.enum(TELEGRAM_CLASSIFICATIONS),
  priority: z.enum(TELEGRAM_PRIORITIES),
  category: z.enum(TELEGRAM_CATEGORIES),
  originalSerial: z.string().trim().max(120).nullable().optional(),
  attachmentManifest: z.string().max(10000).nullable().optional(),
  gpsLatitude: z.string().max(40).nullable().optional(),
  gpsLongitude: z.string().max(40).nullable().optional(),
  telegramDate: z.string().datetime().nullable().optional(),
});

const importRowSchema = z.object({
  originalSerial: z.string().max(120).optional().default(""),
  time: z.string().max(60).optional().default(""),
  sender: z.string().max(255).optional().default(""),
  date: z.string().max(60).optional().default(""),
  body: z.string().min(1).max(20000),
  recipient: z.string().max(255).optional().default(""),
  signature: z.string().max(255).optional().default(""),
  notes: z.string().max(4000).optional().default(""),
  sheetName: z.string().max(40).optional().default("صادر"),
});

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
]);

function mapError(error: unknown): never {
  if (error instanceof TelegramNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: error.message });
  }
  if (error instanceof TelegramConflictError) {
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }
  if (error instanceof TelegramValidationError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  if (error instanceof TRPCError) throw error;
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message:
      error instanceof Error ? error.message : "تعذر إكمال العملية على البرقية",
  });
}

async function requireTelegram(
  id: number,
  scope: TelegramScope
): Promise<TelegramRecord> {
  const telegram = await getTelegramById(id);
  if (!telegram)
    throw new TRPCError({ code: "NOT_FOUND", message: "البرقية غير موجودة" });
  assertTelegramVisible(scope, telegram);
  return telegram;
}

function actorName(scope: TelegramScope, name: string | null): string {
  return name?.trim() || `مستخدم ${scope.userId}`;
}

async function audit(
  ctx: TrpcContext,
  scope: TelegramScope,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    metadata?: unknown;
    beforeState?: unknown;
    afterState?: unknown;
  }
): Promise<void> {
  try {
    await writeAuditLog({
      ...getRequestAuditContext(ctx.req),
      actorUserId: scope.userId,
      actorName: actorName(scope, ctx.user?.name ?? null),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      organizationId: scope.organizationId,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      beforeState: input.beforeState ? JSON.stringify(input.beforeState) : null,
      afterState: input.afterState ? JSON.stringify(input.afterState) : null,
    });
  } catch (error) {
    console.error("Telegram audit log failed", error);
  }
}

export const telegramRouter = router({
  list: authenticatedProcedure
    .input(filterSchema)
    .query(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      const filters = input ?? { page: 1, pageSize: 25 };
      let organizationIds = scope.organizationIds;
      if (filters.organizationScope) {
        const allowed = new Set(scope.organizationIds ?? []);
        if (
          filters.organizationScope !== "children" &&
          !scope.isOwner &&
          !allowed.has(filters.organizationScope)
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "لا تملك صلاحية عرض برقيات هذه الجهة.",
          });
        }
        if (filters.organizationScope === "children") {
          organizationIds = scope.organizationIds
            ? [
                scope.organizationId,
                ...scope.organizationIds.filter(
                  id => id !== scope.organizationId
                ),
              ]
            : null;
        } else {
          organizationIds = [filters.organizationScope];
        }
      }
      return listTelegrams(organizationIds, filters);
    }),

  get: authenticatedProcedure
    .input(z.object({ id: idSchema }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      const telegram = await requireTelegram(input.id, scope);
      const senderOrganization = await getOrganization(telegram.organizationId);
      const currentOrganization = await getOrganization(
        telegram.currentOrganizationId
      );
      return {
        ...telegram,
        senderOrganizationName: senderOrganization?.name ?? null,
        currentOrganizationName: currentOrganization?.name ?? null,
        nextStatuses: nextTelegramStatuses(telegram.status),
        canEdit: isEditableTelegramStatus(telegram.status),
        canDelete: isDeletableTelegramStatus(telegram.status),
      };
    }),

  create: authenticatedProcedure
    .input(
      contentSchema.extend({
        recipientOrganizationId: z.string().max(36).optional(),
        broadcastToDescendants: z.boolean().optional(),
        idempotencyKey: z.string().trim().min(16).max(120).optional(),
        requestedOrganizationSerialNumber: z
          .number()
          .int()
          .min(1)
          .max(999999999)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const scope = await resolveTelegramScope(ctx.user);
        if (!scope.canManage) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "لا تملك صلاحية إنشاء البرقيات في هذه الجهة.",
          });
        }
        if (input.idempotencyKey) {
          const existing = await getTelegramByIdempotencyKey(
            input.idempotencyKey
          );
          if (existing) {
            assertTelegramVisible(scope, existing);
            return existing;
          }
        }

        const settings = await ensureDepartmentSettings(scope.organizationId);
        const numberSystem = normalizeNumberSystem(settings.numberSystem);
        const targets = await listRoutingTargets(scope.organizationId);
        let destinationId = input.recipientOrganizationId ?? null;
        if (
          destinationId &&
          !targets.some(target => target.id === destinationId)
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "الجهة المختارة غير متاحة ضمن مسار العمل المسموح",
          });
        }
        if (!destinationId) {
          const organization = await getOrganization(scope.organizationId);
          destinationId =
            organization?.telegramDestinationOrganizationId ?? null;
        }

        const telegram = await createTelegram({
          subject: localizeDigits(input.subject, numberSystem),
          recipient: localizeDigits(input.recipient, numberSystem),
          body: localizeDigits(input.body, numberSystem),
          classification: input.classification,
          priority: input.priority,
          category: input.category,
          idempotencyKey: input.idempotencyKey ?? null,
          attachmentManifest: input.attachmentManifest ?? null,
          gpsLatitude: input.gpsLatitude ?? null,
          gpsLongitude: input.gpsLongitude ?? null,
          originalSerial: input.originalSerial ?? null,
          telegramDate: input.telegramDate ?? null,
          requestedOrganizationSerialNumber:
            input.requestedOrganizationSerialNumber ?? null,
          organizationId: scope.organizationId,
          createdByUserId: ctx.user.id,
          creatorName: actorName(scope, ctx.user.name),
          creatorEmail: ctx.user.email,
          creatorBadgeId: ctx.user.badgeNumber,
          creatorIp: null,
          creatorFingerprint: ctx.user.authUserId,
        });

        await recordTelegramAction({
          telegramId: Number(telegram.id),
          actorUserId: ctx.user.id,
          action: "telegram.create",
          toStatus: telegram.status,
          metadata: { serialCode: telegram.serialCode },
        });
        await recordTelegramVersion({
          telegramId: Number(telegram.id),
          versionNumber: 1,
          changedByUserId: ctx.user.id,
          changeReason: "الإصدار الأول عند إنشاء البرقية",
          snapshot: telegram,
        });
        await audit(ctx, scope, {
          action: "telegram.create",
          entityType: "telegram",
          entityId: telegram.id,
          metadata: {
            serialCode: telegram.serialCode,
            classification: telegram.classification,
          },
          afterState: telegram,
        });

        if (input.broadcastToDescendants) {
          const descendants = await listOrganizationDescendants(
            scope.organizationId,
            { activeOnly: true }
          );
          const children = descendants.filter(
            item => item.parentOrganizationId === scope.organizationId
          );
          if (children.length === 0) {
            throw new TelegramValidationError(
              "لا توجد جهات تابعة مباشرة لإرسال البرقية إليها."
            );
          }
          for (let index = 0; index < children.length; index += 1) {
            const child = children[index];
            const copy =
              index === 0
                ? telegram
                : await createTelegram({
                    subject: telegram.subject,
                    recipient: child.name,
                    body: telegram.body,
                    classification: telegram.classification,
                    priority: telegram.priority,
                    category: telegram.category,
                    attachmentManifest: telegram.attachmentManifest,
                    gpsLatitude: telegram.gpsLatitude,
                    gpsLongitude: telegram.gpsLongitude,
                    organizationId: scope.organizationId,
                    createdByUserId: ctx.user.id,
                    creatorName: actorName(scope, ctx.user.name),
                    creatorEmail: ctx.user.email,
                    creatorBadgeId: ctx.user.badgeNumber,
                    creatorIp: null,
                    creatorFingerprint: ctx.user.authUserId,
                  });
            await routeTelegramTo(ctx.user, scope, copy, child.id, {
              note: "إرسال جماعي إلى الجهات التابعة مباشرة",
              skipStatusCheck: true,
            });
            if (index > 0) {
              await recordTelegramAction({
                telegramId: Number(copy.id),
                actorUserId: ctx.user.id,
                action: "telegram.broadcast.copy",
                toStatus: copy.status,
                metadata: { sourceTelegramId: telegram.id, target: child.id },
              });
            }
          }
        } else if (destinationId) {
          await routeTelegramTo(ctx.user, scope, telegram, destinationId, {
            note: input.recipientOrganizationId
              ? "إحالة إلى الجهة المختارة عند إنشاء البرقية"
              : "إحالة تلقائية إلى الجهة المحددة للقسم",
            skipStatusCheck: true,
          });
        }

        const refreshed = await getTelegramById(Number(telegram.id));
        return refreshed ?? telegram;
      } catch (error) {
        mapError(error);
      }
    }),

  update: authenticatedProcedure
    .input(
      contentSchema.extend({
        id: idSchema,
        expectedRevision: z.number().int().positive().optional(),
        status: z.enum(TELEGRAM_STATUSES).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const scope = await resolveTelegramScope(ctx.user);
        const existing = await requireTelegram(input.id, scope);
        assertTelegramActionable(scope, existing);
        if (!isEditableTelegramStatus(existing.status)) {
          throw new TelegramValidationError(
            "لا يمكن تعديل برقية بعد إرسالها للمراجعة. أعدها للتعديل أولاً."
          );
        }
        const saved = await updateTelegram(
          input.id,
          input.expectedRevision ?? existing.revision,
          {
            subject: input.subject,
            recipient: input.recipient,
            body: input.body,
            classification: input.classification,
            priority: input.priority,
            category: input.category,
            originalSerial: input.originalSerial ?? null,
            attachmentManifest: input.attachmentManifest ?? null,
            gpsLatitude: input.gpsLatitude ?? null,
            gpsLongitude: input.gpsLongitude ?? null,
            telegramDate: input.telegramDate ?? null,
          }
        );
        await recordTelegramVersion({
          telegramId: input.id,
          versionNumber: saved.revision,
          changedByUserId: ctx.user.id,
          changeReason: "تعديل محتوى البرقية",
          snapshot: saved,
        });
        await audit(ctx, scope, {
          action: "telegram.update",
          entityType: "telegram",
          entityId: saved.id,
          beforeState: existing,
          afterState: saved,
        });
        return saved;
      } catch (error) {
        mapError(error);
      }
    }),

  transition: authenticatedProcedure
    .input(
      z.object({
        id: idSchema,
        toStatus: z.enum(TELEGRAM_STATUSES),
        reason: z.string().trim().max(2000).nullable().optional(),
        expectedRevision: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const scope = await resolveTelegramScope(ctx.user);
        const existing = await requireTelegram(input.id, scope);
        assertTelegramActionable(scope, existing);
        const saved = await transitionTelegram({
          telegramId: input.id,
          actorUserId: ctx.user.id,
          toStatus: input.toStatus,
          reason: input.reason ?? null,
          expectedRevision: input.expectedRevision ?? existing.revision,
          actorName: actorName(scope, ctx.user.name),
        });
        await audit(ctx, scope, {
          action: "telegram.status.transition",
          entityType: "telegram",
          entityId: saved.id,
          metadata: {
            fromStatus: existing.status,
            toStatus: input.toStatus,
            reason: input.reason ?? null,
          },
          beforeState: { status: existing.status },
          afterState: { status: saved.status },
        });
        if (input.toStatus === "submitted") {
          await notifyOrganization({
            organizationId: scope.organizationId,
            type: "telegram.submitted",
            title: "برقية بانتظار المراجعة",
            body: `البرقية ${saved.serialCode} أُرسلت للمراجعة.`,
            telegramId: Number(saved.id),
            excludeUserId: ctx.user.id,
          }).catch(() => undefined);
        }
        return saved;
      } catch (error) {
        mapError(error);
      }
    }),

  delete: authenticatedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        const scope = await resolveTelegramScope(ctx.user);
        const existing = await requireTelegram(input.id, scope);
        if (
          !scope.canAdministrate &&
          existing.createdByUserId !== ctx.user.id
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "لا تملك صلاحية حذف هذه البرقية.",
          });
        }
        if (!isDeletableTelegramStatus(existing.status)) {
          throw new TelegramValidationError(
            "لا يمكن حذف برقية قيد التنفيذ. أرشفها أولاً أو أعدها لمسودة."
          );
        }
        const { storageKeys } = await deleteTelegramPermanently(input.id);
        const storage = getStorageProvider();
        for (const key of storageKeys) {
          await storage.remove?.(key).catch(() => undefined);
        }
        await audit(ctx, scope, {
          action: "telegram.delete",
          entityType: "telegram",
          entityId: existing.id,
          beforeState: existing,
        });
        return { success: true as const };
      } catch (error) {
        mapError(error);
      }
    }),

  versions: authenticatedProcedure
    .input(z.object({ telegramId: idSchema }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      await requireTelegram(input.telegramId, scope);
      return listTelegramVersions(input.telegramId);
    }),

  actions: authenticatedProcedure
    .input(z.object({ telegramId: idSchema }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      await requireTelegram(input.telegramId, scope);
      return listTelegramActions(input.telegramId);
    }),

  attachments: authenticatedProcedure
    .input(z.object({ telegramId: idSchema }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      await requireTelegram(input.telegramId, scope);
      return listTelegramAttachments(input.telegramId);
    }),

  uploadAttachment: authenticatedProcedure
    .input(
      z.object({
        telegramId: idSchema,
        fileName: z.string().trim().min(1).max(180),
        contentType: z.string().trim().min(3).max(120),
        base64: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const scope = await resolveTelegramScope(ctx.user);
        const telegram = await requireTelegram(input.telegramId, scope);
        assertTelegramActionable(scope, telegram);
        const contentType = input.contentType
          .split(";")[0]
          .trim()
          .toLowerCase();
        if (!ALLOWED_ATTACHMENT_TYPES.has(contentType)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "نوع الملف غير مسموح للمرفقات.",
          });
        }
        const bytes = Buffer.from(input.base64, "base64");
        if (bytes.length === 0 || bytes.length > MAX_ATTACHMENT_BYTES) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "حجم المرفق يجب أن يكون بين 1 بايت و10 ميغابايت.",
          });
        }
        const safeName = input.fileName.replace(/[^\p{L}\p{N}._-]+/gu, "_");
        const storageKey = `telegrams/${input.telegramId}/${randomUUID()}-${safeName}`;
        await getStorageProvider().upload(storageKey, bytes, {
          contentType,
          cacheControl: "private, max-age=0",
        });
        const attachment = await createTelegramAttachment({
          telegramId: input.telegramId,
          storageKey,
          storageOrganizationId: scope.organizationId,
          originalName: input.fileName,
          mimeType: contentType,
          sizeBytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          uploadedByUserId: ctx.user.id,
          scanStatus: "stored",
        });
        await recordTelegramAction({
          telegramId: input.telegramId,
          actorUserId: ctx.user.id,
          action: "attachment.upload",
          metadata: { fileName: input.fileName, sizeBytes: bytes.length },
        });
        await audit(ctx, scope, {
          action: "telegram.attachment.upload",
          entityType: "telegram_attachment",
          entityId: attachment.id,
          metadata: { telegramId: input.telegramId, fileName: input.fileName },
        });
        return attachment;
      } catch (error) {
        mapError(error);
      }
    }),

  downloadAttachment: authenticatedProcedure
    .input(z.object({ attachmentId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      const attachment = await getTelegramAttachment(input.attachmentId);
      if (!attachment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المرفق غير موجود" });
      }
      await requireTelegram(Number(attachment.telegramId), scope);
      const file = await getStorageProvider().download(attachment.storageKey);
      return {
        fileName: attachment.originalName,
        contentType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        base64: file.body.toString("base64"),
      };
    }),

  nextOutgoingSerial: authenticatedProcedure.query(async ({ ctx }) => {
    const scope = await resolveTelegramScope(ctx.user);
    const settings = await ensureDepartmentSettings(scope.organizationId);
    return {
      number: settings.nextOutgoingSerial,
      serialNumber: settings.nextOutgoingSerial,
      serialCode: buildTelegramSerialCode({
        serialPrefix: settings.serialPrefix,
        date: new Date(),
        serialNumber: settings.nextOutgoingSerial,
        timeZone: settings.timezone,
      }),
    };
  }),

  exportRows: authenticatedProcedure
    .input(filterSchema)
    .query(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      const result = await listTelegrams(scope.organizationIds, {
        ...(input ?? {}),
        page: 1,
        pageSize: 100,
      });
      const settings = await ensureDepartmentSettings(scope.organizationId);
      await audit(ctx, scope, {
        action: "telegram.export.rows",
        entityType: "telegram_collection",
        entityId: String(result.items.length),
        metadata: { rowCount: result.items.length, filters: input ?? {} },
      });
      return result.items.map(item => ({
        ...item,
        direction:
          item.organizationId === item.currentOrganizationId
            ? "outgoing"
            : "incoming",
        timezone: settings.timezone,
      }));
    }),

  exportWorkbook: authenticatedProcedure
    .input(
      z.object({
        rows: z
          .array(
            z.object({
              serial: z.string().max(120),
              time: z.string().max(120),
              sender: z.string().max(255),
              date: z.string().max(120),
              body: z.string().max(20000),
              recipient: z.string().max(255),
              signature: z.string().max(255),
              notes: z.string().max(4000),
              direction: z.enum(["صادر", "وارد"]),
            })
          )
          .min(1)
          .max(1000),
        password: z.string().max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      const base64 = await buildTelegramWorkbook(input);
      await audit(ctx, scope, {
        action: "telegram.export.workbook",
        entityType: "telegram_collection",
        entityId: String(input.rows.length),
        metadata: {
          rowCount: input.rows.length,
          passwordProtected: Boolean(input.password),
        },
      });
      return {
        base64,
        fileName: `سجل-البرقيات-${new Date().toISOString().slice(0, 10)}.xlsx`,
      };
    }),

  importWorkbookPreview: authenticatedProcedure
    .input(
      z.object({
        base64: z.string().min(1).max(22_000_000),
        password: z.string().max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      if (!scope.canAdministrate) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "استيراد ملفات Excel متاح لمدير الجهة فقط.",
        });
      }
      return parseTelegramWorkbookBase64(input.base64, input.password);
    }),

  importPreview: authenticatedProcedure
    .input(z.object({ rows: z.array(importRowSchema).min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      if (!scope.canAdministrate) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "استيراد ملفات Excel متاح لمدير الجهة فقط.",
        });
      }
      const existing = await listTelegrams(scope.organizationIds, {
        page: 1,
        pageSize: 100,
      });
      const keys = new Set<string>();
      for (const item of existing.items) {
        if (item.originalSerial) {
          keys.add(
            makeImportSerialKey(
              item.importDirection ?? "outgoing",
              item.originalSerial
            )
          );
        }
      }
      return input.rows.map((row, index) => {
        const serial = row.originalSerial?.trim() ?? "";
        const direction = getImportDirection(row.sheetName);
        const key = serial ? makeImportSerialKey(direction, serial) : "";
        const duplicate = Boolean(serial) && keys.has(key);
        if (serial) keys.add(key);
        return { index, duplicate };
      });
    }),

  importRows: authenticatedProcedure
    .input(z.object({ rows: z.array(importRowSchema).min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      if (!scope.canAdministrate) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "استيراد ملفات Excel متاح لمدير الجهة فقط.",
        });
      }
      const settings = await ensureDepartmentSettings(scope.organizationId);
      const numberSystem = normalizeNumberSystem(settings.numberSystem);
      const existing = await listTelegrams(scope.organizationIds, {
        page: 1,
        pageSize: 100,
      });
      const serialKeys = new Set<string>();
      for (const item of existing.items) {
        if (item.originalSerial) {
          serialKeys.add(
            makeImportSerialKey(
              item.importDirection ?? "outgoing",
              item.originalSerial
            )
          );
        }
      }

      let created = 0;
      let skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];

      for (let index = 0; index < input.rows.length; index += 1) {
        const row = input.rows[index];
        try {
          const originalSerial = row.originalSerial?.trim() ?? "";
          const direction = getImportDirection(row.sheetName);
          const idempotencyKey = `excel-import:${createHash("sha256")
            .update(
              JSON.stringify({
                organizationId: scope.organizationId,
                sheetName: row.sheetName,
                originalSerial,
                time: row.time,
                date: row.date,
                body: row.body,
                signature: row.signature,
                notes: row.notes,
              })
            )
            .digest("hex")}`;
          const duplicate = await getTelegramByIdempotencyKey(idempotencyKey);
          if (duplicate) {
            skipped += 1;
            continue;
          }
          if (
            originalSerial &&
            serialKeys.has(makeImportSerialKey(direction, originalSerial))
          ) {
            errors.push({
              row: index + 2,
              message: `رقم البرقية الأصلي "${originalSerial}" موجود مسبقًا.`,
            });
            continue;
          }
          const importedDate = parseImportedDate(
            row.date,
            row.time,
            settings.timezone
          );
          if (row.date?.trim() && !importedDate) {
            throw new Error(
              `تعذر قراءة تاريخ البرقية "${row.date}". صحح تنسيق التاريخ ثم أعد الاستيراد.`
            );
          }
          const body = [
            row.body,
            row.signature ? `\nتوقيع السجل الأصلي: ${row.signature}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          const telegram = await createTelegram({
            subject: localizeDigits(
              row.sender?.trim() ||
                `سجل مستورد من Excel رقم ${row.originalSerial || index + 1}`,
              numberSystem
            ),
            recipient: localizeDigits(
              row.recipient?.trim() || "غير محدد في السجل الأصلي",
              numberSystem
            ),
            body: localizeDigits(body, numberSystem),
            classification: "normal" as TelegramClassification,
            priority: "normal" as TelegramPriority,
            category: "administrative" as TelegramCategory,
            idempotencyKey,
            originalSerial: originalSerial || null,
            telegramDate: importedDate ? importedDate.toISOString() : null,
            importNotes: row.notes?.trim() || null,
            importDirection: direction,
            organizationId: scope.organizationId,
            createdByUserId: ctx.user.id,
            creatorName: actorName(scope, ctx.user.name),
            creatorEmail: ctx.user.email,
            creatorBadgeId: ctx.user.badgeNumber,
            creatorIp: null,
            creatorFingerprint: ctx.user.authUserId,
            status: "draft" as TelegramStatus,
          });
          await recordTelegramAction({
            telegramId: Number(telegram.id),
            actorUserId: ctx.user.id,
            action: "telegram.import.excel",
            toStatus: telegram.status,
            metadata: {
              sheetName: row.sheetName,
              originalSerial: row.originalSerial ?? null,
            },
          });
          await recordTelegramVersion({
            telegramId: Number(telegram.id),
            versionNumber: 1,
            changedByUserId: ctx.user.id,
            changeReason: "استيراد السجل من ملف Excel",
            snapshot: telegram,
          });
          created += 1;
          serialKeys.add(makeImportSerialKey(direction, originalSerial));
          if (telegram.organizationSerialCode) {
            serialKeys.add(
              makeImportSerialKey(direction, telegram.organizationSerialCode)
            );
          }
        } catch (error) {
          errors.push({
            row: index + 2,
            message:
              error instanceof Error ? error.message : "تعذر استيراد الصف",
          });
        }
      }

      await audit(ctx, scope, {
        action: "telegram.import.excel",
        entityType: "telegram_collection",
        entityId: String(created),
        metadata: { created, skipped, errors: errors.length },
      });
      return {
        created,
        skipped,
        errorCount: errors.length,
        errors: errors.slice(0, 25),
      };
    }),

  resolveImportReferences: authenticatedProcedure
    .input(z.object({ notes: z.string().max(4000) }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      const references = Array.from(
        input.notes.matchAll(/ب\s*([وص])\s*([0-9٠-٩۰-۹]+)/g)
      ).slice(0, 20);
      const results = await Promise.all(
        references.map(async match => {
          const marker = match[1] ?? "";
          const rawSerial = match[2] ?? "";
          if (!rawSerial) return null;
          const direction = marker === "و" ? "incoming" : "outgoing";
          const serial = rawSerial
            .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
            .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
          const telegram = await findTelegramByOfficialSerial({
            organizationId: scope.organizationId,
            serial,
            direction,
          });
          if (!telegram) return null;
          return {
            referenceText: match[0],
            serial,
            direction,
            verificationToken: telegram.verificationToken,
          };
        })
      );
      return results.filter(
        (reference): reference is NonNullable<typeof reference> =>
          reference !== null
      );
    }),

  recordDocumentOutput: authenticatedProcedure
    .input(
      z.object({
        id: idSchema,
        operation: z.string().trim().min(2).max(40),
        format: z.string().trim().min(2).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      const telegram = await requireTelegram(input.id, scope);
      const occurredAt = new Date().toISOString();
      await recordTelegramAction({
        telegramId: input.id,
        actorUserId: ctx.user.id,
        action: `document.${input.operation}.${input.format}`,
        metadata: { format: input.format, occurredAt },
      });
      await audit(ctx, scope, {
        action: "telegram.document.output",
        entityType: "telegram",
        entityId: telegram.id,
        metadata: {
          operation: input.operation,
          format: input.format,
          occurredAt,
        },
      });
      return { occurredAt };
    }),

  reissue: authenticatedProcedure
    .input(
      z.object({
        id: idSchema,
        reason: z.string().trim().min(3).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const scope = await resolveTelegramScope(ctx.user);
        const telegram = await requireTelegram(input.id, scope);
        assertTelegramActionable(scope, telegram);
        if (
          !["approved", "completed", "forwarded", "archived"].includes(
            telegram.status
          )
        ) {
          throw new TelegramValidationError(
            "لا يمكن إعادة إصدار برقية لم تُعتمد بعد."
          );
        }
        const versionNumber = telegram.revision + 1;
        await recordTelegramVersion({
          telegramId: input.id,
          versionNumber,
          changedByUserId: ctx.user.id,
          changeReason: input.reason,
          snapshot: { ...telegram, revision: versionNumber },
        });
        await recordTelegramAction({
          telegramId: input.id,
          actorUserId: ctx.user.id,
          action: "telegram.reissue",
          reason: input.reason,
          metadata: { versionNumber },
        });
        await updateTelegramRevision(input.id, versionNumber);
        await audit(ctx, scope, {
          action: "telegram.reissue",
          entityType: "telegram",
          entityId: telegram.id,
          metadata: { versionNumber, reason: input.reason },
        });
        return {
          versionNumber,
          actionLogRecorded: true,
          auditLogRecorded: true,
        };
      } catch (error) {
        mapError(error);
      }
    }),

  incomingRoutes: authenticatedProcedure.query(async ({ ctx }) => {
    const scope = await resolveTelegramScope(ctx.user);
    return listIncomingRoutes(scope.organizationId);
  }),

  route: authenticatedProcedure
    .input(
      z.object({
        id: idSchema,
        toOrganizationId: z.string().min(1).max(36),
        note: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const scope = await resolveTelegramScope(ctx.user);
        const telegram = await requireTelegram(input.id, scope);
        assertTelegramActionable(scope, telegram);
        await routeTelegramTo(
          ctx.user,
          scope,
          telegram,
          input.toOrganizationId,
          {
            note: input.note ?? null,
          }
        );
        const refreshed = await getTelegramById(input.id);
        return refreshed ?? telegram;
      } catch (error) {
        mapError(error);
      }
    }),

  approveRoute: authenticatedProcedure
    .input(
      z.object({
        routeId: z.string().min(1).max(64),
        decision: z.enum(["approved", "rejected"]),
        reason: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      const route = await getTelegramRoute(input.routeId);
      if (!route) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "مسار الإحالة غير موجود",
        });
      }
      if (route.approvalStatus !== "pending") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "هذا المسار لا ينتظر اعتمادًا.",
        });
      }
      const source = await getOrganization(route.fromOrganizationId);
      const parentId = source?.parentOrganizationId ?? null;
      const canApprove =
        scope.isOwner ||
        (parentId !== null && scope.organizationId === parentId) ||
        (parentId === null &&
          scope.organizationId === route.fromOrganizationId);
      if (!canApprove) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "اعتماد الإحالة متاح للسلطة الأعلى المختصة فقط.",
        });
      }
      const now = new Date().toISOString();
      if (input.decision === "approved") {
        await updateTelegramRoute(route.id, {
          approvalStatus: "approved",
          approvedByUserId: ctx.user.id,
          approvedAt: now,
          approvalReason: input.reason ?? null,
          status: "sent",
        });
        await setTelegramStatusAfterRoute(
          Number(route.telegramId),
          "forwarded",
          route.toOrganizationId
        );
        await notifyOrganization({
          organizationId: route.toOrganizationId,
          type: "route.approved",
          title: "برقية واردة",
          body: `وردت برقية جديدة برقم ${route.routeSerialCode ?? route.telegramId}.`,
          telegramId: Number(route.telegramId),
          routeId: Number(route.id),
        }).catch(() => undefined);
      } else {
        await updateTelegramRoute(route.id, {
          approvalStatus: "rejected",
          approvedByUserId: ctx.user.id,
          approvedAt: now,
          approvalReason: input.reason ?? null,
          status: "rejected",
        });
        await transitionTelegram({
          telegramId: Number(route.telegramId),
          actorUserId: ctx.user.id,
          toStatus: "returned",
          reason: input.reason ?? "رفض اعتماد الإحالة",
          actorName: actorName(scope, ctx.user.name),
        });
      }
      return { success: true as const };
    }),

  receiveRoute: authenticatedProcedure
    .input(z.object({ routeId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      const route = await getTelegramRoute(input.routeId);
      if (!route) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "مسار الإحالة غير موجود",
        });
      }
      if (route.toOrganizationId !== scope.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا تملك صلاحية استلام هذه الإحالة.",
        });
      }
      if (route.status === "received") return { success: true as const };
      if (route.status !== "sent" && route.status !== "accepted") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "لا يمكن استلام إحالة غير مرسلة.",
        });
      }
      const incoming = await allocateIncomingSerial(scope.organizationId);
      const now = new Date().toISOString();
      await updateTelegramRoute(route.id, {
        status: "received",
        receivedAt: now,
        incomingSerialNumber: incoming.serialNumber,
        incomingSerialCode: incoming.serialCode,
      });
      await setTelegramStatusAfterRoute(
        Number(route.telegramId),
        "pending",
        scope.organizationId
      );
      await audit(ctx, scope, {
        action: "telegram.route.receive",
        entityType: "telegram_route",
        entityId: route.id,
        metadata: { incomingSerialCode: incoming.serialCode },
      });
      return {
        success: true as const,
        incomingSerialCode: incoming.serialCode,
      };
    }),

  decideRouteAsReceiver: authenticatedProcedure
    .input(
      z.object({
        routeId: z.string().min(1).max(64),
        decision: z.enum(["accepted", "rejected"]),
        reason: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      const route = await getTelegramRoute(input.routeId);
      if (!route) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "مسار الإحالة غير موجود",
        });
      }
      if (route.toOrganizationId !== scope.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "قرار الاستلام متاح للجهة المستلمة فقط.",
        });
      }
      const now = new Date().toISOString();
      if (input.decision === "accepted") {
        await updateTelegramRoute(route.id, {
          receiverDecisionStatus: "accepted",
          receiverDecisionByUserId: ctx.user.id,
          receiverDecisionAt: now,
          receiverDecisionReason: input.reason ?? null,
          status: "accepted",
        });
        await setTelegramStatusAfterRoute(
          Number(route.telegramId),
          "in_progress",
          scope.organizationId
        );
      } else {
        await updateTelegramRoute(route.id, {
          receiverDecisionStatus: "rejected",
          receiverDecisionByUserId: ctx.user.id,
          receiverDecisionAt: now,
          receiverDecisionReason: input.reason ?? null,
          status: "rejected",
        });
        await setTelegramStatusAfterRoute(
          Number(route.telegramId),
          "returned",
          route.fromOrganizationId
        );
        await notifyOrganization({
          organizationId: route.fromOrganizationId,
          type: "route.rejected",
          title: "إحالة مرفوضة",
          body: `أعادت الجهة المستلمة البرقية ${route.routeSerialCode ?? route.telegramId}.`,
          telegramId: Number(route.telegramId),
          routeId: Number(route.id),
        }).catch(() => undefined);
      }
      return { success: true as const };
    }),

  routes: authenticatedProcedure
    .input(z.object({ telegramId: idSchema }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      await requireTelegram(input.telegramId, scope);
      return listTelegramRoutes(input.telegramId);
    }),
});

/** Increments only the revision column without touching content. */
async function updateTelegramRevision(
  telegramId: number,
  revision: number
): Promise<void> {
  await setTelegramRevision(telegramId, revision);
}

type RouteOptions = {
  note: string | null;
  skipStatusCheck?: boolean;
};

async function routeTelegramTo(
  user: { id: number; name: string | null },
  scope: TelegramScope,
  telegram: TelegramRecord,
  toOrganizationId: string,
  options: RouteOptions
): Promise<void> {
  if (telegram.currentOrganizationId !== scope.organizationId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "البرقية ليست في جهة عملك الحالية.",
    });
  }
  if (
    !options.skipStatusCheck &&
    !["draft", "approved", "submitted"].includes(telegram.status)
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "لا يمكن إحالة برقية في حالتها الحالية. اعتمدها أولاً.",
    });
  }
  const targets = await listRoutingTargets(scope.organizationId);
  const target = targets.find(item => item.id === toOrganizationId);
  if (!target) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "الجهة المختارة غير متاحة ضمن مسار العمل المسموح",
    });
  }

  const children = await listOrganizationDescendants(scope.organizationId, {
    activeOnly: true,
  });
  const isDirectChild = children.some(
    item =>
      item.id === toOrganizationId &&
      item.parentOrganizationId === scope.organizationId
  );
  const approvalStatus = isDirectChild ? "not_required" : "pending";
  const settings = await ensureDepartmentSettings(scope.organizationId);
  const routeSerialNumber = settings.nextOutgoingSerial;
  const routeSerialCode = buildTelegramSerialCode({
    serialPrefix: settings.serialPrefix,
    date: new Date(),
    serialNumber: routeSerialNumber,
    timeZone: settings.timezone,
  });

  const route = await createTelegramRoute({
    telegramId: Number(telegram.id),
    fromOrganizationId: scope.organizationId,
    toOrganizationId,
    forwardedByUserId: user.id,
    approvalStatus,
    status: approvalStatus === "not_required" ? "sent" : "sent",
    routeSerialNumber,
    routeSerialCode,
    note: options.note,
  });

  if (approvalStatus === "not_required") {
    await setTelegramStatusAfterRoute(
      Number(telegram.id),
      "forwarded",
      toOrganizationId
    );
    await notifyOrganization({
      organizationId: toOrganizationId,
      type: "route.approved",
      title: "برقية واردة",
      body: `وردت برقية جديدة برقم ${routeSerialCode}.`,
      telegramId: Number(telegram.id),
      routeId: Number(route.id),
    }).catch(() => undefined);
    return;
  }

  await transitionTelegram({
    telegramId: Number(telegram.id),
    actorUserId: user.id,
    toStatus: "submitted",
    reason: "إحالة تحتاج اعتماد السلطة الأعلى",
    actorName: user.name ?? "مستخدم",
  });
  const source = await getOrganization(scope.organizationId);
  if (source?.parentOrganizationId) {
    await notifyOrganization({
      organizationId: source.parentOrganizationId,
      type: "route.requested",
      title: "طلب إحالة بانتظار الاعتماد",
      body: `البرقية ${telegram.serialCode} تحتاج موافقة قبل انتقالها.`,
      telegramId: Number(telegram.id),
      routeId: Number(route.id),
    }).catch(() => undefined);
  }
}
