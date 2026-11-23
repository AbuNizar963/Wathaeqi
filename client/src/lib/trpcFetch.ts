import { getSessionToken } from "./sessionToken";

export const LOGIN_REQUEST_TIMEOUT_MS = 30_000;

function isLoginRequest(input: RequestInfo | URL): boolean {
  const requestUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  try {
    return new URL(requestUrl, globalThis.location?.href).pathname.endsWith(
      "/api/trpc/auth.login"
    );
  } catch {
    return false;
  }
}

/** Send API requests with a tab-scoped Bearer token and no browser credentials. */
export async function fetchWithSession(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = isLoginRequest(input) ? new AbortController() : null;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let abortFromCaller: (() => void) | undefined;

  if (controller) {
    const callerSignal = init?.signal;
    if (callerSignal?.aborted) {
      controller.abort(callerSignal.reason);
    } else if (callerSignal) {
      abortFromCaller = () => controller.abort(callerSignal.reason);
      callerSignal.addEventListener("abort", abortFromCaller, { once: true });
    }

    timeoutId = setTimeout(() => {
      const timeoutError = new Error("Login request timed out");
      timeoutError.name = "TimeoutError";
      controller.abort(timeoutError);
    }, LOGIN_REQUEST_TIMEOUT_MS);
  }

  try {
    const headers = new Headers(
      init?.headers ??
        (typeof Request !== "undefined" && input instanceof Request
          ? input.headers
          : undefined)
    );
    const sessionToken = getSessionToken();
    if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);

    return await globalThis.fetch(input, {
      ...init,
      headers,
      credentials: "omit",
      ...(controller ? { signal: controller.signal } : {}),
    });
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (abortFromCaller) {
      init?.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}
