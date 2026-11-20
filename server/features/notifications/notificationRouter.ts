import { z } from "zod";
import { authenticatedProcedure, router } from "../../_core/ownerTrpc";
import { ENV } from "../../_core/env";
import { resolveTelegramScope } from "../telegrams/telegramAccess";
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerMobilePushToken,
  unregisterMobilePushToken,
} from "./notificationService";

export const notificationRouter = router({
  config: authenticatedProcedure.query(() => ({
    enabled: Boolean(ENV.vapidPublicKey),
    publicKey: ENV.vapidPublicKey || null,
  })),

  subscribe: authenticatedProcedure
    .input(
      z.object({
        endpoint: z.string().url().max(2048),
        keys: z.object({
          p256dh: z.string().min(16).max(256),
          auth: z.string().min(8).max(256),
        }),
        userAgent: z.string().max(512).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      await registerMobilePushToken({
        userId: ctx.user.id,
        organizationId: scope.organizationId,
        token: input.endpoint,
        platform: "web",
      });
      return { subscribed: true as const };
    }),

  unsubscribe: authenticatedProcedure
    .input(z.object({ endpoint: z.string().url().max(2048) }))
    .mutation(async ({ ctx, input }) => ({
      subscribed: !(await unregisterMobilePushToken(
        ctx.user.id,
        input.endpoint
      )),
    })),

  list: authenticatedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).default(50),
          unreadOnly: z.boolean().default(false),
        })
        .optional()
    )
    .query(async ({ ctx, input }) =>
      listNotifications(ctx.user.id, input ?? { limit: 50, unreadOnly: false })
    ),

  inbox: authenticatedProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(200).optional() })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const [items, unreadCount] = await Promise.all([
        listNotifications(ctx.user.id, { limit: input?.limit ?? 50 }),
        countUnreadNotifications(ctx.user.id),
      ]);
      return { items, unreadCount };
    }),

  unreadCount: authenticatedProcedure.query(async ({ ctx }) => ({
    count: await countUnreadNotifications(ctx.user.id),
  })),

  markRead: authenticatedProcedure
    .input(z.object({ id: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => ({
      success: await markNotificationRead(ctx.user.id, input.id),
    })),

  markAllRead: authenticatedProcedure.mutation(async ({ ctx }) => ({
    updated: await markAllNotificationsRead(ctx.user.id),
  })),

  registerMobileToken: authenticatedProcedure
    .input(
      z.object({
        token: z.string().trim().min(20).max(512),
        platform: z.enum(["android", "ios", "web"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      await registerMobilePushToken({
        userId: ctx.user.id,
        organizationId: scope.organizationId,
        token: input.token,
        platform: input.platform,
      });
      return { success: true as const };
    }),

  unregisterMobileToken: authenticatedProcedure
    .input(z.object({ token: z.string().trim().min(20).max(512) }))
    .mutation(async ({ ctx, input }) => ({
      success: await unregisterMobilePushToken(ctx.user.id, input.token),
    })),
});
