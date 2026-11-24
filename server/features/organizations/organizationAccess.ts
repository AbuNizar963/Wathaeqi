import { TRPCError } from "@trpc/server";
import type { PublicUser } from "../../_core/auth";
import { isPlatformOwner } from "../../ownerAccess";
import { getUserOrganizationMembership } from "./appwriteOwnerOrganizationRepository";
import { getOrganizationByCode } from "./organizationService";

/** Roles allowed to act on documents owned by their active organization. */
const ORGANIZATION_ACTOR_ROLES = [
  "system_admin",
  "organization_admin",
  "regional_admin",
  "reviewer",
  "dispatcher",
] as const;

/** Stable code of the only organization enabled in this installation. */
const FIXED_ORGANIZATION_CODE = "ALSHAHBAA";

/** Roles allowed to administrate organization settings and documents. */
const ORGANIZATION_ADMIN_ROLES = [
  "system_admin",
  "organization_admin",
  "regional_admin",
] as const;

export type OrganizationScope = {
  userId: number;
  organizationId: string;
  role: string;
  isOwner: boolean;
  /** Only the one fixed organization is in scope for every account. */
  organizationIds: string[] | null;
  canManage: boolean;
  canAdministrate: boolean;
};

function roleCanAct(role: string): boolean {
  return (ORGANIZATION_ACTOR_ROLES as readonly string[]).includes(role);
}

function roleCanAdministrate(role: string): boolean {
  return (ORGANIZATION_ADMIN_ROLES as readonly string[]).includes(role);
}

export async function resolveOrganizationScope(
  user: PublicUser
): Promise<OrganizationScope> {
  const [membership, fixedOrganization] = await Promise.all([
    getUserOrganizationMembership(user.id),
    getOrganizationByCode(FIXED_ORGANIZATION_CODE),
  ]);
  const isOwner = isPlatformOwner(user);
  if (!fixedOrganization) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "تعذر تحديد الجهة الثابتة للنظام. يرجى مراجعة إعدادات المنصة.",
    });
  }
  if (
    !isOwner &&
    (!membership?.isActive ||
      membership.organizationId !== fixedOrganization.id)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "يجب أن يكون حسابك مرتبطاً بقسم شرطة الشهباء للوصول إلى الوثائق.",
    });
  }
  const organizationId = fixedOrganization.id;

  const role =
    membership?.organizationId === organizationId
      ? membership.role
      : isOwner
        ? "system_admin"
        : "member";
  const canManage = isOwner || roleCanAct(role);
  const canAdministrate = isOwner || roleCanAdministrate(role);

  // Every account is scoped to the one configured organization, never to a
  // membership-selected organization or a descendant in the old hierarchy.
  const organizationIds = [organizationId];

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
