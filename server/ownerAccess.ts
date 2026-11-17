import { getAppwriteProfileById } from "./_core/appwriteAuth";

export interface OwnerIdentity {
  role?: string | null;
  username?: string | null;
  isPlatformOwner?: boolean | null;
}

/** Owner-only operations must match the persisted owner flag and admin role. */
export function isPlatformOwner(
  user: OwnerIdentity | null | undefined
): boolean {
  return user?.isPlatformOwner === true && user.role === "admin";
}

export async function isPlatformOwnerUserId(userId: number): Promise<boolean> {
  const profile = await getAppwriteProfileById(userId);
  return isPlatformOwner(profile?.user ?? null);
}
