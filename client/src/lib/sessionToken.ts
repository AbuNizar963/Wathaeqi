const SESSION_TOKEN_STORAGE_KEY = "wathaeqi.auth.session";

// The in-memory copy keeps the current page usable when browser storage is
// restricted. sessionStorage is the persistence boundary: it is cleared when
// the tab's browsing session ends and is never copied to localStorage.
let inMemorySessionToken: string | null = null;

export function getSessionToken(): string | null {
  if (inMemorySessionToken) return inMemorySessionToken;

  try {
    const token = globalThis.sessionStorage?.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (token && token.length <= 16_384) {
      inMemorySessionToken = token;
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
    globalThis.sessionStorage?.setItem(SESSION_TOKEN_STORAGE_KEY, token);
  } catch {
    // Keep the session available in memory for this page when storage is blocked.
  }
}

export function clearSessionToken(): void {
  inMemorySessionToken = null;
  try {
    globalThis.sessionStorage?.removeItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    // Local logout remains effective in memory when storage is blocked.
  }
}
