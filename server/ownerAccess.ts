import { ENV } from "./_core/env";
import { getAppwriteProfileById } from "./_core/appwriteAuth";

export interface OwnerIdentity {
  role?: string | null;
  username?: string | null;
  isPlatformOwner?: boolean | null;
}

/** Prefer the persisted Appwrite owner flag, retaining the configured bootstrap identity. */
export function isPlatformOwner(
  user: OwnerIdentity | null | undefined
): boolean {
  if (user?.isPlatformOwner === true && user.role === "admin") return true;

  const configuredOwner = ENV.ownerUsername.trim().toLowerCase();
  return (
    user?.role === "admin" &&
    typeof user.username === "string" &&
    user.username.trim().toLowerCase() === configuredOwner
  );
}

export async function isPlatformOwnerUserId(userId: number): Promise<boolean> {
  const profile = await getAppwriteProfileById(userId);
  return isPlatformOwner(profile?.user ?? null);
}
