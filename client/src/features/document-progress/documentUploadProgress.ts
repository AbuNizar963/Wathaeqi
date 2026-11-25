import { getSessionToken } from "@/lib/sessionToken";
import { resolveDocumentRequest } from "./documentTransfer";
import {
  measuredProgress,
  throwIfAborted,
  type DocumentOperationOptions,
} from "./documentProgress";

/** XHR reports real uploaded bytes; fetch does not expose upload progress. */
export function uploadDocumentWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  options: DocumentOperationOptions = {}
): Promise<{ id: string }> {
  throwIfAborted(options.signal);
  const request = resolveDocumentRequest(url);
  if (!request.authenticated) throw new Error("وجهة رفع الوثيقة غير مسموحة");
  options.onProgress?.({
    phase: "preparation",
    message: "جارٍ تجهيز الرفع الآمن…",
  });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const cleanup = () => {
      options.signal?.removeEventListener("abort", abort);
      xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null;
      xhr.upload.onprogress = xhr.upload.onload = null;
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = () => {
      xhr.abort();
      fail(new DOMException("تم إلغاء الرفع", "AbortError"));
    };
    xhr.open("POST", request.url);
    xhr.withCredentials = false;
    xhr.timeout = 120000;
    const token = getSessionToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    Object.entries(headers).forEach(([name, value]) =>
      xhr.setRequestHeader(name, value)
    );
    xhr.upload.onprogress = event => {
      if (!settled)
        options.onProgress?.(
          measuredProgress(
            "transfer",
            "جارٍ رفع بيانات الملف…",
            event.loaded,
            event.lengthComputable ? event.total : undefined
          )
        );
    };
    xhr.upload.onload = () => {
      if (!settled)
        options.onProgress?.({
          phase: "preparation",
          message: "اكتمل إرسال الملف؛ جارٍ تحقق الخادم وحفظ الوثيقة…",
          stagePercent: 50,
        });
    };
    xhr.onload = () => {
      if (settled) return;
      if (options.signal?.aborted) {
        abort();
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        fail(
          new Error(
            xhr.status === 401 || xhr.status === 403
              ? "تعذر رفع الوثيقة؛ تحقق من الجلسة والصلاحيات"
              : "تعذر رفع الوثيقة"
          )
        );
        return;
      }
      let result: unknown;
      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        fail(new Error("استجابة رفع الوثيقة غير صالحة"));
        return;
      }
      const id =
        result && typeof result === "object" && "id" in result
          ? (result as { id: unknown }).id
          : null;
      if (typeof id !== "string" || !/^[A-Za-z0-9._-]{1,36}$/.test(id)) {
        fail(new Error("تعذر تأكيد حفظ الوثيقة"));
        return;
      }
      settled = true;
      cleanup();
      options.onProgress?.({
        phase: "ready",
        message: "أكد الخادم حفظ الوثيقة",
      });
      resolve({ id });
    };
    xhr.onerror = () => fail(new Error("تعذر الاتصال لرفع الوثيقة"));
    xhr.ontimeout = () =>
      fail(new Error("انتهت مهلة رفع الوثيقة؛ تحقق من الشبكة وأعد المحاولة"));
    xhr.onabort = () => fail(new DOMException("تم إلغاء الرفع", "AbortError"));
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) {
      abort();
      return;
    }
    try {
      xhr.send(file);
    } catch {
      fail(new Error("تعذر بدء رفع الوثيقة"));
    }
  });
}
