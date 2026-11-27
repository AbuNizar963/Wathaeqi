import { randomInt, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { Query } from "node-appwrite";
import { z } from "zod";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
  getAppwriteUsers,
} from "../../_core/appwrite";
import {
  authenticatedProcedure,
  platformOwnerProcedure,
  router,
} from "../../_core/ownerTrpc";
import { isPlatformOwner } from "../../ownerAccess";
import { getUserOrganizationMembership } from "../organizations/appwriteOwnerOrganizationRepository";
import { resolveOrganizationScope } from "../organizations/organizationAccess";
import { getRequestAuditContext } from "../../auditContext";
import { writeAuditLog } from "../audit/appwriteAuditRepository";

type AppwriteRow = Record<string, unknown> & {
  $id: string;
  data?: Record<string, unknown>;
};

function rowData(row: AppwriteRow): Record<string, unknown> {
  return row.data ?? row;
}

function parseOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeJson(value: unknown): unknown {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

const contactsRouter = router({
  list: authenticatedProcedure.query(async ({ ctx }) => {
    const result = await getAppwriteTablesDB().listRows({
      databaseId: getAppwriteDatabaseId(),
      tableId: "contacts",
      queries: [Query.equal("ownerId", ctx.user.authUserId), Query.limit(100)],
      total: true,
    });
    return result.rows.map(row => {
      const data = rowData(row as AppwriteRow);
      return {
        id: (row as AppwriteRow).$id,
        name: String(data.name ?? ""),
        email: parseOptionalText(data.email),
        phone: parseOptionalText(data.phone),
        organization: parseOptionalText(data.organization),
      };
    });
  }),

  create: authenticatedProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(256),
        email: z.string().trim().email().max(254).or(z.literal("")).default(""),
        phone: z.string().trim().max(32).default(""),
        organization: z.string().trim().max(256).default(""),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveOrganizationScope(ctx.user);
      const row = await getAppwriteTablesDB().createRow({
        databaseId: getAppwriteDatabaseId(),
        tableId: "contacts",
        rowId: randomUUID(),
        data: {
          ownerId: ctx.user.authUserId,
          name: input.name,
          email: input.email || null,
          phone: input.phone || null,
          organization: input.organization || null,
        },
      });
      const data = rowData(row as AppwriteRow);
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مستخدم",
        actorRole: ctx.user.role,
        organizationId: scope.organizationId,
        action: "contact.created",
        entityType: "contact",
        entityId: (row as AppwriteRow).$id,
        metadata: { name: input.name, organization: input.organization },
      });
      return {
        id: (row as AppwriteRow).$id,
        name: String(data.name ?? input.name),
        email: parseOptionalText(data.email),
        phone: parseOptionalText(data.phone),
        organization: parseOptionalText(data.organization),
      };
    }),

  update: authenticatedProcedure
    .input(
      z.object({
        id: z.string().min(1).max(36),
        name: z.string().trim().min(2).max(256),
        email: z.string().trim().email().max(254).or(z.literal("")).default(""),
        phone: z.string().trim().max(32).default(""),
        organization: z.string().trim().max(256).default(""),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveOrganizationScope(ctx.user);
      const tables = getAppwriteTablesDB();
      const existing = (await tables.getRow({
        databaseId: getAppwriteDatabaseId(),
        tableId: "contacts",
        rowId: input.id,
      })) as unknown as AppwriteRow;
      const data = rowData(existing);
      if (data.ownerId !== ctx.user.authUserId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "جهة الاتصال غير موجودة",
        });
      }
      const row = (await tables.updateRow({
        databaseId: getAppwriteDatabaseId(),
        tableId: "contacts",
        rowId: input.id,
        data: {
          name: input.name,
          email: input.email || null,
          phone: input.phone || null,
          organization: input.organization || null,
        },
      })) as unknown as AppwriteRow;
      const saved = rowData(row);
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مستخدم",
        actorRole: ctx.user.role,
        organizationId: scope.organizationId,
        action: "contact.updated",
        entityType: "contact",
        entityId: input.id,
        metadata: { name: input.name, organization: input.organization },
      });
      return {
        id: row.$id,
        name: String(saved.name ?? input.name),
        email: parseOptionalText(saved.email),
        phone: parseOptionalText(saved.phone),
        organization: parseOptionalText(saved.organization),
      };
    }),

  delete: authenticatedProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveOrganizationScope(ctx.user);
      const tables = getAppwriteTablesDB();
      const existing = (await tables.getRow({
        databaseId: getAppwriteDatabaseId(),
        tableId: "contacts",
        rowId: input.id,
      })) as unknown as AppwriteRow;
      if (rowData(existing).ownerId !== ctx.user.authUserId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "جهة الاتصال غير موجودة",
        });
      }
      await tables.deleteRow({
        databaseId: getAppwriteDatabaseId(),
        tableId: "contacts",
        rowId: input.id,
      });
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مستخدم",
        actorRole: ctx.user.role,
        organizationId: scope.organizationId,
        action: "contact.deleted",
        entityType: "contact",
        entityId: input.id,
        metadata: { name: rowData(existing).name },
      });
      return { success: true as const };
    }),
});

