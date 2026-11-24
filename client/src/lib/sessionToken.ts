const SESSION_TOKEN_STORAGE_KEY = "wathaeqi.auth.session";

// The in-memory copy keeps the current page usable when browser storage is
// restricted. localStorage is the shared same-origin boundary used by the
// browser tab and an installed PWA. A sessionStorage fallback only applies
// when persistent storage is blocked by browser policy.
let inMemorySessionToken: string | null = null;

export function getSessionToken(): string | null {
  if (inMemorySessionToken) return inMemorySessionToken;

  try {
    const token = globalThis.localStorage?.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (token && token.length <= 16_384) {
      inMemorySessionToken = token;
      return token;
    }
  } catch {
    // Fall through to the tab-scoped fallback below.
  }

  try {
    const token = globalThis.sessionStorage?.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (token && token.length <= 16_384) {
      inMemorySessionToken = token;
      try {
        globalThis.localStorage?.setItem(SESSION_TOKEN_STORAGE_KEY, token);
        globalThis.sessionStorage?.removeItem(SESSION_TOKEN_STORAGE_KEY);
      } catch {
        // Keep using the legacy tab session when migration is blocked.
      }
      return token;
    }
  } catch {
    // Storage can be disabled by browser policy; the in-memory token still works
    // until this page is closed or reloaded.
  }

  return null;
}

export function setSessionToken(token: string): void {
  if (!token || token.length > 16_384) {
    throw new Error("تعذر إنشاء جلسة دخول صالحة");
  }

  inMemorySessionToken = token;
  try {
    globalThis.localStorage?.setItem(SESSION_TOKEN_STORAGE_KEY, token);
    globalThis.sessionStorage?.removeItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    try {
      globalThis.sessionStorage?.setItem(SESSION_TOKEN_STORAGE_KEY, token);
    } catch {
      // Keep the session available in memory when browser storage is blocked.
    }
  }
}

export function clearSessionToken(): void {
  inMemorySessionToken = null;
  try {
    globalThis.localStorage?.removeItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    // Continue clearing the tab-scoped fallback.
  }
  try {
    globalThis.sessionStorage?.removeItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    // Local logout remains effective in memory when storage is blocked.
  }
}
