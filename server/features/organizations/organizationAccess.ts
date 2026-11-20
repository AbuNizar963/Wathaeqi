import { TRPCError } from "@trpc/server";
import type { PublicUser } from "../../_core/auth";
import { isPlatformOwner } from "../../ownerAccess";
import { getUserOrganizationMembership } from "./appwriteOwnerOrganizationRepository";
import { listOrganizationDescendants } from "./organizationService";

/** Roles allowed to act on documents owned by their active organization. */
const ORGANIZATION_ACTOR_ROLES = [
  "system_admin",
  "organization_admin",
  "regional_admin",
  "reviewer",
  "dispatcher",
] as const;

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
  /** null means the platform owner can read every organization. */
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
      message: "يجب أن تكون لديك عضوية نشطة في جهة العمل للوصول إلى الوثائق.",
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