const notificationsRouter = router({
  list: authenticatedProcedure.query(async ({ ctx }) => {
    const result = await getAppwriteTablesDB().listRows({
      databaseId: getAppwriteDatabaseId(),
      tableId: "notifications",
      queries: [
        Query.equal("userId", ctx.user.id),
        Query.orderDesc("createdAt"),
        Query.limit(100),
      ],
      total: true,
    });
    return result.rows.map(row => {
      const data = rowData(row as AppwriteRow);
      return {
        id: (row as AppwriteRow).$id,
        type: String(data.type ?? "system"),
        title: String(data.title ?? "تنبيه"),
        body: String(data.body ?? ""),
        readAt: parseOptionalText(data.readAt),
        createdAt: String(data.createdAt ?? ""),
      };
    });
  }),

  markRead: authenticatedProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .mutation(async ({ ctx, input }) => {
      const tables = getAppwriteTablesDB();
      const row = (await tables.getRow({
        databaseId: getAppwriteDatabaseId(),
        tableId: "notifications",
        rowId: input.id,
      })) as unknown as AppwriteRow;
      const data = rowData(row);
      if (Number(data.userId) !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "التنبيه غير موجود",
        });
      }
      if (!data.readAt) {
        await tables.updateRow({
          databaseId: getAppwriteDatabaseId(),
          tableId: "notifications",
          rowId: input.id,
          data: { readAt: new Date().toISOString() },
        });
      }
      return { success: true as const };
    }),

  markAllRead: authenticatedProcedure.mutation(async ({ ctx }) => {
    const tables = getAppwriteTablesDB();
    const result = await tables.listRows({
      databaseId: getAppwriteDatabaseId(),
      tableId: "notifications",
      queries: [Query.equal("userId", ctx.user.id), Query.limit(100)],
      total: false,
    });
    const unread = result.rows.filter(
      row => !rowData(row as AppwriteRow).readAt
    );
    await Promise.all(
      unread.map(row =>
        tables.updateRow({
          databaseId: getAppwriteDatabaseId(),
          tableId: "notifications",
          rowId: (row as unknown as AppwriteRow).$id,
          data: { readAt: new Date().toISOString() },
        })
      )
    );
    return { updated: unread.length };
  }),
});

