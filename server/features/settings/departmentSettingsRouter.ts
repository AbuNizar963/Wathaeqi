import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authenticatedProcedure, router } from "../../_core/ownerTrpc";
import { getRequestAuditContext } from "../../auditContext";
import { writeAuditLog } from "../audit/appwriteAuditRepository";
import { resolveOrganizationScope } from "../organizations/organizationAccess";
import {
  DEPARTMENT_SETTINGS_DEFAULTS,
  DEPARTMENT_TIMEZONES,
  ensureDepartmentSettings,
  updateDepartmentSettings,
} from "./departmentSettingsRepository";
import {
  getOrganization,
  getOrganizationLogoDataUrl,
} from "../organizations/organizationService";

const settingsInputSchema = z.object({
  departmentName: z.string().trim().min(2).max(255),
  unitName: z.string().trim().min(1).max(255),
  unitChiefRank: z.string().trim().min(1).max(120),
  unitChiefName: z.string().trim().min(1).max(255),
  serialPrefix: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(
      /^[A-Za-z0-9-]+$/,
      "بادئة التسلسل تقبل الأحرف اللاتينية والأرقام فقط"
    ),
  incomingSerialPrefix: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(
      /^[A-Za-z0-9-]+$/,
      "بادئة الوارد تقبل الأحرف اللاتينية والأرقام فقط"
    ),
  serialStart: z.number().int().min(1).max(999999999),
  incomingSerialStart: z.number().int().min(1).max(999999999),
  nextOutgoingSerial: z.number().int().min(1).max(999999999),
  nextIncomingSerial: z.number().int().min(1).max(999999999),
  timezone: z.enum(DEPARTMENT_TIMEZONES),
  dateFormat: z.string().trim().min(4).max(32),
  timeFormat: z.enum(["12", "24"]),
  numberSystem: z.enum(["latin", "arabic"]),
  showVerificationQr: z.boolean(),
  logoUrl: z.string().max(1024).nullable(),
});

export const departmentSettingsRouter = router({
  get: authenticatedProcedure.query(async ({ ctx }) => {
    const scope = await resolveOrganizationScope(ctx.user);
    const [settings, organization, logoDataUrl] = await Promise.all([
      ensureDepartmentSettings(scope.organizationId),
      getOrganization(scope.organizationId),
      getOrganizationLogoDataUrl(scope.organizationId).catch(() => null),
    ]);
    return {
      ...settings,
      organizationName: organization?.name ?? null,
      organizationCode: organization?.code ?? null,
      logoDataUrl,
      defaults: DEPARTMENT_SETTINGS_DEFAULTS,
      canEdit: scope.canAdministrate,
    };
  }),

  update: authenticatedProcedure
    .input(settingsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveOrganizationScope(ctx.user);
      if (!scope.canAdministrate) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "تعديل إعدادات القسم متاح لمدير الجهة فقط.",
        });
      }
      const before = await ensureDepartmentSettings(scope.organizationId);
      if (
        input.nextOutgoingSerial < before.nextOutgoingSerial ||
        input.nextIncomingSerial < before.nextIncomingSerial
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "لا يمكن تقليل العدّاد الحالي لأنه يعيد استخدام أرقام وثائق صادرة. يمكنك زيادة الرقم فقط.",
        });
      }
      const saved = await updateDepartmentSettings(
        scope.organizationId,
        {
          departmentName: input.departmentName,
          unitName: input.unitName,
          unitChiefRank: input.unitChiefRank,
          unitChiefName: input.unitChiefName,
          serialPrefix: input.serialPrefix.toUpperCase(),
          incomingSerialPrefix: input.incomingSerialPrefix.toUpperCase(),
          serialStart: input.serialStart,
          incomingSerialStart: input.incomingSerialStart,
          nextOutgoingSerial: input.nextOutgoingSerial,
          nextIncomingSerial: input.nextIncomingSerial,
          timezone: input.timezone,
          dateFormat: input.dateFormat,
          timeFormat: input.timeFormat,
          numberSystem: input.numberSystem,
          showVerificationQr: input.showVerificationQr,
          logoUrl: input.logoUrl,
        },
        ctx.user.id
      );
      try {
        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "مستخدم",
          action: "department_settings.update",
          entityType: "department_settings",
          entityId: scope.organizationId,
          organizationId: scope.organizationId,
          beforeState: before,
          afterState: saved,
        });
      } catch (error) {
        console.error("Department settings audit failed", error);
      }
      return saved;
    }),
});
