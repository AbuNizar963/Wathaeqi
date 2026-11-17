import { createHmac } from "node:crypto";
import type { Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

type LoginRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type LoginRateLimitBucket = {
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number;
};

const WINDOW_MS = 15 * 60 * 1000;
const loginRateLimitBuckets = new Map<string, LoginRateLimitBucket>();

function hashLoginRateLimitKey(value: string): string {
  if (ENV.authSessionSecret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must contain at least 32 characters");
  }

  return createHmac("sha256", ENV.authSessionSecret)
    .update(value)
    .digest("hex");
}

function consumeLoginRateLimit(
  keyHash: string,
  maxAttempts: number,
  now = Date.now()
): LoginRateLimitResult {
  let bucket = loginRateLimitBuckets.get(keyHash);

  if (!bucket || now - bucket.windowStartedAt >= WINDOW_MS) {
    bucket = {
      attempts: 0,
      windowStartedAt: now,
      blockedUntil: 0,
    };
    loginRateLimitBuckets.set(keyHash, bucket);
  }

  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  bucket.attempts += 1;
  if (bucket.attempts > maxAttempts) {
    bucket.blockedUntil = now + WINDOW_MS;
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(WINDOW_MS / 1000),
    };
  }

  if (loginRateLimitBuckets.size > 10_000) {
    for (const [key, value] of loginRateLimitBuckets) {
      if (
        value.blockedUntil <= now &&
        now - value.windowStartedAt >= WINDOW_MS
      ) {
        loginRateLimitBuckets.delete(key);
      }
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Appwrite Auth enforces provider-side limits. This process-local account/IP
 * guard adds a short-window layer without requiring the legacy Supabase RPC.
 * Netlify instances are ephemeral, so this is defense in depth rather than
 * the durable cross-instance limiter used before the Appwrite migration.
 */
export async function enforceLoginRateLimit(
  req: Request,
  res: Response,
  username: string
): Promise<string> {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const normalizedUsername = username.trim().toLowerCase();
  const ipKeyHash = hashLoginRateLimitKey(`login:ip:${clientIp}`);
  const accountIpKeyHash = hashLoginRateLimitKey(
    `login:account-ip:${normalizedUsername}:${clientIp}`
  );

  const ipLimit = consumeLoginRateLimit(ipKeyHash, 60);
  const accountIpLimit = consumeLoginRateLimit(accountIpKeyHash, 10);

  if (!ipLimit.allowed || !accountIpLimit.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      ipLimit.allowed ? 0 : ipLimit.retryAfterSeconds,
      accountIpLimit.allowed ? 0 : accountIpLimit.retryAfterSeconds
    );
    res.setHeader("Retry-After", String(retryAfterSeconds));
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "تم تجاوز عدد محاولات تسجيل الدخول. حاول لاحقًا.",
    });
  }

  return accountIpKeyHash;
}

/** Clear only the account/IP bucket after a successful Appwrite login. */
export async function clearSuccessfulLoginRateLimit(
  accountIpKeyHash: string
): Promise<void> {
  loginRateLimitBuckets.delete(accountIpKeyHash);
}