const auditRouter = router({
  list: platformOwnerProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(100),
        search: z.string().trim().max(120).optional(),
        entityType: z
          .enum(["all", "document", "user", "contact", "settings"])
          .default("all"),
        action: z.string().trim().max(100).optional(),
      })
    )
    .query(async ({ input }) => {
      const result = await getAppwriteTablesDB().listRows({
        databaseId: getAppwriteDatabaseId(),
        tableId: "app_records",
        queries: [
          Query.equal("recordType", "audit_event"),
          Query.orderDesc("createdAt"),
          Query.limit(input.limit),
        ],
        total: true,
      });

      const events = result.rows.map(row => {
        const data = rowData(row as AppwriteRow);
        const payload = safeJson(data.payload);
        const event =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : {};
        return {
          id: (row as AppwriteRow).$id,
          actorUserId: Number(event.actorUserId ?? 0),
          actorName: String(event.actorName ?? "مستخدم"),
          actorRank: parseOptionalText(event.actorRank),
          actorRole: parseOptionalText(event.actorRole),
          action: String(event.action ?? "unknown"),
          entityType: String(event.entityType ?? "system"),
          entityId: parseOptionalText(event.entityId),
          organizationId: parseOptionalText(event.organizationId),
          metadata: event.metadata ?? null,
          beforeState: event.beforeState ?? null,
          afterState: event.afterState ?? null,
          reason: parseOptionalText(event.reason),
          ipAddress: parseOptionalText(event.ipAddress),
          userAgent: parseOptionalText(event.userAgent),
          deviceType: parseOptionalText(event.deviceType) ?? "unknown",
          createdAt: String(data.createdAt ?? event.occurredAt ?? ""),
        };
      });

      const search = input.search?.toLocaleLowerCase("ar");
      const filtered = events.filter(event => {
        if (input.entityType !== "all") {
          const isSettings =
            input.entityType === "settings" && event.entityType === "platform";
          if (!isSettings && event.entityType !== input.entityType)
            return false;
        }
        if (input.action && event.action !== input.action) return false;
        if (!search) return true;
        return [
          event.actorName,
          event.actorRank ?? "",
          event.actorRole ?? "",
          event.action,
          event.entityType,
          event.entityId ?? "",
          event.reason ?? "",
          event.deviceType,
          JSON.stringify(event.metadata ?? ""),
          JSON.stringify(event.beforeState ?? ""),
          JSON.stringify(event.afterState ?? ""),
        ]
          .join(" ")
          .toLocaleLowerCase("ar")
          .includes(search);
      });

      return {
        events: filtered,
        total: filtered.length,
        availableTotal: result.total,
        returned: filtered.length,
      };
    }),
});

