import { createHash, randomInt, randomUUID } from "node:crypto";
import { Query } from "node-appwrite";
import { z } from "zod";
import { getRequestAuditContext } from "../../auditContext";
import { TRPCError } from "@trpc/server";
import {
  adminProcedure,
  organizationManagerProcedure,
  router,
} from "../../_core/trpc";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
  getAppwriteUsers,
} from "../../_core/appwrite";
import {
  getAppwriteProfileById,
  verifyAppwriteUserPassword,
} from "../../_core/appwriteAuth";
import { writeAuditLog } from "../../db";
import {
  addOrganizationMembership,
  getOrganizationById,
  listAllOrganizations,
} from "../organizations/organization";
import { isPlatformOwner } from "../../ownerAccess";
import {
  assertCanManageOrganization,
  getManagedOrganizationIds,
} from "../organizations/organizationScope";

type AppwriteUserRow = Record<string, unknown> & { $id: string };

const USERS_TABLE = "users";
function userRowData(row: AppwriteUserRow): Record<string, unknown> {
  return row.data && typeof row.data === "object"
    ? (row.data as Record<string, unknown>)
    : row;
}

async function listAllRows(
  tableId: string,
  queries: string[]
): Promise<AppwriteUserRow[]> {
  const rows: AppwriteUserRow[] = [];
  let cursor: string | null = null;

  while (true) {
    const result = await getAppwriteTablesDB().listRows({
      databaseId: getAppwriteDatabaseId(),
      tableId,
      queries: [
        ...queries,
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
      total: false,
    });
    const page = result.rows as unknown as AppwriteUserRow[];
    rows.push(...page);
    if (page.length < 100) return rows;

    const nextCursor = page[page.length - 1]?.$id;
    if (!nextCursor || nextCursor === cursor) {
      throw new Error(`Appwrite pagination did not advance for ${tableId}`);
    }
    cursor = nextCursor;
  }
}

async function getUserRowsByUsername(
  username: string
): Promise<AppwriteUserRow[]> {
  return listAllRows(USERS_TABLE, [Query.equal("username", username)]);
}

async function createUserProfileRow(
  values: Record<string, unknown>
): Promise<AppwriteUserRow> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const row = await getAppwriteTablesDB().createRow({
        databaseId: getAppwriteDatabaseId(),
        tableId: USERS_TABLE,
        rowId: randomUUID(),
        data: {
          id: randomInt(1, 2_147_483_647),
          ...values,
        },
      });
      return row as unknown as AppwriteUserRow;
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? Number((error as { code?: unknown }).code)
          : 0;
      if (code !== 409 || attempt === 4) throw error;
    }
  }
  throw new Error("Unable to allocate a unique Appwrite user profile ID");
}

function mapManagedUser(row: AppwriteUserRow) {
  const data = userRowData(row);
  return {
    id: Number(data.id),
    organizationId:
      typeof data.organizationId === "string" ? data.organizationId : null,
    username: String(data.username ?? ""),
    name: typeof data.name === "string" ? data.name : null,
    badgeNumber:
      typeof data.badgeNumber === "string" ? data.badgeNumber : null,
    phone: typeof data.phone === "string" ? data.phone : null,
    rank: typeof data.rank === "string" ? data.rank : null,
    unit: typeof data.unit === "string" ? data.unit : null,
    role: String(data.role ?? "user"),
    loginMethod:
      typeof data.loginMethod === "string" ? data.loginMethod : "password",
    createdAt: data.createdAt ?? null,
    lastSignedIn: data.lastSignedIn ?? null,
  };
}

function syntheticAccountEmail(username: string): string {
  const localPart = createHash("sha256")
    .update(username.toLowerCase())
    .digest("hex")
    .slice(0, 32);
  return `${localPart}@accounts.wathaeqi.invalid`;
}

async function deleteUserMembershipRows(userId: number): Promise<number> {
  const rows = await listAllRows("organization_memberships", [
    Query.equal("userId", userId),
  ]);
  for (const row of rows) {
    await getAppwriteTablesDB().deleteRow({
      databaseId: getAppwriteDatabaseId(),
      tableId: "organization_memberships",
      rowId: row.$id,
    });
  }
  return rows.length;
}

async function deleteRowsForUser(
  tableId: string,
  userId: number
): Promise<number> {
  const rows = await listAllRows(tableId, [Query.equal("userId", userId)]);
  for (const row of rows) {
    await getAppwriteTablesDB().deleteRow({
      databaseId: getAppwriteDatabaseId(),
      tableId,
      rowId: row.$id,
    });
  }
  return rows.length;
}

async function hasRows(
  tableId: string,
  queries: string[]
): Promise<boolean> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId,
    queries: [...queries, Query.limit(1)],
    total: false,
  });
  return result.rows.length > 0;
}


