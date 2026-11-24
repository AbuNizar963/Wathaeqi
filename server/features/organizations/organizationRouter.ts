import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { MAX_ORGANIZATION_LOGO_BYTES } from "@shared/organizationLogoLimits";
import { authenticatedProcedure, router } from "../../_core/ownerTrpc";
import { isPlatformOwner } from "../../ownerAccess";
import { resolveOrganizationScope } from "./organizationAccess";
import {
  buildOrganizationTree,
  getOrganization,
  getOrganizationLogoDataUrl,
  getOrganizationLogoUrl,
  listOrganizations,
  renameOrganization,
  saveOrganizationLogo,
} from "./organizationService";
import { createManagedUser, listManagedUsers } from "../users/userService";
import {
  ensureDepartmentSettings,
  updateDepartmentSettings,
} from "../settings/departmentSettingsRepository";

const organizationInput = z.object({
  name: z.string().trim().min(2).max(255),
  code: z.string().trim().min(1).max(32),
  type: z.enum([
    "ministry",
    "general_command",
    "directorate",
    "department",
    "station",
    "unit",
  ]),
  parentOrganizationId: z.string().max(36).nullable(),
});

const legacySettingsInput = z.object({
  organizationId: z.string().min(1).max(36),
  departmentName: z.string().trim().min(2).max(255),
  unitName: z.string().trim().max(255),
  unitChiefRank: z.string().trim().max(120),
  unitChiefName: z.string().trim().max(255),
  serialPrefix: z.string().trim().min(1).max(24),
  incomingSerialPrefix: z.string().trim().min(1).max(24),
  serialStart: z.number().int().min(1).max(999999999),
  incomingSerialStart: z.number().int().min(1).max(999999999),
  timezone: z.string().trim().min(3).max(64),
  dateFormat: z.string().trim().min(4).max(32),
  timeFormat: z.enum(["12", "24"]),
  numberSystem: z.enum(["latin", "arabic"]),
  logoUrl: z.string().max(1024).nullable(),
});

async function requireOwner(ctx: {
  user: Parameters<typeof isPlatformOwner>[0];
}) {
  if (!isPlatformOwner(ctx.user)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "هذه العملية متاحة لمالك المنصة فقط.",
    });
  }
}

