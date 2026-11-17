import type { User } from "../../drizzle/schema";

export const SESSION_COOKIE = "police_telegrams_session";

export type PublicUser = Omit<User, "passwordHash">;

export function publicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

/**
 * Retained for compatibility with legacy session-version tests and migration
 * checks. Appwrite session validity is now verified by Appwrite Auth itself.
 */
export function isSessionVersionValid(
  tokenSessionVersion: unknown,
  currentSessionVersion: string,
  authUserId: string
): boolean {
  if (typeof tokenSessionVersion === "string") {
    return tokenSessionVersion === currentSessionVersion;
  }
  return currentSessionVersion === authUserId;
}