async function getActiveOrganizationForAccount(organizationId: string) {
  const organization = await getOrganizationById(organizationId);
  if (!organization) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "الجهة المختارة غير موجودة أو غير مفعّلة",
    });
  }
  return organization;
}

async function requireCurrentPassword(
  userId: number,
  password: string
): Promise<void> {
  const profile = await getAppwriteProfileById(userId);
  if (
    !profile?.user.username ||
    !(await verifyAppwriteUserPassword(profile.user.username, password))
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "تأكيد كلمة المرور الحالية غير صحيح أو غير متاح لهذا الحساب",
    });
  }
}

export const userManagementRouter = router({
  list: organizationManagerProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(100).default(25),
        search: z.string().trim().max(120).default(""),
        organizationId: z.string().uuid().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const managedOrganizationIds = await getManagedOrganizationIds(ctx.user);
      if (input.organizationId) {
        await assertCanManageOrganization(ctx.user, input.organizationId);
      }
      const scopedOrganizationIds = input.organizationId
        ? [input.organizationId]
        : managedOrganizationIds;
      if (scopedOrganizationIds.length === 0) {
        return {
          items: [],
          total: 0,
          page: input.page,
          pageSize: input.pageSize,
          totalPages: 1,
        };
      }

      const search = input.search.toLowerCase();
      const userRows = await listAllRows(USERS_TABLE, [
        Query.equal("organizationId", scopedOrganizationIds),
      ]);
      const filteredRows = userRows.filter(row => {
        const data = userRowData(row);
        const visible =
          data.isActive === true || data.loginMethod === "disabled";
        if (!visible) return false;
        if (!search) return true;

        return [
          data.name,
          data.username,
          data.badgeNumber,
          data.phone,
        ].some(
          value =>
            typeof value === "string" &&
            value.toLowerCase().includes(search)
        );
      });
      filteredRows.sort((left, right) => {
        const leftDate = Date.parse(
          String(userRowData(left).createdAt ?? "")
        );
        const rightDate = Date.parse(
          String(userRowData(right).createdAt ?? "")
        );
        return rightDate - leftDate;
      });

      const total = filteredRows.length;
      const startIndex = (input.page - 1) * input.pageSize;
      const pageRows = filteredRows.slice(
        startIndex,
        startIndex + input.pageSize
      );
      const users = pageRows.map(mapManagedUser);
      const organizationNames = new Map(
        (await listAllOrganizations()).map(organization => [
          organization.id,
          organization.name,
        ])
      );
      const userIds = users.map(user => user.id);
      const membershipRoles = new Map<string, string>();
      if (userIds.length > 0) {
        const memberships = await listAllRows("organization_memberships", [
          Query.equal("userId", userIds),
          Query.equal("isActive", true),
        ]);
        for (const row of memberships) {
          const membership = userRowData(row);
          if (
            typeof membership.userId === "number" &&
            typeof membership.organizationId === "string" &&
            typeof membership.role === "string"
          ) {
            membershipRoles.set(
              `${membership.userId}:${membership.organizationId}`,
              membership.role
            );
          }
        }
      }

      return {
        items: users.map(user => ({
          ...user,
          membershipRole:
            user.organizationId === null
              ? null
              : (membershipRoles.get(
                  `${user.id}:${user.organizationId}`
                ) ?? null),
          organizationName:
            user.organizationId === null
              ? null
              : (organizationNames.get(user.organizationId) ?? null),
        })),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
      };
    }),

  create: organizationManagerProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        name: z.string().trim().min(2).max(255),
        username: z
          .string()
          .trim()
          .min(3)
          .max(120)
          .regex(
            /^[a-zA-Z0-9._-]+$/,
            "اسم المستخدم يقبل الأحرف الإنجليزية والأرقام والنقطة والشرطة فقط"
          ),
        password: z
          .string()
          .min(12, "كلمة المرور المؤقتة يجب ألا تقل عن 12 محرفًا")
          .max(256),
        badgeNumber: z.string().trim().max(80).nullable().optional(),
        phone: z.string().trim().max(32).nullable().optional(),
        rank: z.string().trim().max(120).nullable().optional(),
        unit: z.string().trim().max(255).nullable().optional(),
        role: z
          .enum([
            "regional_admin",
            "organization_supervisor",
            "organization_admin",
            "dispatcher",
            "reviewer",
            "reader",
            "auditor",
          ])
          .default("dispatcher"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const username = input.username.toLowerCase();
      const client = getSupabaseAdmin();
      const existing = await client
        .from("users")
        .select("id")
        .ilike("username", username)
        .maybeSingle();
      if (existing.error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر التحقق من اسم المستخدم",
        });
      if (existing.data)
        throw new TRPCError({
          code: "CONFLICT",
          message: "اسم المستخدم مستخدم بالفعل",
        });

      const organization = await getActiveOrganizationForAccount(
        input.organizationId
      );
      await assertCanManageOrganization(ctx.user, organization.id);
      if (
        [
          "regional_admin",
          "organization_supervisor",
          "organization_admin",
        ].includes(input.role) &&
        !isPlatformOwner(ctx.user) &&
        ctx.user.role !== "admin"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "تعيين أدوار الإدارة العليا متاح لمالك النظام فقط",
        });
      }
      const now = new Date().toISOString();
      const { data, error } = await client
        .from("users")
        .insert({
          authUserId: randomUUID(),
          organizationId: organization.id,
          username,
          password_hash: await hashPassword(input.password),
          name: input.name,
          badgeNumber: input.badgeNumber?.trim() || null,
          phone: input.phone?.trim() || null,
          rank: input.rank?.trim() || null,
          unit: input.unit?.trim() || null,
          email: null,
          loginMethod: "password",
          mustChangePassword: true,
          role: "user",
          createdAt: now,
          updatedAt: now,
          lastSignedIn: now,
        })
        .select(
          "id, organizationId, username, name, badgeNumber, phone, rank, unit, role, createdAt, lastSignedIn"
        )
        .single();

      if (error || !data) {
        console.error("[userManagement.create] Supabase insert failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "تعذر إنشاء حساب المستخدم. تحقق من إعدادات قاعدة البيانات وحاول مجددًا.",
        });
      }

      try {
        await addOrganizationMembership({
          organizationId: organization.id,
          userId: data.id,
          role: input.role,
        });
      } catch (membershipError) {
        const cleanup = await client.from("users").delete().eq("id", data.id);
        if (cleanup.error) {
          console.error(
            "[userManagement.create] Failed to remove account after membership failure",
            cleanup.error
          );
        }
        throw membershipError;
      }

      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مالك النظام",
        action: "user.create",
        entityType: "user",
        entityId: String(data.id),
        metadata: JSON.stringify({
          username,
          organizationId: organization.id,
          organizationName: organization.name,
          badgeNumber: input.badgeNumber ?? null,
        }),
      });
      return data;
    }),

  update: organizationManagerProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(2).max(255),
        username: z
          .string()
          .trim()
          .min(3)
          .max(120)
          .regex(
            /^[a-zA-Z0-9._-]+$/,
            "اسم المستخدم يقبل الأحرف الإنجليزية والأرقام والنقطة والشرطة فقط"
          ),
        badgeNumber: z.string().trim().max(80).nullable(),
        phone: z.string().trim().max(32).nullable(),
        rank: z.string().trim().max(120).nullable(),
        unit: z.string().trim().max(255).nullable(),
        password: z.string().min(12).max(256).optional().or(z.literal("")),
        confirmPassword: z.string().min(1).max(256).optional(),
        role: z
          .enum([
            "regional_admin",
            "organization_supervisor",
            "organization_admin",
            "dispatcher",
            "reviewer",
            "reader",
            "auditor",
          ])
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if ((input.password || input.role) && !input.confirmPassword) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "تأكيد كلمة المرور الحالية مطلوب لتغيير الصلاحية أو كلمة المرور",
        });
      }
      if ((input.password || input.role) && input.confirmPassword) {
        await requireCurrentPassword(ctx.user.id, input.confirmPassword);
      }
      const client = getSupabaseAdmin();
      const target = await client
        .from("users")
        .select("id, role, username, organizationId")
        .eq("id", input.id)
        .maybeSingle();
      if (target.error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر تحميل الحساب المطلوب",
        });
      if (!target.data)
        throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود" });
      if (typeof target.data.organizationId === "string") {
        await assertCanManageOrganization(ctx.user, target.data.organizationId);
      }
      if (
        input.role &&
        [
          "regional_admin",
          "organization_supervisor",
          "organization_admin",
        ].includes(input.role) &&
        !isPlatformOwner(ctx.user) &&
        ctx.user.role !== "admin"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "تعيين أدوار الإدارة العليا متاح لمالك النظام فقط",
        });
      }
      if (target.data.role === "admin" && input.id !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا يمكن تعديل حساب مالك آخر من هذه الشاشة",
        });
      }
      const username = input.username.toLowerCase();
      const duplicate = await client
        .from("users")
        .select("id")
        .ilike("username", username)
        .neq("id", input.id)
        .maybeSingle();
      if (duplicate.error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر التحقق من اسم المستخدم",
        });
      if (duplicate.data)
        throw new TRPCError({
          code: "CONFLICT",
          message: "اسم المستخدم مستخدم بالفعل",
        });

      const values: Record<string, unknown> = {
        name: input.name,
        username,
        badgeNumber: input.badgeNumber?.trim() || null,
        phone: input.phone?.trim() || null,
        rank: input.rank?.trim() || null,
        unit: input.unit?.trim() || null,
        updatedAt: new Date().toISOString(),
      };
      if (input.password) {
        values.password_hash = await hashPassword(input.password);
        values.mustChangePassword = true;
        // Revoke existing application sessions without changing the auth identity.
        values.sessionVersion = randomUUID();
      }
      const { data, error } = await client
        .from("users")
        .update(values)
        .eq("id", input.id)
        .select(
          "id, username, name, badgeNumber, phone, rank, unit, role, createdAt, lastSignedIn"
        )
        .single();
      if (error || !data) {
        console.error("[userManagement.update] Supabase update failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر حفظ تعديلات الحساب",
        });
      }
      if (input.role && typeof target.data.organizationId === "string") {
        await addOrganizationMembership({
          organizationId: target.data.organizationId,
          userId: input.id,
          role: input.role,
        });
      }
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مالك النظام",
        action: "user.update",
        entityType: "user",
        entityId: String(input.id),
        metadata: JSON.stringify({
          username,
          passwordReset: Boolean(input.password),
        }),
      });
      return data;
    }),

  enable: organizationManagerProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        password: z.string().min(12).max(256),
        confirmPassword: z.string().min(1).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireCurrentPassword(ctx.user.id, input.confirmPassword);
      const client = getSupabaseAdmin();
      const target = await client
        .from("users")
        .select("id, role, username, loginMethod, organizationId")
        .eq("id", input.id)
        .maybeSingle();
      if (target.error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر تحميل الحساب المطلوب",
        });
      if (!target.data)
        throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود" });
      if (typeof target.data.organizationId === "string") {
        await assertCanManageOrganization(ctx.user, target.data.organizationId);
      }
      if (target.data.role === "admin")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا يمكن إعادة تفعيل حساب مالك النظام من هذه الشاشة",
        });
      if (target.data.loginMethod !== "disabled")
        throw new TRPCError({
          code: "CONFLICT",
          message: "الحساب مفعّل بالفعل",
        });
      const { error } = await client
        .from("users")
        .update({
          sessionVersion: randomUUID(),
          password_hash: await hashPassword(input.password),
          mustChangePassword: true,
          loginMethod: "password",
          isActive: true,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) {
        console.error("[userManagement.enable] Supabase update failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر إعادة تفعيل الحساب",
        });
      }
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مالك النظام",
        action: "user.enable",
        entityType: "user",
        entityId: String(input.id),
        metadata: JSON.stringify({ username: target.data.username }),
      });
      return { success: true };
    }),

  delete: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        confirmPassword: z.string().min(1).max(256),
        confirmation: z.string().trim().min(12).max(160),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isPlatformOwner(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "الحذف النهائي للحسابات متاح لمالك النظام فقط",
        });
      }
      await requireCurrentPassword(ctx.user.id, input.confirmPassword);
      if (input.id === ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا يمكنك حذف حسابك الحالي",
        });
      }

      const { data, error } = await getSupabaseAdmin().rpc(
        "purge_inactive_user_safely",
        {
          p_user_id: input.id,
          p_owner_user_id: ctx.user.id,
          p_reason: "حذف نهائي لحساب بطلب مالك النظام",
          p_confirmation: input.confirmation,
        }
      );
      if (error) {
        throw new TRPCError({
          code: "CONFLICT",
          message: error.message || "تعذر حذف الحساب نهائيًا",
        });
      }
      return data;
    }),

  disable: organizationManagerProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        confirmPassword: z.string().min(1).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireCurrentPassword(ctx.user.id, input.confirmPassword);
      if (input.id === ctx.user.id)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا يمكنك تعطيل حسابك الحالي",
        });
      const client = getSupabaseAdmin();
      const target = await client
        .from("users")
        .select("id, role, username, organizationId")
        .eq("id", input.id)
        .maybeSingle();
      if (target.error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر تحميل الحساب المطلوب",
        });
      if (!target.data)
        throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود" });
      if (typeof target.data.organizationId === "string") {
        await assertCanManageOrganization(ctx.user, target.data.organizationId);
      }
      if (target.data.role === "admin")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا يمكن تعطيل حساب مالك النظام",
        });
      const { error } = await client
        .from("users")
        .update({
          sessionVersion: randomUUID(),
          password_hash: null,
          loginMethod: "disabled",
          isActive: false,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) {
        console.error("[userManagement.disable] Supabase update failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر تعطيل الحساب",
        });
      }
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مالك النظام",
        action: "user.disable",
        entityType: "user",
        entityId: String(input.id),
        metadata: JSON.stringify({ username: target.data.username }),
      });
      return { success: true };
    }),
});
