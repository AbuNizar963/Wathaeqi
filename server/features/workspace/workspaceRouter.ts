import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { Query } from "node-appwrite";
import { z } from "zod";
import { getAppwriteDatabaseId, getAppwriteTablesDB } from "../_core/appwrite";
import { platformOwnerProcedure, router } from "../_core/ownerTrpc";

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
  list: platformOwnerProcedure.query(async ({ ctx }) => {
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

  create: platformOwnerProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(256),
        email: z.string().trim().email().max(254).or(z.literal("")).default(""),
        phone: z.string().trim().max(32).default(""),
        organization: z.string().trim().max(256).default(""),
      })
    )
    .mutation(async ({ ctx, input }) => {
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
      return {
        id: (row as AppwriteRow).$id,
        name: String(data.name ?? input.name),
        email: parseOptionalText(data.email),
        phone: parseOptionalText(data.phone),
        organization: parseOptionalText(data.organization),
      };
    }),

  update: platformOwnerProcedure
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
      return {
        id: row.$id,
        name: String(saved.name ?? input.name),
        email: parseOptionalText(saved.email),
        phone: parseOptionalText(saved.phone),
        organization: parseOptionalText(saved.organization),
      };
    }),

  delete: platformOwnerProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .mutation(async ({ ctx, input }) => {
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
      return { success: true as const };
    }),
});

const activityRouter = router({
  list: platformOwnerProcedure.query(async () => {
    const result = await getAppwriteTablesDB().listRows({
      databaseId: getAppwriteDatabaseId(),
      tableId: "audit_logs",
      queries: [Query.orderDesc("createdAt"), Query.limit(100)],
      total: true,
    });
    return result.rows.map(row => {
      const data = rowData(row as AppwriteRow);
      return {
        id: String(data.id ?? (row as AppwriteRow).$id),
        actorName: String(data.actorName ?? "غير معروف"),
        action: String(data.action ?? ""),
        entityType: String(data.entityType ?? ""),
        entityId: parseOptionalText(data.entityId),
        metadata: safeJson(data.metadata),
        deviceType: parseOptionalText(data.deviceType),
        createdAt: String(data.createdAt ?? ""),
      };
    });
  }),
});

const administrationRouter = router({
  overview: platformOwnerProcedure.query(async () => {
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

    const users = usersResult.rows.map(row => {
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
    });
    const organizations = organizationsResult.rows.map(row => {
      const data = rowData(row as AppwriteRow);
      return {
        id: String(data.id ?? (row as AppwriteRow).$id),
        name: String(data.name ?? "جهة بدون اسم"),
        code: String(data.code ?? ""),
        type: String(data.type ?? "department"),
        isActive: data.isActive !== false,
        parentOrganizationId: parseOptionalText(data.parentOrganizationId),
      };
    });
    return {
      users,
      organizations,
      totals: {
        users: usersResult.total,
        activeUsers: users.filter(user => user.isActive).length,
        organizations: organizationsResult.total,
        activeOrganizations: organizations.filter(item => item.isActive).length,
      },
    };
  }),
});

export const workspaceRouter = router({
  contacts: contactsRouter,
  activity: activityRouter,
  administration: administrationRouter,
});