const administrationRouter = router({
  overview: platformOwnerProcedure.query(async ({ ctx }) => {
    const scope = await resolveOrganizationScope(ctx.user);
    const tables = getAppwriteTablesDB();
    const databaseId = getAppwriteDatabaseId();
    const [usersResult, organizationsResult] = await Promise.all([
      tables.listRows({
        databaseId,
        tableId: "users",
        queries: [Query.orderDesc("createdAt"), Query.limit(100)],
        total: true,
      }),
      tables.listRows({
        databaseId,
        tableId: "organizations",
        queries: [Query.orderAsc("name"), Query.limit(100)],
        total: true,
      }),
    ]);

    const users = usersResult.rows
      .map(row => {
        const data = rowData(row as AppwriteRow);
        return {
          id: String(data.id ?? (row as AppwriteRow).$id),
          name:
            parseOptionalText(data.name) ??
            parseOptionalText(data.username) ??
            "بدون اسم",
          username: parseOptionalText(data.username),
          email: parseOptionalText(data.email),
          organizationId: parseOptionalText(data.organizationId),
          role: String(data.role ?? "user"),
          isActive: data.isActive === true,
          isPlatformOwner: data.isPlatformOwner === true,
          lastSignedIn: parseOptionalText(data.lastSignedIn),
        };
      })
      .filter(user => user.organizationId === scope.organizationId);
    const organizations = organizationsResult.rows
      .map(row => {
        const data = rowData(row as AppwriteRow);
        return {
          id: String(data.id ?? (row as AppwriteRow).$id),
          name: String(data.name ?? "جهة بدون اسم"),
          code: String(data.code ?? ""),
          type: String(data.type ?? "department"),
          isActive: data.isActive !== false,
          parentOrganizationId: null,
        };
      })
      .filter(item => item.id === scope.organizationId);
    return {
      users,
      organizations,
      totals: {
        users: users.length,
        activeUsers: users.filter(user => user.isActive).length,
        organizations: organizations.length,
        activeOrganizations: organizations.filter(item => item.isActive).length,
      },
    };
  }),

  createOrganization: platformOwnerProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(256),
        code: z
          .string()
          .trim()
          .min(2)
          .max(32)
          .regex(/^[A-Za-z0-9_-]+$/),
        type: z.string().trim().min(2).max(64).default("department"),
        parentOrganizationId: z.string().trim().max(64).default(""),
      })
    )
    .mutation(() => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "النظام يعمل بجهة واحدة؛ إدارة الهيكل التنظيمي معطّلة.",
      });
    }),
  updateOrganization: platformOwnerProcedure
    .input(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().trim().min(2).max(256),
        code: z
          .string()
          .trim()
          .min(2)
          .max(32)
          .regex(/^[A-Za-z0-9_-]+$/),
        type: z.string().trim().min(2).max(64),
        parentOrganizationId: z.string().trim().max(64).default(""),
      })
    )
    .mutation(() => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "النظام يعمل بجهة واحدة؛ إدارة الهيكل التنظيمي معطّلة.",
      });
    }),
  setOrganizationActive: platformOwnerProcedure
    .input(z.object({ id: z.string().min(1).max(64), isActive: z.boolean() }))
    .mutation(() => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "النظام يعمل بجهة واحدة؛ إدارة الهيكل التنظيمي معطّلة.",
      });
    }),
  createUser: platformOwnerProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(256),
        username: z
          .string()
          .trim()
          .min(3)
          .max(64)
          .regex(/^[A-Za-z0-9_.-]+$/),
        email: z.string().trim().email().max(254),
        password: z.string().min(12).max(128),
        organizationId: z.string().min(1).max(64),
        role: z.enum(["user", "admin"]).default("user"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveOrganizationScope(ctx.user);
      if (input.organizationId !== scope.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "يمكن إنشاء الحسابات ضمن الجهة الثابتة فقط.",
        });
      }
      const tables = getAppwriteTablesDB();
      const databaseId = getAppwriteDatabaseId();
      const organization = await tables.listRows({
        databaseId,
        tableId: "organizations",
        queries: [
          Query.equal("id", input.organizationId),
          Query.equal("isActive", true),
          Query.limit(1),
        ],
        total: false,
      });
      if (!organization.rows.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "اختر جهة نشطة وصالحة",
        });
      }
      const duplicate = await tables.listRows({
        databaseId,
        tableId: "users",
        queries: [Query.equal("username", input.username), Query.limit(1)],
        total: false,
      });
      if (duplicate.rows.length) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "اسم المستخدم مستخدم مسبقاً",
        });
      }

      const authUserId = randomUUID();
      const profileId = randomInt(1, 2_147_483_647);
      const now = new Date().toISOString();
      const authUsers = getAppwriteUsers();
      await authUsers.create({
        userId: authUserId,
        email: input.email,
        password: input.password,
        name: input.name,
      });

      let profileRowId: string | null = null;
      try {
        const profile = (await tables.createRow({
          databaseId,
          tableId: "users",
          rowId: randomUUID(),
          data: {
            id: profileId,
            authUserId,
            sessionVersion: randomUUID(),
            organizationId: input.organizationId,
            name: input.name,
            username: input.username,
            badgeNumber: null,
            bio: null,
            phone: null,
            rank: null,
            unit: null,
            avatarKey: null,
            email: input.email,
            loginMethod: "appwrite",
            isActive: true,
            isPlatformOwner: false,
            mustChangePassword: true,
            role: input.role,
            createdAt: now,
            updatedAt: now,
            lastSignedIn: now,
            passwordHashCiphertext: null,
          },
        })) as unknown as AppwriteRow;
        profileRowId = profile.$id;
        await tables.createRow({
          databaseId,
          tableId: "organization_memberships",
          rowId: randomUUID(),
          data: {
            id: randomInt(1, 2_147_483_647),
            organizationId: input.organizationId,
            userId: profileId,
            role: input.role === "admin" ? "organization_admin" : "dispatcher",
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
        });
      } catch (error) {
        if (profileRowId) {
          try {
            await tables.deleteRow({
              databaseId,
              tableId: "users",
              rowId: profileRowId,
            });
          } catch {
            // Preserve the original creation failure.
          }
        }
        try {
          await authUsers.delete({ userId: authUserId });
        } catch {
          // Preserve the original creation failure.
        }
        throw error;
      }

      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مالك المنصة",
        actorRole: ctx.user.role,
        organizationId: input.organizationId,
        action: "user.created",
        entityType: "user",
        entityId: String(profileId),
        metadata: {
          username: input.username,
          organizationId: input.organizationId,
          role: input.role,
        },
      });
      return {
        id: String(profileId),
        name: input.name,
        username: input.username,
        email: input.email,
        isActive: true,
      };
    }),

  setUserActive: platformOwnerProcedure
    .input(
      z.object({
        id: z.coerce.number().int().positive(),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tables = getAppwriteTablesDB();
      const databaseId = getAppwriteDatabaseId();
      const found = await tables.listRows({
        databaseId,
        tableId: "users",
        queries: [Query.equal("id", input.id), Query.limit(2)],
        total: false,
      });
      const row = found.rows[0] as unknown as AppwriteRow | undefined;
      if (!row || found.rows.length !== 1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "حساب المستخدم غير موجود",
        });
      }
      const data = rowData(row);
      if (
        data.isPlatformOwner === true ||
        data.authUserId === ctx.user.authUserId
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا يمكن إيقاف حساب مالك المنصة",
        });
      }
      const authUserId = String(data.authUserId ?? "");
      if (!authUserId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "حساب Appwrite المرتبط غير موجود",
        });
      }
      await getAppwriteUsers().updateStatus({
        userId: authUserId,
        status: input.isActive,
      });
      const now = new Date().toISOString();
      await tables.updateRow({
        databaseId,
        tableId: "users",
        rowId: row.$id,
        data: { isActive: input.isActive, updatedAt: now },
      });
      const memberships = await tables.listRows({
        databaseId,
        tableId: "organization_memberships",
        queries: [Query.equal("userId", input.id), Query.limit(100)],
        total: false,
      });
      await Promise.all(
        memberships.rows.map(item =>
          tables.updateRow({
            databaseId,
            tableId: "organization_memberships",
            rowId: (item as unknown as AppwriteRow).$id,
            data: { isActive: input.isActive, updatedAt: now },
          })
        )
      );
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مالك المنصة",
        actorRole: ctx.user.role,
        organizationId: parseOptionalText(data.organizationId),
        action: input.isActive ? "user.activated" : "user.deactivated",
        entityType: "user",
        entityId: String(input.id),
      });
      return { success: true as const };
    }),

  setUserRole: platformOwnerProcedure
    .input(
      z.object({
        id: z.coerce.number().int().positive(),
        role: z.enum(["user", "admin"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveOrganizationScope(ctx.user);
      const tables = getAppwriteTablesDB();
      const databaseId = getAppwriteDatabaseId();
      const found = await tables.listRows({
        databaseId,
        tableId: "users",
        queries: [Query.equal("id", input.id), Query.limit(2)],
        total: false,
      });
      const row = found.rows[0] as unknown as AppwriteRow | undefined;
      if (
        !row ||
        found.rows.length !== 1 ||
        rowData(row).organizationId !== scope.organizationId
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "حساب المستخدم غير موجود ضمن الجهة الحالية",
        });
      }
      const data = rowData(row);
      if (
        data.isPlatformOwner === true ||
        data.authUserId === ctx.user.authUserId
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا يمكن تعديل صلاحيات مالك المنصة",
        });
      }

      const now = new Date().toISOString();
      await tables.updateRow({
        databaseId,
        tableId: "users",
        rowId: row.$id,
        data: { role: input.role, updatedAt: now },
      });
      const memberships = await tables.listRows({
        databaseId,
        tableId: "organization_memberships",
        queries: [Query.equal("userId", input.id), Query.limit(100)],
        total: false,
      });
      await Promise.all(
        memberships.rows.map(item =>
          tables.updateRow({
            databaseId,
            tableId: "organization_memberships",
            rowId: (item as unknown as AppwriteRow).$id,
            data: {
              role:
                input.role === "admin" ? "organization_admin" : "dispatcher",
              updatedAt: now,
            },
          })
        )
      );
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مالك المنصة",
        actorRole: ctx.user.role,
        organizationId: parseOptionalText(data.organizationId),
        action: "user.role_changed",
        entityType: "user",
        entityId: String(input.id),
        metadata: { role: input.role },
      });
      return { success: true as const };
    }),
});

export const workspaceRouter = router({
  contacts: contactsRouter,
  notifications: notificationsRouter,
  administration: administrationRouter,
  audit: auditRouter,
});
