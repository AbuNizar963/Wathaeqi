import express, { type Express, type RequestHandler } from "express";
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
import {
  createOfficialDocument,
  getOfficialDocument,
} from "./features/document-studio/documentStudioRepository";
import { getUserOrganizationMembership } from "./features/organizations/appwriteOwnerOrganizationRepository";
import {
  getOrganizationLogoUrl,
  saveOrganizationLogo,
} from "./features/organizations/organizationService";
import { resolveOrganizationScope } from "./features/organizations/organizationAccess";
import { isPlatformOwner } from "./ownerAccess";
import { z } from "zod";
import {
  getAllowedDocumentMimeType,
  isValidDocumentFile,
  isSafeDocumentStorageKey,
  MAX_DOCUMENT_UPLOAD_BYTES,
} from "./features/document-studio/documentUploadValidation";

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

const uploadMetadataSchema = z.object({
  title: z.string().trim().min(1).max(256),
  category: z.string().trim().min(1).max(100),
  subject: z.string().trim().max(256).default(""),
  documentDate: z.string().datetime(),
  pageCount: z.number().int().min(0).max(5000).default(0),
});

function parseUploadMetadata(value: string | undefined) {
  if (!value || value.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.byteLength(decoded, "utf8") > 6144) return null;
    const parsed = uploadMetadataSchema.safeParse(JSON.parse(decoded));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function isDefinitiveDocumentCreateRejection(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  const status = Number((error as { code?: unknown }).code);
  return (
    Number.isInteger(status) && status >= 400 && status < 500 && status !== 408
  );
}

function isSameOriginRequest(req: express.Request): boolean {
  const origin = req.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === `${req.protocol}://${req.get("host")}`;
    } catch {
      return false;
    }
  }

  const referer = req.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === `${req.protocol}://${req.get("host")}`;
    } catch {
      return false;
    }
  }

  return true;
}

