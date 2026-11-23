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

/** Send tRPC requests with session cookies and fail stalled login attempts visibly. */
export async function fetchWithCredentials(
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
    return await globalThis.fetch(input, {
      ...init,
      credentials: "include",
      ...(controller ? { signal: controller.signal } : {}),
    });
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (abortFromCaller) {
      init?.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}
