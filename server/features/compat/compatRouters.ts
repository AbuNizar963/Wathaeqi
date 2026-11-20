import { Query } from "node-appwrite";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authenticatedProcedure, router } from "../../_core/ownerTrpc";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";
import { resolveTelegramScope } from "../telegrams/telegramAccess";
import {
  ensureDepartmentSettings,
  listTelegrams,
  updateDepartmentSettings,
} from "../telegrams/telegramRepository";
import {
  getOrganization,
  getOrganizationLogoUrl,
  listOrganizations,
} from "../organizations/organizationService";
import {
  TELEGRAM_STATUSES,
  type TelegramStatus,
} from "../../../shared/telegrams";

type AppwriteRow = Record<string, unknown> & { $id: string };

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

const optionalText = (max: number) => z.string().trim().max(max).optional();

/** Mobile settings screen sends a partial payload, so every field is optional. */
const settingsPatchSchema = z.object({
  organizationId: z.string().trim().min(1).max(36).optional(),
  departmentName: z.string().trim().min(2).max(255).optional(),
  unitName: optionalText(255),
  unitChiefRank: optionalText(120),
  unitChiefName: optionalText(255),
  serialPrefix: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(/^[A-Za-z0-9-]+$/)
    .optional(),
  incomingSerialPrefix: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(/^[A-Za-z0-9-]+$/)
    .optional(),
  serialStart: z.number().int().min(1).max(999999999).optional(),
  incomingSerialStart: z.number().int().min(1).max(999999999).optional(),
  nextOutgoingSerial: z.number().int().min(1).max(999999999).optional(),
  nextIncomingSerial: z.number().int().min(1).max(999999999).optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
  dateFormat: z.string().trim().min(4).max(32).optional(),
  timeFormat: z.enum(["12", "24"]).optional(),
  numberSystem: z.enum(["latin", "arabic"]).optional(),
  showVerificationQr: z.boolean().optional(),
  logoUrl: z.string().max(1024).nullable().optional(),
});

async function settingsPayload(organizationId: string) {
  const [settings, organization, logoUrl] = await Promise.all([
    ensureDepartmentSettings(organizationId),
    getOrganization(organizationId),
    getOrganizationLogoUrl(organizationId).catch(() => null),
  ]);
  return {
    ...settings,
    organizationId,
    organizationName: organization?.name ?? null,
    logoUrl: logoUrl ?? settings.logoUrl,
  };
}

export const settingsCompatRouter = router({
  get: authenticatedProcedure.query(async ({ ctx }) => {
    const scope = await resolveTelegramScope(ctx.user);
    return settingsPayload(scope.organizationId);
  }),

  update: authenticatedProcedure
    .input(settingsPatchSchema)
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      const organizationId = input.organizationId ?? scope.organizationId;
      if (
        !scope.isOwner &&
        !(scope.organizationIds ?? []).includes(organizationId)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا تملك صلاحية تعديل إعدادات هذه الجهة.",
        });
      }
      if (!scope.canAdministrate) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "تعديل إعدادات القسم متاح لمدير الجهة فقط.",
        });
      }
      const current = await ensureDepartmentSettings(organizationId);
      if (
        (input.nextOutgoingSerial !== undefined &&
          input.nextOutgoingSerial < current.nextOutgoingSerial) ||
        (input.nextIncomingSerial !== undefined &&
          input.nextIncomingSerial < current.nextIncomingSerial)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "لا يمكن تقليل العدّاد الحالي لأنه يعيد استخدام أرقام برقيات صادرة.",
        });
      }
      await updateDepartmentSettings(
        organizationId,
        {
          departmentName: input.departmentName ?? current.departmentName,
          unitName: input.unitName ?? current.unitName,
          unitChiefRank: input.unitChiefRank ?? current.unitChiefRank,
          unitChiefName: input.unitChiefName ?? current.unitChiefName,
          serialPrefix: (
            input.serialPrefix ?? current.serialPrefix
          ).toUpperCase(),
          incomingSerialPrefix: (
            input.incomingSerialPrefix ?? current.incomingSerialPrefix
          ).toUpperCase(),
          serialStart: input.serialStart ?? current.serialStart,
          incomingSerialStart:
            input.incomingSerialStart ?? current.incomingSerialStart,
          nextOutgoingSerial:
            input.nextOutgoingSerial ?? current.nextOutgoingSerial,
          nextIncomingSerial:
            input.nextIncomingSerial ?? current.nextIncomingSerial,
          timezone: input.timezone ?? current.timezone,
          dateFormat: input.dateFormat ?? current.dateFormat,
          timeFormat: input.timeFormat ?? current.timeFormat,
          numberSystem: input.numberSystem ?? current.numberSystem,
          showVerificationQr:
            input.showVerificationQr ?? current.showVerificationQr,
          logoUrl:
            input.logoUrl === undefined ? current.logoUrl : input.logoUrl,
        },
        ctx.user.id
      );
      return settingsPayload(organizationId);
    }),
});

