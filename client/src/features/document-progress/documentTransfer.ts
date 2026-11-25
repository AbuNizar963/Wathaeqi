import { appwriteApiUrl } from "@/lib/appwriteApi";
import { fetchWithSession } from "@/lib/trpcFetch";
import { fileKind } from "../document-library/types";
import {
  measuredProgress,
  throwIfAborted,
  type DocumentOperationOptions,
} from "./documentProgress";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Only our API receives a Bearer token. Signed storage links never receive it. */
export function resolveDocumentRequest(source: string): {
  url: string;
  authenticated: boolean;
} {
  const locationBase =
    globalThis.location?.href ??
    window.location.href ??
    `${window.location.origin}/`;
  const base =
    new URL(locationBase).origin === "null"
      ? "https://wathaeqi.invalid/"
      : locationBase;
  const sourceUrl = new URL(source, base);
  const applicationOrigin = new URL(base).origin;
  const apiBase = new URL(appwriteApiUrl("/api/"), base);
  const secureApi =
    apiBase.protocol === "https:" ||
    (apiBase.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(apiBase.hostname));
  if (sourceUrl.username || sourceUrl.password || !secureApi)
    throw new Error("عنوان الملف غير آمن أو غير صالح");
  if (
    sourceUrl.origin === applicationOrigin &&
    sourceUrl.pathname.startsWith("/api/")
  ) {
    const url = appwriteApiUrl(`${sourceUrl.pathname}${sourceUrl.search}`);
    return { url, authenticated: true };
  }
  if (
    sourceUrl.origin === apiBase.origin &&
    sourceUrl.pathname.startsWith(apiBase.pathname)
  ) {
    return { url: sourceUrl.href, authenticated: true };
  }
  // Data/owned Blob URLs are local rendering inputs, not network destinations.
  const local =
    sourceUrl.protocol === "blob:" && sourceUrl.origin === applicationOrigin;
  const dataFile =
    /^data:(?:application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|image\/(?:png|jpeg|webp));base64,/i.test(
      source
    );
  if (
    sourceUrl.username ||
    sourceUrl.password ||
    (!local && !dataFile && sourceUrl.protocol !== "https:")
  ) {
    throw new Error("عنوان الملف غير آمن أو غير صالح");
  }
  return { url: sourceUrl.href, authenticated: false };
}

export async function fetchDocumentBlob(
  source: string,
  fileName: string,
  options: DocumentOperationOptions = {}
): Promise<Blob> {
  throwIfAborted(options.signal);
  options.onProgress?.({
    phase: "preparation",
    message: "جارٍ التحقق من رابط الملف…",
  });
  const request = resolveDocumentRequest(source);
  const init: RequestInit = {
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    signal: options.signal,
  };
  let response: Response;
  try {
    response = await (request.authenticated
      ? fetchWithSession(request.url, init)
      : fetch(request.url, init));
  } catch (error) {
    throwIfAborted(options.signal);
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error("تعذر الاتصال لتنزيل الملف؛ أعد المحاولة");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(
      response.status === 401 || response.status === 403
        ? "تعذر تنزيل الملف؛ تحقق من الجلسة والصلاحيات"
        : "تعذر تنزيل الملف"
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!fileKind(fileName, contentType)) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("تعذر تنزيل الملف: نوع الاستجابة غير صالح");
  }
  const rawLength = response.headers.get("content-length");
  const parsedLength =
    rawLength && /^\d+$/.test(rawLength) ? Number(rawLength) : undefined;
  // Fetch decodes compressed bodies; encoded Content-Length is not a byte total.
  const encoding = response.headers.get("content-encoding");
  const total =
    (!encoding || encoding === "identity") &&
    Number.isSafeInteger(parsedLength) &&
    parsedLength! > 0
      ? parsedLength
      : undefined;
  if (total !== undefined && total > MAX_FILE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("حجم الملف يتجاوز الحد المسموح");
  }
  options.onProgress?.(
    measuredProgress("transfer", "جارٍ تنزيل بيانات الملف…", 0, total)
  );
  let loaded = 0;
  const chunks: ArrayBuffer[] = [];
  const reader = response.body?.getReader();
  const abort = () => {
    void reader?.cancel().catch(() => undefined);
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    if (reader) {
      while (true) {
        throwIfAborted(options.signal);
        const { done, value } = await reader.read();
        throwIfAborted(options.signal);
        if (done) break;
        loaded += value.byteLength;
        if (loaded > MAX_FILE_BYTES || (total !== undefined && loaded > total))
          throw new Error("بيانات الملف غير متطابقة");
        chunks.push(value.slice().buffer);
        options.onProgress?.(
          measuredProgress(
            "transfer",
            "جارٍ تنزيل بيانات الملف…",
            loaded,
            total
          )
        );
      }
    } else {
      const buffer = await response.arrayBuffer();
      throwIfAborted(options.signal);
      loaded = buffer.byteLength;
      chunks.push(buffer);
    }
    if (
      loaded === 0 ||
      loaded > MAX_FILE_BYTES ||
      (total !== undefined && loaded !== total)
    )
      throw new Error("بيانات الملف ناقصة أو غير متطابقة");
    options.onProgress?.(
      measuredProgress("transfer", "اكتمل تنزيل بيانات الملف", loaded, total)
    );
    return new Blob(chunks, { type: contentType });
  } catch (error) {
    await reader?.cancel().catch(() => undefined);
    throwIfAborted(options.signal);
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error("تعذر تنزيل الملف كاملاً؛ أعد المحاولة");
  } finally {
    options.signal?.removeEventListener("abort", abort);
    reader?.releaseLock();
  }
}
