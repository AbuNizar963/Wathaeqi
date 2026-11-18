import { timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { Account } from "node-appwrite";
import { z } from "zod";
import { publicUser } from "./_core/auth";
import {
  AppwritePasswordResetRequiredError,
  authenticateAppwriteUser,
  clearAppwriteSessionCookie,
  deleteCurrentAppwriteSession,
  setAppwriteSessionCookie,
} from "./_core/appwriteAuth";
import { getAppwriteSessionClient } from "./_core/appwrite";
import {
  clearSuccessfulLoginRateLimit,
  enforceLoginRateLimit,
} from "./_core/loginRateLimit";
import { ENV } from "./_core/env";
import {
  createInitialOwnerProfile,
  isInitialOwnerSetupAvailable,
} from "./features/auth/ownerBootstrap";
import { platformOwnerProcedure, publicProcedure, router } from "./_core/trpc";
import { isPlatformOwner } from "./ownerAccess";
import {
  documentStudioRouter,
} from "./features/document-studio/documentStudioRouter";
import {
  getOrganizationById,
  getUserOrganizationMembership,
} from "./features/organizations/organization";
import { profileRouter } from "./features/users/profileRouter";
import {
  platformDocumentSettingsRouter,
} from "./features/platform-settings/platformDocumentSettingsRouter";

async function authenticateOwnerForLogin(username: string, password: string) {
  try {
    const authenticated = await authenticateAppwriteUser(username, password);
    if (!authenticated || !isPlatformOwner(authenticated.user)) {
      if (authenticated?.session.secret) {
        await new Account(
          getAppwriteSessionClient(authenticated.session.secret)
        )
          .deleteSession({ sessionId: "current" })
          .catch(() => undefined);
      }
      return null;
    }
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
  me: publicProcedure.query(({ ctx }) =>
    ctx.user && isPlatformOwner(ctx.user) ? ctx.user : null
  ),

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
      const authenticated = await authenticateOwnerForLogin(
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

const ownerOrganizationsRouter = router({
  context: platformOwnerProcedure.query(async ({ ctx }) => {
    const membership = await getUserOrganizationMembership(ctx.user.id);
    const organizationId =
      membership?.organizationId ?? ctx.user.organizationId ?? null;
    const organization = organizationId
      ? await getOrganizationById(organizationId)
      : null;

    return {
      organizationId,
      organizationName: organization?.name ?? "وثائقي",
      role: membership?.role ?? "system_admin",
      isActive: membership?.isActive ?? true,
      isOwner: true,
    };
  }),
});

export const ownerApiRouter = router({
  auth: ownerAuthRouter,
  profile: profileRouter,
  organizations: ownerOrganizationsRouter,
  platformDocumentSettings: platformDocumentSettingsRouter,
  documentStudio: documentStudioRouter,
});

export type OwnerApiRouter = typeof ownerApiRouter;