export const organizationRouter = router({
  context: authenticatedProcedure.query(async ({ ctx }) => {
    const scope = await resolveOrganizationScope(ctx.user);
    const organization = await getOrganization(scope.organizationId);
    return {
      organizationId: scope.organizationId,
      organizationName: organization?.name ?? "وثائقي",
      role: scope.role,
      isActive: true,
      isOwner: scope.isOwner,
      canManage: scope.canManage,
      canAdministrate: scope.canAdministrate,
    };
  }),

  renameCurrent: authenticatedProcedure
    .input(z.object({ name: z.string().trim().min(2).max(255) }).strict())
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveOrganizationScope(ctx.user);
      if (!scope.canAdministrate) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "تغيير اسم الجهة متاح لمدير الجهة أو مالك المنصة فقط.",
        });
      }
      const organization = await renameOrganization(
        scope.organizationId,
        input.name
      );
      return {
        organizationId: organization.id,
        organizationName: organization.name,
      };
    }),

  list: authenticatedProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await resolveOrganizationScope(ctx.user);
      const organizations = await listOrganizations(
        Boolean(input?.includeInactive) && scope.isOwner
      );
      if (scope.isOwner) return organizations;
      const allowed = new Set(scope.organizationIds ?? [scope.organizationId]);
      return organizations.filter(item => allowed.has(item.id));
    }),

  tree: authenticatedProcedure.query(async ({ ctx }) => {
    const scope = await resolveOrganizationScope(ctx.user);
    const organizations = await listOrganizations(false);
    const filtered = scope.organizationIds
      ? organizations.filter(item => scope.organizationIds?.includes(item.id))
      : organizations;
    return buildOrganizationTree(filtered);
  }),

  routingTargets: authenticatedProcedure.query(() => []),

  descendants: authenticatedProcedure.query(() => []),

  get: authenticatedProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveOrganizationScope(ctx.user);
      if (!scope.isOwner && !(scope.organizationIds ?? []).includes(input.id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الجهة غير موجودة" });
      }
      const organization = await getOrganization(input.id);
      if (!organization) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الجهة غير موجودة" });
      }
      return organization;
    }),

  create: authenticatedProcedure
    .input(organizationInput)
    .mutation(() => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "النظام يعمل بجهة واحدة؛ إدارة الهيكل التنظيمي معطّلة.",
      });
    }),
  update: authenticatedProcedure
    .input(organizationInput.extend({ id: z.string().min(1).max(36) }))
    .mutation(() => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "النظام يعمل بجهة واحدة؛ إدارة الهيكل التنظيمي معطّلة.",
      });
    }),
  setActive: authenticatedProcedure
    .input(z.object({ id: z.string().min(1).max(36), isActive: z.boolean() }))
    .mutation(() => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "النظام يعمل بجهة واحدة؛ إدارة الهيكل التنظيمي معطّلة.",
      });
    }),
  uploadLogo: authenticatedProcedure
    .input(
      z.object({
        id: z.string().min(1).max(36),
        contentType: z.enum(["image/png", "image/jpeg"]),
        base64: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveOrganizationScope(ctx.user);
      if (
        !scope.canAdministrate ||
        (!scope.isOwner && scope.organizationId !== input.id)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "رفع شعار الجهة متاح لمدير الجهة فقط.",
        });
      }
      const bytes = Buffer.from(input.base64, "base64");
      if (bytes.length === 0 || bytes.length > MAX_ORGANIZATION_LOGO_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "حجم الشعار يجب أن يكون بين 1 بايت و2.5 ميغابايت.",
        });
      }
      const logoKey = await saveOrganizationLogo(
        input.id,
        bytes,
        input.contentType
      );
      return { logoKey };
    }),

  logo: authenticatedProcedure
    .input(
      z
        .object({
          id: z.string().min(1).max(36).optional(),
          organizationId: z.string().min(1).max(36).optional(),
        })
        .refine(value => Boolean(value.id ?? value.organizationId), {
          message: "معرّف الجهة مطلوب",
        })
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveOrganizationScope(ctx.user);
      const organizationId = (input.id ?? input.organizationId) as string;
      if (
        !scope.isOwner &&
        !(scope.organizationIds ?? []).includes(organizationId)
      ) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الجهة غير موجودة" });
      }
      const [dataUrl, logoUrl] = await Promise.all([
        getOrganizationLogoDataUrl(organizationId),
        getOrganizationLogoUrl(organizationId),
      ]);
      return { organizationId, dataUrl, logoUrl };
    }),

  logoForExport: authenticatedProcedure
    .input(z.object({ organizationId: z.string().min(1).max(36) }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveOrganizationScope(ctx.user);
      if (
        !scope.isOwner &&
        !(scope.organizationIds ?? []).includes(input.organizationId)
      ) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الجهة غير موجودة" });
      }
      return {
        dataUrl: await getOrganizationLogoDataUrl(input.organizationId),
      };
    }),

  all: authenticatedProcedure.query(async ({ ctx }) => {
    const scope = await resolveOrganizationScope(ctx.user);
    const organizations = await listOrganizations(scope.isOwner);
    if (scope.isOwner) return organizations;
    const allowed = new Set(scope.organizationIds ?? [scope.organizationId]);
    return organizations.filter(item => allowed.has(item.id));
  }),

  accounts: authenticatedProcedure
    .input(z.object({ organizationId: z.string().min(1).max(36) }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveOrganizationScope(ctx.user);
      if (
        !scope.isOwner &&
        !(scope.organizationIds ?? []).includes(input.organizationId)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا تملك صلاحية عرض حسابات هذه الجهة",
        });
      }
      const users = await listManagedUsers();
      return users.filter(user => user.organizationId === input.organizationId);
    }),

  allAccounts: authenticatedProcedure.query(async ({ ctx }) => {
    const scope = await resolveOrganizationScope(ctx.user);
    const users = await listManagedUsers();
    const allowed = scope.organizationIds
      ? new Set(scope.organizationIds)
      : null;
    return users.filter(user => !allowed || allowed.has(user.organizationId));
  }),

  provisionAccount: authenticatedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1).max(36),
        name: z.string().trim().min(2).max(255),
        username: z
          .string()
          .trim()
          .min(3)
          .max(64)
          .regex(/^[A-Za-z0-9._-]+$/),
        email: z.string().trim().email().max(320),
        password: z.string().min(10).max(128),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireOwner(ctx);
      return createManagedUser({
        ...input,
        role: "user",
        membershipRole: "member",
        rank: null,
        badgeNumber: null,
        phone: null,
        unit: null,
        mustChangePassword: true,
      });
    }),

  delete: authenticatedProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .mutation(() => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "النظام يعمل بجهة واحدة؛ إدارة الهيكل التنظيمي معطّلة.",
      });
    }),
  purgeArchived: authenticatedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1).max(36),
        confirmation: z.string().optional(),
      })
    )
    .mutation(async ({ ctx }) => {
      requireOwner(ctx);
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "الحذف النهائي للجهات غير مدعوم بأمان في مخزن Appwrite الحالي؛ استخدم التعطيل والأرشفة.",
      });
    }),

  selectWorkplace: authenticatedProcedure
    .input(z.object({ organizationId: z.string().min(1).max(36) }))
    .mutation(
      async (
        _opts
      ): Promise<{ organizationId: string; organizationName: string }> => {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "تبديل جهة العمل غير مدعوم؛ جهة العمل الحالية تُحدد من عضوية Appwrite النشطة.",
        });
      }
    ),

  settings: router({
    get: authenticatedProcedure
      .input(z.object({ organizationId: z.string().min(1).max(36) }))
      .query(async ({ ctx, input }) => {
        requireOwner(ctx);
        const organization = await getOrganization(input.organizationId);
        if (!organization)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "الجهة غير موجودة",
          });
        return {
          ...(await ensureDepartmentSettings(input.organizationId)),
          organizationId: input.organizationId,
          organizationName: organization.name,
          settingsExists: true,
        };
      }),
    update: authenticatedProcedure
      .input(legacySettingsInput)
      .mutation(async ({ ctx, input }) => {
        requireOwner(ctx);
        const organization = await getOrganization(input.organizationId);
        if (!organization)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "الجهة غير موجودة",
          });
        const current = await ensureDepartmentSettings(input.organizationId);
        await updateDepartmentSettings(
          input.organizationId,
          {
            ...current,
            ...input,
            serialPrefix: input.serialPrefix.toUpperCase(),
            incomingSerialPrefix: input.incomingSerialPrefix.toUpperCase(),
          },
          ctx.user.id
        );
        return {
          ...(await ensureDepartmentSettings(input.organizationId)),
          organizationId: input.organizationId,
          organizationName: organization.name,
          settingsExists: true,
        };
      }),
  }),

  routingDirectory: authenticatedProcedure.query(() => []),


});
