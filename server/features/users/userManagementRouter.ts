import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authenticatedProcedure, router } from "../../_core/ownerTrpc";
import { isPlatformOwner } from "../../ownerAccess";
import { getRequestAuditContext } from "../../auditContext";
import { writeAuditLog } from "../audit/appwriteAuditRepository";
import { verifyAppwriteUserPassword } from "../../_core/appwriteAuth";
import { resolveOrganizationScope } from "../organizations/organizationAccess";
import {
  createManagedUser,
  deleteManagedUser,
  getManagedUser,
  ManagedUserHasLinkedRecordsError,
  listManagedUsers,
  setManagedUserActive,
  updateManagedUser,
} from "./userService";

const membershipRole = z.enum([
  "system_admin",
  "organization_admin",
  "regional_admin",
  "reviewer",
  "dispatcher",
  "member",
]);

const profileInput = z.object({
  name: z.string().trim().min(2).max(255),
  username: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(
      /^[A-Za-z0-9._-]+$/,
      "اسم المستخدم يقبل الأحرف اللاتينية والأرقام والنقطة والشرطة"
    ),
  email: z.string().trim().email().max(320),
  organizationId: z.string().min(1).max(36),
  role: z.enum(["user", "admin"]),
  membershipRole,
  rank: z.string().trim().max(120).nullable(),
  badgeNumber: z.string().trim().max(80).nullable(),
  phone: z.string().trim().max(40).nullable(),
  unit: z.string().trim().max(120).nullable(),
});

function assertOwner(user: Parameters<typeof isPlatformOwner>[0]): void {
  if (!isPlatformOwner(user)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "إدارة الحسابات متاحة لمالك المنصة فقط.",
    });
  }
}

async function assertFixedOrganization(
  user: Parameters<typeof resolveOrganizationScope>[0],
  organizationId: string
): Promise<void> {
  const scope = await resolveOrganizationScope(user);
  if (organizationId !== scope.organizationId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "يمكن إدارة الحسابات ضمن الجهة الثابتة فقط.",
    });
  }
}

async function getScopedManagedUser(
  user: Parameters<typeof resolveOrganizationScope>[0],
  id: number
) {
  const scope = await resolveOrganizationScope(user);
  const managedUser = await getManagedUser(id);
  if (!managedUser || managedUser.organizationId !== scope.organizationId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "المستخدم غير موجود ضمن الجهة الحالية",
    });
  }
  return managedUser;
}

export const userManagementRouter = router({
  list: authenticatedProcedure.query(async ({ ctx }) => {
    assertOwner(ctx.user);
    const scope = await resolveOrganizationScope(ctx.user);
    const users = await listManagedUsers();
    return users.filter(user => user.organizationId === scope.organizationId);
  }),

  get: authenticatedProcedure
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      assertOwner(ctx.user);
      return getScopedManagedUser(ctx.user, input.id);
    }),

  create: authenticatedProcedure
    .input(
      profileInput.extend({
        password: z.string().min(10).max(128),
        mustChangePassword: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertOwner(ctx.user);
      await assertFixedOrganization(ctx.user, input.organizationId);
      const created = await createManagedUser({
        ...input,
        bio: null,
      } as Parameters<typeof createManagedUser>[0]);
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? "مالك المنصة",
        action: "user.create",
        entityType: "user",
        entityId: String(created.id),
        organizationId: created.organizationId,
        afterState: { ...created, email: created.email },
      }).catch(() => undefined);
      return created;
    }),

  update: authenticatedProcedure
    .input(
      profileInput.extend({
        id: z.coerce.number().int().positive(),
        bio: z.string().trim().max(2000).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertOwner(ctx.user);
      const before = await getScopedManagedUser(ctx.user, input.id);
      await assertFixedOrganization(ctx.user, input.organizationId);
      const updated = await updateManagedUser(input.id, input);
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? "مالك المنصة",
        action: "user.update",
        entityType: "user",
        entityId: String(updated.id),
        organizationId: updated.organizationId,
        beforeState: before,
        afterState: updated,
      }).catch(() => undefined);
      return updated;
    }),

  setActive: authenticatedProcedure
    .input(
      z.object({
        id: z.coerce.number().int().positive(),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertOwner(ctx.user);
      await getScopedManagedUser(ctx.user, input.id);
      await setManagedUserActive(input.id, input.isActive, {
        id: ctx.user.id,
        authUserId: ctx.user.authUserId,
      });
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? "مالك المنصة",
        action: input.isActive ? "user.enable" : "user.disable",
        entityType: "user",
        entityId: String(input.id),
      }).catch(() => undefined);
      return { success: true as const };
    }),

  enable: authenticatedProcedure
    .input(
      z.object({
        id: z.coerce.number().int().positive(),
        confirmPassword: z.string().max(256).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertOwner(ctx.user);
      await getScopedManagedUser(ctx.user, input.id);
      if (input.confirmPassword) {
        const valid = await verifyAppwriteUserPassword(
          ctx.user.username ?? ctx.user.email ?? "",
          input.confirmPassword
        );
        if (!valid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "كلمة المرور الحالية غير صحيحة",
          });
        }
      }
      await setManagedUserActive(input.id, true, {
        id: ctx.user.id,
        authUserId: ctx.user.authUserId,
      });
      return { success: true as const };
    }),

  disable: authenticatedProcedure
    .input(
      z.object({
        id: z.coerce.number().int().positive(),
        confirmPassword: z.string().min(1).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertOwner(ctx.user);
      await getScopedManagedUser(ctx.user, input.id);
      const valid = await verifyAppwriteUserPassword(
        ctx.user.username ?? ctx.user.email ?? "",
        input.confirmPassword
      );
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "كلمة المرور الحالية غير صحيحة",
        });
      }
      await setManagedUserActive(input.id, false, {
        id: ctx.user.id,
        authUserId: ctx.user.authUserId,
      });
      return { success: true as const };
    }),

  delete: authenticatedProcedure
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertOwner(ctx.user);
      const before = await getScopedManagedUser(ctx.user, input.id);
      try {
        await deleteManagedUser(input.id, {
          id: ctx.user.id,
          authUserId: ctx.user.authUserId,
        });
      } catch (error) {
        if (error instanceof ManagedUserHasLinkedRecordsError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          });
        }
        throw error;
      }
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? "مالك المنصة",
        action: "user.delete",
        entityType: "user",
        entityId: String(input.id),
        organizationId: before.organizationId,
        beforeState: before,
      }).catch(() => undefined);
      return { success: true as const };
    }),
});
