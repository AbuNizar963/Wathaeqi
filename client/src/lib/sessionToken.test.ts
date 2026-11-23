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

describe("tab-scoped session token", () => {
  it("stores the token in sessionStorage, not persistent localStorage", () => {
    const storage = new Map<string, string>();
    const sessionStorage = {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    };
    vi.stubGlobal("sessionStorage", sessionStorage);

    setSessionToken("signed-token");

    expect(getSessionToken()).toBe("signed-token");
    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      "wathaeqi.auth.session",
      "signed-token"
    );
  });

  it("clears the token on logout", () => {
    const sessionStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("sessionStorage", sessionStorage);
    setSessionToken("signed-token");

    clearSessionToken();

    expect(getSessionToken()).toBeNull();
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(
      "wathaeqi.auth.session"
    );
  });

  it("keeps the current page usable if browser storage is blocked", () => {
    vi.stubGlobal("sessionStorage", {
      get getItem() {
        throw new Error("storage blocked");
      },
      setItem() {
        throw new Error("storage blocked");
      },
      removeItem() {
        throw new Error("storage blocked");
      },
    });

    setSessionToken("in-memory-token");

    expect(getSessionToken()).toBe("in-memory-token");
  });
});
