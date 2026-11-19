import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { ownerApiRouter } from "./ownerApiRouter";
import { createContext } from "./_core/context";
import { serveStatic } from "./_core/static";
import { assertProductionEnvironment, ENV } from "./_core/env";
import { getContentSecurityPolicy } from "./_core/csp";
import { createRateLimit } from "./_core/rateLimit";

function isSameOriginRequest(req: express.Request): boolean {
  const origin = req.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === req.get("host");
    } catch {
      return false;
    }
  }

  const referer = req.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === req.get("host");
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Creates the Appwrite-backed Wathaeqi owner application.
 *
 * The former Telegram, organization-administration, notification and
 * legacy data routes are intentionally not mounted here. The active
 * product surface is the owner's document workspace and account settings.
 */
export function createApp(
  options: { productionStatic?: boolean } = {}
): Express {
  assertProductionEnvironment();

  const app = express();
  app.set("trust proxy", ENV.isProduction ? 1 : false);
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    const csp = getContentSecurityPolicy(ENV.isProduction);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (ENV.isProduction) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains"
      );
    }
    res.setHeader(csp.header, csp.value);

    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
      req.path.startsWith("/api/") &&
      !isSameOriginRequest(req)
    ) {
      res.status(403).json({ error: "الطلب غير صالح لمصدر خارجي" });
      return;
    }

    next();
  });

  app.use(
    "/api",
    createRateLimit({
      windowMs: 60_000,
      maxRequests: 180,
      message: "طلبات كثيرة إلى واجهة النظام؛ أعد المحاولة لاحقًا",
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "64kb", extended: false }));

  app.get("/api/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      ok: true,
      service: "wathaeqi-owner-api",
      auth: "appwrite-auth",
      database: "appwrite",
      timestamp: new Date().toISOString(),
    });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: ownerApiRouter,
      createContext,
    })
  );

  if (options.productionStatic) {
    serveStatic(app);
  }

  return app;
}
