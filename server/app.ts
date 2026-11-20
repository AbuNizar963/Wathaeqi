import express, { type Express } from "express";
import { randomUUID } from "node:crypto";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { ownerApiRouter } from "./ownerApiRouter";
import { createContext } from "./_core/context";
import { serveStatic } from "./_core/static";
import { assertProductionEnvironment, ENV } from "./_core/env";
import { getContentSecurityPolicy } from "./_core/csp";
import { createRateLimit } from "./_core/rateLimit";
import { getAppwriteAuthenticatedUserFromRequest } from "./_core/appwriteAuth";
import { getStorageProvider } from "./_core/storageProvider";

const DOCUMENT_UPLOAD_TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

function safeUploadName(value: string): string {
  const base = value.split(/[\\/]/).pop() ?? "document";
  const cleaned = base
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._ -]+/gu, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-120);
  return cleaned || "document";
}

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
 * The retired organization-administration, notification and legacy data
 * routes are intentionally not mounted here. The active product surface is
 * the owner's document workspace and account settings.
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

  app.post(
    "/api/documents/upload",
    express.raw({ type: () => true, limit: "26mb" }),
    async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const user = await getAppwriteAuthenticatedUserFromRequest(req);
      if (!user || !user.isActive) {
        res.status(401).json({ error: "انتهت الجلسة؛ سجّل الدخول مجددًا" });
        return;
      }
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length < 1) {
        res.status(400).json({ error: "لم يصل أي ملف" });
        return;
      }
      if (body.length > 25 * 1024 * 1024) {
        res.status(413).json({ error: "الحد الأقصى لحجم الملف 25 ميغابايت" });
        return;
      }
      const rawName = req.get("x-file-name") ?? "";
      let fileName = "";
      try {
        fileName = safeUploadName(decodeURIComponent(rawName));
      } catch {
        fileName = safeUploadName(rawName);
      }
      const extension = fileName.includes(".")
        ? (fileName.split(".").pop()?.toLowerCase() ?? "")
        : "";
      const mimeType = DOCUMENT_UPLOAD_TYPES[extension];
      if (!mimeType) {
        res.status(415).json({
          error: "الصيغ المدعومة: Word (docx)، PDF، وصور PNG/JPG/WEBP",
        });
        return;
      }
      const storageKey = `documents/${user.authUserId}/${randomUUID()}-${fileName}`;
      try {
        await getStorageProvider().upload(storageKey, body, {
          contentType: mimeType,
          cacheControl: "private, max-age=0, no-store",
        });
        res.status(201).json({
          storageKey,
          fileName,
          mimeType,
          sizeBytes: body.length,
        });
      } catch (error) {
        console.error("[documents/upload] failed", error);
        res.status(502).json({ error: "تعذر حفظ الملف في مساحة التخزين" });
      }
    }
  );

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
