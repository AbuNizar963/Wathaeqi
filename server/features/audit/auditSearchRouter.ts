import { Query } from "node-appwrite";
import { z } from "zod";
import { authenticatedProcedure, router } from "../../_core/ownerTrpc";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";
import { resolveOrganizationScope } from "../organizations/organizationAccess";

const AUDIT_LOG_TABLE = "audit_logs";

type AppwriteRow = Record<string, unknown> & { $id: string };

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export const auditSearchRouter = router({
  search: authenticatedProcedure
    .input(
      z.object({
        search: z.string().trim().max(120).optional(),
        action: z.string().trim().max(80).optional(),
        entityType: z.string().trim().max(60).optional(),
        actorUserId: z.number().int().positive().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        page: z.number().int().min(1).max(100000).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveOrganizationScope(ctx.user);
      const queries: string[] = [];
      if (!scope.isOwner) {
        queries.push(Query.equal("organizationId", scope.organizationId));
      }
      if (input.action) queries.push(Query.equal("action", input.action));
      if (input.entityType) {
        queries.push(Query.equal("entityType", input.entityType));
      }
      if (input.actorUserId) {
        queries.push(Query.equal("actorUserId", input.actorUserId));
      }
      if (input.from)
        queries.push(Query.greaterThanEqual("createdAt", input.from));
      if (input.to) queries.push(Query.lessThanEqual("createdAt", input.to));
      if (input.search) {
        queries.push(Query.contains("actorName", input.search));
      }
      queries.push(Query.orderDesc("createdAt"));
      queries.push(Query.limit(input.pageSize));
      queries.push(Query.offset((input.page - 1) * input.pageSize));

      const result = await getAppwriteTablesDB().listRows({
        databaseId: getAppwriteDatabaseId(),
        tableId: AUDIT_LOG_TABLE,
        queries,
        total: true,
      });
      const items = (result.rows as AppwriteRow[]).map(row => ({
        id: row.$id,
        actorUserId: asNullableNumber(row.actorUserId),
        actorName: asNullableString(row.actorName),
        actorRole: asNullableString(row.actorRole),
        action: asString(row.action),
        entityType: asString(row.entityType),
        entityId: asNullableString(row.entityId),
        organizationId: asNullableString(row.organizationId),
        reason: asNullableString(row.reason),
        metadata: parseJson(row.metadata),
        beforeState: parseJson(row.beforeState),
        afterState: parseJson(row.afterState),
        ipAddress: asNullableString(row.ipAddress),
        createdAt: asIso(row.createdAt) ?? new Date(0).toISOString(),
      }));
      return {
        items,
        total: result.total,
        page: input.page,
        pageSize: input.pageSize,
        hasNext: input.page * input.pageSize < result.total,
        totalPages: Math.max(1, Math.ceil(result.total / input.pageSize)),
      };
    }),
});
