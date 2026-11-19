import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import type { TrpcContext } from "./context";
import { isPlatformOwner } from "../ownerAccess";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const authenticatedProcedure = t.procedure.use(requireUser);

const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: UNAUTHED_ERR_MSG,
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const platformOwnerProcedure = authenticatedProcedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || !isPlatformOwner(ctx.user)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "هذه الخدمة متاحة لمالك المنصة فقط",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  })
);