export const reportsCompatRouter = router({
  telegrams: authenticatedProcedure
    .input(
      z
        .object({
          search: z.string().trim().max(120).optional(),
          status: z.string().trim().max(24).optional(),
          from: z.string().max(64).optional(),
          to: z.string().max(64).optional(),
          page: z.number().int().min(1).max(100000).default(1),
          pageSize: z.number().int().min(1).max(100).default(25),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      const status =
        input?.status &&
        (TELEGRAM_STATUSES as readonly string[]).includes(input.status)
          ? (input.status as TelegramStatus)
          : undefined;
      const toIso = (value: string | undefined, endOfDay: boolean) => {
        if (!value) return undefined;
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return undefined;
        if (endOfDay) date.setHours(23, 59, 59, 999);
        return date.toISOString();
      };
      const result = await listTelegrams(scope.organizationIds, {
        search: input?.search,
        status,
        from: toIso(input?.from, false),
        to: toIso(input?.to, true),
        page: input?.page ?? 1,
        pageSize: input?.pageSize ?? 25,
      });
      return {
        total: result.total,
        items: result.items,
        pending:
          (result.stats.byStatus.pending ?? 0) +
          (result.stats.byStatus.submitted ?? 0) +
          (result.stats.byStatus.in_review ?? 0),
        completed:
          (result.stats.byStatus.completed ?? 0) +
          (result.stats.byStatus.resolved ?? 0),
        stats: result.stats,
        page: result.page,
        pageSize: result.pageSize,
        hasNext: result.hasNext,
      };
    }),
});

function startOfDaysAgo(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - Math.max(0, days - 1));
  return date;
}

export const ownerDashboardCompatRouter = router({
  summary: authenticatedProcedure
    .input(
      z.object({ days: z.number().int().min(1).max(90).default(14) }).optional()
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      if (!scope.isOwner) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "مركز قيادة المنصة متاح لمالك المنصة فقط.",
        });
      }
      const days = input?.days ?? 14;
      const from = startOfDaysAgo(days).toISOString();
      const tables = getAppwriteTablesDB();
      const databaseId = getAppwriteDatabaseId();
      const [auditResult, organizations, telegrams] = await Promise.all([
        tables.listRows({
          databaseId,
          tableId: "audit_logs",
          queries: [
            Query.greaterThanEqual("createdAt", from),
            Query.orderDesc("createdAt"),
            Query.limit(1000),
          ],
          total: true,
        }),
        listOrganizations(false),
        listTelegrams(null, { page: 1, pageSize: 100 }),
      ]);
      const auditRows = auditResult.rows as AppwriteRow[];
      const organizationNames = new Map(
        organizations.map(organization => [organization.id, organization.name])
      );

      const byDay = new Map<string, number>();
      const byCategory = new Map<string, number>();
      const byOrganization = new Map<string, number>();
      let sensitiveOperations = 0;
      for (const row of auditRows) {
        const createdAt = isoOrNull(row.createdAt);
        const day = createdAt?.slice(0, 10) ?? "غير محدد";
        byDay.set(day, (byDay.get(day) ?? 0) + 1);
        const entityType = asString(row.entityType, "other");
        byCategory.set(entityType, (byCategory.get(entityType) ?? 0) + 1);
        const organizationId = asNullableString(row.organizationId);
        if (organizationId) {
          byOrganization.set(
            organizationId,
            (byOrganization.get(organizationId) ?? 0) + 1
          );
        }
        const action = asString(row.action);
        if (/delete|disable|reject|secret|purge/.test(action)) {
          sensitiveOperations += 1;
        }
      }

      const activeUsers = await tables.listRows({
        databaseId,
        tableId: "users",
        queries: [Query.equal("isActive", true), Query.limit(1)],
        total: true,
      });

      return {
        totalOperations: auditResult.total,
        sensitiveOperations,
        activeOrganizations: organizations.filter(item => item.isActive).length,
        activeUsers: activeUsers.total,
        totalTelegrams: telegrams.total,
        operationsByDay: [...byDay.entries()]
          .map(([date, count]) => ({ date, count }))
          .sort((left, right) => left.date.localeCompare(right.date)),
        operationsByCategory: [...byCategory.entries()]
          .map(([category, count]) => ({ category, label: category, count }))
          .sort((left, right) => right.count - left.count),
        topOrganizations: [...byOrganization.entries()]
          .map(([organizationId, count]) => ({
            organizationId,
            name: organizationNames.get(organizationId) ?? organizationId,
            organizationName:
              organizationNames.get(organizationId) ?? organizationId,
            count,
          }))
          .sort((left, right) => right.count - left.count)
          .slice(0, 8),
        recentOperations: auditRows.slice(0, 10).map(row => ({
          id: row.$id,
          action: asString(row.action),
          actorName: asNullableString(row.actorName),
          entityType: asString(row.entityType),
          organizationId: asNullableString(row.organizationId),
          createdAt: isoOrNull(row.createdAt),
        })),
        generatedAt: new Date().toISOString(),
      };
    }),
});