const requireActiveAppwriteUser: RequestHandler = async (req, res, next) => {
  try {
    const user = await getAppwriteAuthenticatedUserFromRequest(req);
    if (!user || !user.isActive) {
      res.status(401).json({ error: "انتهت الجلسة؛ سجّل الدخول مجددًا" });
      return;
    }
    res.locals.appwriteUser = user;
    next();
  } catch {
    console.warn("[documents/auth] session validation failed");
    res
      .status(401)
      .json({ error: "تعذر التحقق من الجلسة؛ سجّل الدخول مجددًا" });
  }
};

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

  app.put(
    "/api/storage/department-logo",
    createRateLimit({
      windowMs: 60_000,
      maxRequests: 10,
      message: "محاولات رفع كثيرة؛ أعد المحاولة بعد قليل",
    }),
    requireActiveAppwriteUser,
    express.raw({ type: () => true, limit: "3mb" }),
    async (req, res) => {
      res.setHeader("Cache-Control", "private, no-store");
      const organizationId = req.get("x-organization-id")?.trim() ?? "";
      if (!organizationId || organizationId.length > 36) {
        res.status(400).json({ error: "معرّف الجهة غير صالح" });
        return;
      }

      const contentType = req.get("content-type")?.split(";")[0]?.trim();
      if (contentType !== "image/png" && contentType !== "image/jpeg") {
        res.status(415).json({ error: "صيغة الشعار يجب أن تكون PNG أو JPG" });
        return;
      }

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length < 1) {
        res.status(400).json({ error: "لم يصل ملف الشعار" });
        return;
      }
      if (body.length > 2_500_000) {
        res.status(413).json({
          error: "حجم الشعار بعد التجهيز يجب ألا يتجاوز 2.5 ميغابايت",
        });
        return;
      }

      const isPng =
        body.length >= 8 &&
        body
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const isJpeg =
        body.length >= 3 &&
        body[0] === 0xff &&
        body[1] === 0xd8 &&
        body[2] === 0xff;
      if (
        (contentType === "image/png" && !isPng) ||
        (contentType === "image/jpeg" && !isJpeg)
      ) {
        res.status(415).json({ error: "محتوى الصورة لا يطابق صيغتها" });
        return;
      }

      const user = res.locals.appwriteUser as NonNullable<
        Awaited<ReturnType<typeof getAppwriteAuthenticatedUserFromRequest>>
      >;
      try {
        if (!isPlatformOwner(user)) {
          const scope = await resolveOrganizationScope(user);
          if (
            !scope.canAdministrate ||
            scope.organizationId !== organizationId
          ) {
            res.status(403).json({
              error: "رفع شعار الجهة متاح لمالك المنصة أو مدير الجهة المخوّل فقط",
            });
            return;
          }
        }

        const key = await saveOrganizationLogo(
          organizationId,
          body,
          contentType
        );
        const url = await getOrganizationLogoUrl(organizationId);
        if (!url) {
          res.status(502).json({
            error: "تم حفظ الشعار لكن تعذر إنشاء رابط المعاينة",
          });
          return;
        }
        res.status(200).json({ key, url });
      } catch (error) {
        console.error("[organizations/logo] upload failed");
        const message =
          error instanceof Error && error.message.includes("غير مرتبط")
            ? error.message
            : "تعذر حفظ شعار الجهة";
        res.status(502).json({ error: message });
      }
    }
  );

  app.post(
    "/api/documents/upload",
    createRateLimit({
      windowMs: 60_000,
      maxRequests: 10,
      message: "محاولات رفع كثيرة؛ أعد المحاولة بعد قليل",
    }),
    requireActiveAppwriteUser,
    express.raw({ type: () => true, limit: "26mb" }),
    async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      if (!req.is("application/octet-stream")) {
        res.status(415).json({ error: "يجب إرسال الملف كبيانات ثنائية" });
        return;
      }
      const user = res.locals.appwriteUser as NonNullable<
        Awaited<ReturnType<typeof getAppwriteAuthenticatedUserFromRequest>>
      >;
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length < 1) {
        res.status(400).json({ error: "لم يصل أي ملف" });
        return;
      }
      if (body.length > MAX_DOCUMENT_UPLOAD_BYTES) {
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
      const mimeType = getAllowedDocumentMimeType(fileName);
      if (!mimeType) {
        res.status(415).json({
          error: "الصيغ المدعومة: Word (docx)، PDF، وصور PNG/JPG/WEBP",
        });
        return;
      }
      if (!(await isValidDocumentFile(body, fileName))) {
        res.status(415).json({
          error: "محتوى الملف لا يطابق امتداده أو أنه تالف",
        });
        return;
      }
      const metadata = parseUploadMetadata(req.get("x-document-metadata"));
      if (!metadata) {
        res.status(400).json({ error: "بيانات الوثيقة غير صالحة" });
        return;
      }
      const storageKey = `documents/${user.authUserId}/${randomUUID()}-${fileName}`;
      const documentId = randomUUID();
      const storage = getStorageProvider();
      let uploadAttempted = false;
      let uploaded = false;
      let recordCreationAttempted = false;
      try {
        uploadAttempted = true;
        await storage.upload(storageKey, body, {
          contentType: mimeType,
          cacheControl: "private, max-age=0, no-store",
        });
        uploaded = true;
        const membership = await getUserOrganizationMembership(user.id);
        recordCreationAttempted = true;
        const created = await createOfficialDocument(
          user.authUserId,
          {
            title: metadata.title,
            category: metadata.category,
            subject: metadata.subject,
            content: { type: "doc", content: [{ type: "paragraph" }] },
            fieldValues: {},
            documentDate: metadata.documentDate,
            organizationId: membership?.isActive
              ? membership.organizationId
              : null,
            templateId: null,
            templateRevision: null,
            templateFieldsSnapshot: [],
            file: {
              storageKey,
              fileName,
              mimeType,
              sizeBytes: body.length,
              pageCount: metadata.pageCount,
            },
          },
          documentId
        );
        const publicFile: Partial<NonNullable<typeof created.file>> = {
          ...(created.file ?? {
            storageKey,
            fileName,
            mimeType,
            sizeBytes: body.length,
            pageCount: metadata.pageCount,
          }),
        };
        delete publicFile.storageKey;
        res.status(201).json({
          ...created,
          file: publicFile,
        });
      } catch (error) {
        let shouldDeleteUploadedFile =
          uploadAttempted && !recordCreationAttempted;
        if (uploaded && recordCreationAttempted) {
          let recoveredRecordFound = false;
          try {
            const recovered = await getOfficialDocument(
              user.authUserId,
              documentId
            );
            if (recovered?.file?.storageKey === storageKey) {
              recoveredRecordFound = true;
              const recoveredFile: Partial<NonNullable<typeof recovered.file>> =
                {
                  ...recovered.file,
                };
              delete recoveredFile.storageKey;
              res.status(201).json({ ...recovered, file: recoveredFile });
              return;
            }
          } catch {
            console.error(
              "[documents/upload] record reconciliation failed; storage object retained"
            );
          }
          if (!recoveredRecordFound) {
            shouldDeleteUploadedFile =
              isDefinitiveDocumentCreateRejection(error);
          }
        }
        if (shouldDeleteUploadedFile) {
          try {
            await storage.remove?.(storageKey);
          } catch {
            console.error("[documents/upload] unlinked file cleanup failed");
          }
        } else if (uploaded && recordCreationAttempted) {
          console.error(
            "[documents/upload] record creation result uncertain; storage object retained"
          );
        }
        console.error("[documents/upload] save operation failed");
        res.status(502).json({ error: "تعذر حفظ الوثيقة في المكتبة" });
      }
    }
  );

  app.use(
    "/api/documents/upload",
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) {
        next(error);
        return;
      }
      const status =
        error && typeof error === "object" && "status" in error
          ? Number((error as { status?: unknown }).status)
          : 0;
      if (status === 413) {
        res.status(413).json({ error: "الحد الأقصى لحجم الملف 25 ميغابايت" });
        return;
      }
      res.status(400).json({ error: "تعذر قراءة بيانات الملف" });
    }
  );

  app.post(
    "/api/documents/:documentId/print-pdf",
    createRateLimit({
      windowMs: 60_000,
      maxRequests: 6,
      message: "محاولات تحويل كثيرة؛ أعد المحاولة بعد قليل",
    }),
    requireActiveAppwriteUser,
    async (req, res) => {
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      const user = res.locals.appwriteUser as NonNullable<
        Awaited<ReturnType<typeof getAppwriteAuthenticatedUserFromRequest>>
      >;
      const rawDocumentId = req.params.documentId;
      const documentId = typeof rawDocumentId === "string" ? rawDocumentId : "";
      if (!/^[A-Za-z0-9._-]{1,36}$/.test(documentId)) {
        res.status(400).json({ error: "معرّف الوثيقة غير صالح" });
        return;
      }

      let document: Awaited<ReturnType<typeof getOfficialDocument>>;
      try {
        document = await getOfficialDocument(user.authUserId, documentId);
      } catch {
        res.status(502).json({ error: "تعذر التحقق من صلاحية الوثيقة" });
        return;
      }
      if (!document) {
        res.status(404).json({ error: "الوثيقة غير موجودة" });
        return;
      }
      const file = document.file;
      const expectedMimeType = file
        ? getAllowedDocumentMimeType(file.fileName)
        : null;
      const isPdf = expectedMimeType === "application/pdf";
      if (
        !file ||
        !isPdf ||
        file.mimeType !== expectedMimeType ||
        !isSafeDocumentStorageKey(
          file.storageKey,
          user.authUserId,
          file.fileName
        )
      ) {
        res.status(415).json({
          error:
            "مسار PDF الأصلي متاح لملفات PDF فقط؛ اطبع ملف Word من معاينة DOCX",
        });
        return;
      }

      let stored: { body: Buffer; contentType: string };
      try {
        const storage = getStorageProvider();
        const info = await storage.getObjectInfo(file.storageKey);
        if (
          !Number.isSafeInteger(info.size) ||
          info.size < 1 ||
          info.size > MAX_DOCUMENT_UPLOAD_BYTES ||
          info.size !== file.sizeBytes ||
          info.contentType !== file.mimeType
        ) {
          res.status(409).json({ error: "بيانات الملف المخزن غير متطابقة" });
          return;
        }
        stored = await storage.download(file.storageKey);
      } catch {
        res.status(502).json({ error: "تعذر قراءة الملف من مساحة التخزين" });
        return;
      }
      if (
        stored.body.length !== file.sizeBytes ||
        !(await isValidDocumentFile(stored.body, file.fileName))
      ) {
        res.status(415).json({ error: "الملف تالف أو غير صالح للطباعة" });
        return;
      }

      res.status(200);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${safeUploadName(file.fileName)}"`
      );
      res.setHeader("Content-Length", String(stored.body.length));
      res.end(stored.body);
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
