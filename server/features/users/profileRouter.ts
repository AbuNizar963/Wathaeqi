import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicUser } from "../../_core/auth";
import {
  AppwriteInvalidCurrentPasswordError,
  changeAppwritePassword,
  dismissAppwritePasswordChange,
} from "../../_core/appwriteAuth";
import {
  authenticatedProcedure,
  protectedProcedure,
  router,
} from "../../_core/trpc";
import { updateUserProfile } from "../../db";

export const profileRouter = router({
  get: authenticatedProcedure.query(({ ctx }) => ctx.user),

  update: protectedProcedure
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
      const updated = await updateUserProfile(ctx.user.id, {
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
