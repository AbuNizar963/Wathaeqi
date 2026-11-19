import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import type { Request } from "express";
import type { User } from "./user";
import { getAppwriteAuthenticatedUserFromRequest } from "./appwriteAuth";

export const SESSION_COOKIE = "police_telegrams_session";
export type PublicUser = Omit<User, "passwordHash">;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export function publicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

/**
 * Legacy password-hash utilities remain for the organization/user-management
 * workflows until their account provisioning is migrated to Appwrite Auth.
 * They are no longer used for interactive web login.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, 64, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string
): Promise<boolean> {
  if (typeof encodedHash !== "string" || encodedHash.length > 256) return false;

  const parts = encodedHash.split("$");
  if (parts.length !== 6) return false;

  const [algorithm, n, r, p, saltText, hashText] = parts;
  if (
    algorithm !== "scrypt" ||
    n !== String(SCRYPT_N) ||
    r !== String(SCRYPT_R) ||
    p !== String(SCRYPT_P) ||
    !saltText ||
    !hashText
  ) {
    return false;
  }

  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(hashText, "base64url");
  if (
    salt.length !== 16 ||
    expected.length !== 64 ||
    salt.toString("base64url") !== saltText ||
    expected.toString("base64url") !== hashText
  ) {
    return false;
  }

  try {
    const derived = await deriveKey(password, salt, expected.length, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    });
    return (
      derived.length === expected.length && timingSafeEqual(derived, expected)
    );
  } catch {
    return false;
  }
}

export async function getAuthenticatedUserFromRequest(
  req: Request
): Promise<PublicUser | null> {
  const user = await getAppwriteAuthenticatedUserFromRequest(req);
  return user ? publicUser(user) : null;
}

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
