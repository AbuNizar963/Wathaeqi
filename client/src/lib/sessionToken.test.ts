import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionToken,
  getSessionToken,
  setSessionToken,
} from "./sessionToken";

afterEach(() => {
  clearSessionToken();
  vi.unstubAllGlobals();
});

describe("shared PWA session token", () => {
  it("stores the token in same-origin localStorage for browser/PWA reuse", () => {
    const storage = new Map<string, string>();
    const localStorage = {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    };
    const sessionStorage = { removeItem: vi.fn() };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("sessionStorage", sessionStorage);

    setSessionToken("signed-token");

    expect(getSessionToken()).toBe("signed-token");
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "wathaeqi.auth.session",
      "signed-token"
    );
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(
      "wathaeqi.auth.session"
    );
  });

  it("clears the token on logout", () => {
    const localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const sessionStorage = { removeItem: vi.fn() };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("sessionStorage", sessionStorage);
    setSessionToken("signed-token");

    clearSessionToken();

    expect(getSessionToken()).toBeNull();
    expect(localStorage.removeItem).toHaveBeenCalledWith(
      "wathaeqi.auth.session"
    );
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(
      "wathaeqi.auth.session"
    );
  });

  it("keeps the current page usable if browser storage is blocked", () => {
    const blockedStorage = {
      get getItem() {
        throw new Error("storage blocked");
      },
      setItem() {
        throw new Error("storage blocked");
      },
      removeItem() {
        throw new Error("storage blocked");
      },
    };
    vi.stubGlobal("localStorage", blockedStorage);
    vi.stubGlobal("sessionStorage", blockedStorage);

    setSessionToken("in-memory-token");

    expect(getSessionToken()).toBe("in-memory-token");
  });
});
