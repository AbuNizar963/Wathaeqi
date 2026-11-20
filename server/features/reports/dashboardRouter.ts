import { Query } from "node-appwrite";
import { z } from "zod";
import { authenticatedProcedure, router } from "../../_core/ownerTrpc";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";
import { resolveTelegramScope } from "../telegrams/telegramAccess";
import { listTelegrams } from "../telegrams/telegramRepository";
import { listOrganizations } from "../organizations/organizationService";
import { countUnreadNotifications } from "../notifications/notificationService";
import { listIncomingRoutes } from "../telegrams/telegramRepository";
import {
  TELEGRAM_CATEGORY_LABELS,
  TELEGRAM_PRIORITY_LABELS,
  TELEGRAM_STATUS_LABELS,
  type TelegramCategory,
  type TelegramPriority,
  type TelegramRecord,
  type TelegramStatus,
} from "../../../shared/telegrams";

async function countRows(tableId: string, queries: string[]): Promise<number> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId,
    queries: [...queries, Query.limit(1)],
    total: true,
  });
  return result.total;
}

function monthKey(value: string): string {
  return value.slice(0, 7);
}

function groupCount(
  telegrams: readonly TelegramRecord[],
  groupBy: "status" | "category" | "priority" | "month"
): Array<{ key: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const telegram of telegrams) {
    const key =
      groupBy === "month"
        ? monthKey(telegram.createdAt)
        : String(telegram[groupBy]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const label = (key: string): string => {
    if (groupBy === "status") {
      return TELEGRAM_STATUS_LABELS[key as TelegramStatus] ?? key;
    }
    if (groupBy === "category") {
      return TELEGRAM_CATEGORY_LABELS[key as TelegramCategory] ?? key;
    }
    if (groupBy === "priority") {
      return TELEGRAM_PRIORITY_LABELS[key as TelegramPriority] ?? key;
    }
    return key;
  };
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: label(key), count }))
    .sort((left, right) =>
      groupBy === "month"
        ? left.key.localeCompare(right.key)
        : right.count - left.count
    );
}

export const dashboardRouter = router({
  stats: authenticatedProcedure.query(async ({ ctx }) => {
    const scope = await resolveTelegramScope(ctx.user);
    const [telegrams, organizations, unread, routes] = await Promise.all([
      listTelegrams(scope.organizationIds, { page: 1, pageSize: 10 }),
      listOrganizations(false),
      countUnreadNotifications(ctx.user.id),
      listIncomingRoutes(scope.organizationId),
    ]);
    const pendingRoutes = routes.filter(
      route => route.receiverDecisionStatus === "pending"
    );
    return {
      organizationId: scope.organizationId,
      role: scope.role,
      isOwner: scope.isOwner,
      telegramStats: telegrams.stats,
      totalTelegrams: telegrams.total,
      recentTelegrams: telegrams.items.slice(0, 5),
      organizationsCount: scope.organizationIds
        ? scope.organizationIds.length
        : organizations.length,
      unreadNotifications: unread,
      pendingIncomingRoutes: pendingRoutes.length,
      pendingRoutes: pendingRoutes.slice(0, 5),
      openTelegrams: telegrams.stats.open,
      urgentTelegrams: telegrams.stats.urgent,
      total: telegrams.total,
      today: 0,
      todayUrgent: telegrams.stats.urgent,
      todayIncoming: 0,
      inProgress: telegrams.stats.byStatus.in_progress ?? 0,
      resolved:
        (telegrams.stats.byStatus.resolved ?? 0) +
        (telegrams.stats.byStatus.completed ?? 0),
      incoming: 0,
      outgoing: telegrams.total,
      urgentAwaitingReceipt: pendingRoutes.length,
    };
  }),

  ownerSummary: authenticatedProcedure.query(async ({ ctx }) => {
    const scope = await resolveTelegramScope(ctx.user);
    if (!scope.isOwner) {
      return { allowed: false as const };
    }
    const [telegrams, users, organizations, auditEntries] = await Promise.all([
      listTelegrams(null, { page: 1, pageSize: 1 }),
      countRows("users", []),
      countRows("organizations", [Query.equal("isActive", true)]),
      countRows("audit_logs", []),
    ]);
    return {
      allowed: true as const,
      totalTelegrams: telegrams.total,
      telegramStats: telegrams.stats,
      users,
      organizations,
      auditEntries,
    };
  }),

  reports: authenticatedProcedure
    .input(
      z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        groupBy: z
          .enum(["status", "category", "priority", "month"])
          .default("status"),
      })
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveTelegramScope(ctx.user);
      const telegrams = await listTelegrams(scope.organizationIds, {
        from: input.from,
        to: input.to,
        page: 1,
        pageSize: 100,
      });
      return {
        total: telegrams.total,
        stats: telegrams.stats,
        series: groupCount(telegrams.items, input.groupBy),
        generatedAt: new Date().toISOString(),
      };
    }),
});
