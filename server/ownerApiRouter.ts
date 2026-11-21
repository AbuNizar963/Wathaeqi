import { timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicUser } from "./_core/auth";
import {
  AppwriteInvalidCurrentPasswordError,
  AppwritePasswordResetRequiredError,
  authenticateAppwriteUser,
  changeAppwritePassword,
  clearAppwriteSessionCookie,
  deleteCurrentAppwriteSession,
  dismissAppwritePasswordChange,
  setAppwriteSessionCookie,
  updateAppwriteUserProfile,
} from "./_core/appwriteAuth";
import {
  clearSuccessfulLoginRateLimit,
  enforceLoginRateLimit,
} from "./_core/loginRateLimit";
import { ENV } from "./_core/env";
import {
  createInitialOwnerProfile,
  isInitialOwnerSetupAvailable,
} from "./features/auth/ownerBootstrap";
import {
  authenticatedProcedure,
  platformOwnerProcedure,
  publicProcedure,
  router,
} from "./_core/ownerTrpc";
import { getRequestAuditContext } from "./auditContext";
import { writeAuditLog } from "./features/audit/appwriteAuditRepository";
import {
  getPlatformDocumentSettings,
  updatePlatformDocumentSettings,
} from "./features/platform-settings/platformDocumentSettingsRepository";
import { isPlatformOwner } from "./ownerAccess";
import { documentStudioRouter } from "./features/document-studio/documentStudioRouter";
import { workspaceRouter } from "./features/workspace/workspaceRouter";
import {
  getOrganizationById,
  getUserOrganizationMembership,
} from "./features/organizations/appwriteOwnerOrganizationRepository";
import {
  HEX_COLOR_PATTERN,
  MAX_HEADER_LOGO_SIZE,
  MAX_HEADER_PADDING_MM,
  MAX_PAGE_MARGIN_MM,
  MIN_DIVIDER_WIDTH_PT,
  MAX_DIVIDER_WIDTH_PT,
  MIN_FRAME_WIDTH_PT,
  MAX_FRAME_WIDTH_PT,
  MAX_WATERMARK_OPACITY_PERCENT,
  MIN_HEADER_LOGO_SIZE,
} from "../shared/features/platform-settings/platformDocumentSettings";

async function authenticatePlatformUserForLogin(
  username: string,
  password: string
) {
  try {
    const authenticated = await authenticateAppwriteUser(username, password);
    return authenticated;
  } catch (error) {
    if (error instanceof AppwritePasswordResetRequiredError) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "يجب إعادة تعيين كلمة المرور قبل تسجيل الدخول",
      });
    }
    throw error;
  }
}

const ownerAuthRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user ?? null),

  ownerSetupStatus: publicProcedure.query(async () => ({
    available: await isInitialOwnerSetupAvailable(),
  })),

  createInitialOwner: publicProcedure
    .input(
      z.object({
        setupSecret: z.string().min(32).max(256),
        username: z
          .string()
          .trim()
          .min(3)
          .max(120)
          .regex(/^[a-zA-Z0-9._-]+$/),
        password: z.string().min(12).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await enforceLoginRateLimit(
        ctx.req,
        ctx.res,
        `owner-setup:${input.username}`
      );

      const configuredSecret = ENV.ownerSetupSecret;
      const suppliedSecret = Buffer.from(input.setupSecret, "utf8");
      const expectedSecret = Buffer.from(configuredSecret, "utf8");
      if (
        expectedSecret.length < 32 ||
        suppliedSecret.length !== expectedSecret.length ||
        !timingSafeEqual(suppliedSecret, expectedSecret)
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "رمز الإعداد غير صحيح",
        });
      }

      if (!(await isInitialOwnerSetupAvailable())) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "إعادة تعيين كلمة مرور المالك غير متاحة",
        });
      }

      const recovered = await createInitialOwnerProfile(input);
      await setAppwriteSessionCookie(
        ctx.res,
        recovered.session,
        recovered.user
      );
      return publicUser(recovered.user);
    }),

  login: publicProcedure
    .input(
      z.object({
        username: z.string().trim().min(3).max(120),
        password: z.string().min(1).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = await enforceLoginRateLimit(
        ctx.req,
        ctx.res,
        input.username
      );
      const authenticated = await authenticatePlatformUserForLogin(
        input.username.trim(),
        input.password
      );

      if (!authenticated) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "اسم المستخدم أو كلمة المرور غير صحيحة",
        });
      }

      await setAppwriteSessionCookie(
        ctx.res,
        authenticated.session,
        authenticated.user
      );
      await clearSuccessfulLoginRateLimit(rateLimitKey);
      return publicUser(authenticated.user);
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    try {
      await deleteCurrentAppwriteSession(ctx.req);
    } catch {
      // An expired or revoked server session must not block local logout.
    } finally {
      clearAppwriteSessionCookie(ctx.res);
    }
    return { success: true } as const;
  }),
});

