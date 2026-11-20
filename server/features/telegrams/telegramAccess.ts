import { TRPCError } from "@trpc/server";
import type { PublicUser } from "../../_core/auth";
import { isPlatformOwner } from "../../ownerAccess";
import {
  TELEGRAM_ACTOR_ROLES,
  TELEGRAM_ADMIN_ROLES,
  type TelegramRecord,
} from "../../../shared/telegrams";
import { getUserOrganizationMembership } from "../organizations/appwriteOwnerOrganizationRepository";
import { listOrganizationDescendants } from "../organizations/organizationService";

export type TelegramScope = {
  userId: number;
  organizationId: string;
  role: string;
  isOwner: boolean;
  /** null means the platform owner can read every organization. */
  organizationIds: string[] | null;
  canManage: boolean;
  canAdministrate: boolean;
};

function roleCanAct(role: string): boolean {
  return (TELEGRAM_ACTOR_ROLES as readonly string[]).includes(role);
}

function roleCanAdministrate(role: string): boolean {
  return (TELEGRAM_ADMIN_ROLES as readonly string[]).includes(role);
}

export async function resolveTelegramScope(
  user: PublicUser
): Promise<TelegramScope> {
  const membership = await getUserOrganizationMembership(user.id);
  const isOwner = isPlatformOwner(user);
  const organizationId = membership?.organizationId ?? user.organizationId;
  if (!organizationId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "حسابك غير مرتبط بجهة عمل. راجع مالك المنصة.",
    });
  }
  if (!membership?.isActive && !isOwner) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "يجب أن تكون لديك عضوية نشطة في جهة العمل للوصول إلى البرقيات.",
    });
  }

  const role = membership?.role ?? (isOwner ? "system_admin" : "member");
  const canManage = isOwner || roleCanAct(role);
  const canAdministrate = isOwner || roleCanAdministrate(role);

  let organizationIds: string[] | null = null;
  if (!isOwner) {
    const descendants =
      role === "regional_admin" || role === "organization_admin"
        ? await listOrganizationDescendants(organizationId, {
            activeOnly: true,
          })
        : [];
    organizationIds = [organizationId, ...descendants.map(item => item.id)];
  }

  return {
    userId: user.id,
    organizationId,
    role,
    isOwner,
    organizationIds,
    canManage,
    canAdministrate,
  };
}

export function isTelegramVisible(
  scope: TelegramScope,
  telegram: TelegramRecord
): boolean {
  if (!scope.organizationIds) return true;
  return (
    scope.organizationIds.includes(telegram.currentOrganizationId) ||
    scope.organizationIds.includes(telegram.organizationId)
  );
}

export function assertTelegramVisible(
  scope: TelegramScope,
  telegram: TelegramRecord
): void {
  if (!isTelegramVisible(scope, telegram)) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "البرقية غير موجودة",
    });
  }
}

/** A user may act only on a telegram currently sitting in their own organization. */
export function assertTelegramActionable(
  scope: TelegramScope,
  telegram: TelegramRecord
): void {
  assertTelegramVisible(scope, telegram);
  if (!scope.canManage) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "لا تملك صلاحية تنفيذ إجراءات على البرقيات في هذه الجهة.",
    });
  }
  if (telegram.currentOrganizationId !== scope.organizationId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "البرقية ليست في جهة عملك الحالية؛ لا يمكنك تعديلها أو تحويلها.",
    });
  }
}