const ownerProfileRouter = router({
  get: authenticatedProcedure.query(({ ctx }) => ctx.user),

  update: authenticatedProcedure
    .input(
      z.object({
        name: z
          .string()
          .trim()
          .min(2, "الاسم يجب أن يتكون من حرفين على الأقل")
          .max(255),
        badgeNumber: z.string().trim().max(80).nullable(),
        phone: z.string().trim().max(32).nullable(),
        rank: z.string().trim().max(120).nullable(),
        unit: z.string().trim().max(255).nullable(),
        bio: z.string().trim().max(1000).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await updateAppwriteUserProfile(ctx.user.id, {
        name: input.name,
        badgeNumber: input.badgeNumber || null,
        phone: input.phone || null,
        rank: input.rank || null,
        unit: input.unit || null,
        bio: input.bio || null,
      });
      return publicUser(updated);
    }),

  changePassword: authenticatedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1).max(256),
        newPassword: z
          .string()
          .min(12, "كلمة المرور الجديدة يجب ألا تقل عن 12 محرفًا")
          .max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.currentPassword === input.newPassword) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "اختر كلمة مرور مختلفة عن الحالية",
        });
      }

      try {
        await changeAppwritePassword(
          ctx.req,
          ctx.res,
          input.currentPassword,
          input.newPassword
        );
      } catch (error) {
        if (error instanceof AppwriteInvalidCurrentPasswordError) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "كلمة المرور الحالية غير صحيحة",
          });
        }
        throw error;
      }

      return { success: true };
    }),

  dismissTemporaryPasswordChange: authenticatedProcedure.mutation(
    async ({ ctx }) => {
      await dismissAppwritePasswordChange(ctx.user.id);
      return { success: true };
    }
  ),
});

const ownerPlatformDocumentSettingsRouter = router({
  get: authenticatedProcedure.query(() => getPlatformDocumentSettings()),

  update: platformOwnerProcedure
    .input(
      z.object({
        showMinistryWatermarkText: z.boolean(),
        watermarkOpacityPercent: z
          .number()
          .int()
          .min(0)
          .max(MAX_WATERMARK_OPACITY_PERCENT),
        headerDividerColor: z.string().regex(HEX_COLOR_PATTERN),
        headerDividerStyle: z.enum([
          "solid",
          "double",
          "dashed",
          "dotted",
          "tricolor-stars",
        ]),
        headerDividerWidthPt: z
          .number()
          .min(MIN_DIVIDER_WIDTH_PT)
          .max(MAX_DIVIDER_WIDTH_PT),
        watermarkText: z.string().trim().min(1).max(255),
        headerTitle: z.string().trim().max(255),
        headerSubtitle: z.string().trim().max(255),
        headerChiefRank: z.string().trim().max(120),
        headerChiefName: z.string().trim().max(255),
        headerShowLogo: z.boolean(),
        headerLogoSize: z
          .number()
          .int()
          .min(MIN_HEADER_LOGO_SIZE)
          .max(MAX_HEADER_LOGO_SIZE),
        headerTopPaddingMm: z.number().int().min(0).max(MAX_HEADER_PADDING_MM),
        headerHorizontalPaddingMm: z
          .number()
          .int()
          .min(0)
          .max(MAX_HEADER_PADDING_MM),
        headerBottomPaddingMm: z
          .number()
          .int()
          .min(0)
          .max(MAX_HEADER_PADDING_MM),
        headerAlignment: z.enum(["spread", "center", "right"]),
        pageMarginTopMm: z.number().int().min(0).max(MAX_PAGE_MARGIN_MM),
        pageMarginRightMm: z.number().int().min(0).max(MAX_PAGE_MARGIN_MM),
        pageMarginBottomMm: z.number().int().min(0).max(MAX_PAGE_MARGIN_MM),
        pageMarginLeftMm: z.number().int().min(0).max(MAX_PAGE_MARGIN_MM),
        frameStyle: z.enum(["none", "single", "double", "ornate"]),
        frameColor: z.string().regex(HEX_COLOR_PATTERN),
        frameWidthPt: z
          .number()
          .min(MIN_FRAME_WIDTH_PT)
          .max(MAX_FRAME_WIDTH_PT),
        showVerificationQr: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const saved = await updatePlatformDocumentSettings(input, ctx.user.id);
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.email ?? "Platform owner",
        action: "platform.document_settings.update",
        entityType: "platform_document_settings",
        entityId: "1",
        metadata: JSON.stringify(input),
      });
      return saved;
    }),
});

import { departmentSettingsRouter } from "./features/settings/departmentSettingsRouter";
import { organizationRouter } from "./features/organizations/organizationRouter";
import { userManagementRouter } from "./features/users/userManagementRouter";
import { auditSearchRouter } from "./features/audit/auditSearchRouter";

export const ownerApiRouter = router({
  auth: ownerAuthRouter,
  profile: ownerProfileRouter,
  organizations: organizationRouter,
  platformDocumentSettings: ownerPlatformDocumentSettingsRouter,
  documentStudio: documentStudioRouter,
  workspace: workspaceRouter,
  departmentSettings: departmentSettingsRouter,
  userManagement: userManagementRouter,
  auditLogs: auditSearchRouter,
});

export type OwnerApiRouter = typeof ownerApiRouter;
