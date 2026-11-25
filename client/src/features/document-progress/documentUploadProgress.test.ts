import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSessionToken, setSessionToken } from "@/lib/sessionToken";
import { uploadDocumentWithProgress } from "./documentUploadProgress";

class FakeXHR {
  static latest: FakeXHR;
  headers = new Headers();
  upload: {
    onprogress: ((event: ProgressEvent) => void) | null;
    onload: (() => void) | null;
  } = { onprogress: null, onload: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  status = 200;
  responseText = '{"id":"synthetic-id"}';
  withCredentials = true;
  timeout = 0;
  method = "";
  url = "";
  file?: File;
  constructor() {
    FakeXHR.latest = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }
  send(file: File) {
    this.file = file;
  }
  abort() {
    this.onabort?.();
  }
}

describe("upload progress", () => {
  beforeEach(() => {
    clearSessionToken();
    vi.stubGlobal("window", {
      location: {
        origin: "https://app.example",
        href: "https://app.example/documents",
      },
    });
    vi.stubGlobal("location", { href: "https://app.example/documents" });
    vi.stubEnv("VITE_APPWRITE_API_URL", "https://api.example");
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
  });
  afterEach(() => {
    clearSessionToken();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const file = new File(["1234567890"], "fixture.pdf", {
    type: "application/pdf",
  });
  it("uses the Appwrite API and current Bearer with no ambient credentials, and waits for server confirmation", async () => {
    setSessionToken("synthetic-session");
    const progress = vi.fn();
    const promise = uploadDocumentWithProgress(
      "/api/documents/upload",
      file,
      { "x-file-name": "fixture.pdf" },
      { onProgress: progress }
    );
    const xhr = FakeXHR.latest;
    expect(xhr.url).toBe("https://api.example/api/documents/upload");
    expect(xhr.method).toBe("POST");
    expect(xhr.withCredentials).toBe(false);
    expect(xhr.headers.get("Authorization")).toBe("Bearer synthetic-session");
    expect(xhr.file).toBe(file);
    xhr.upload.onprogress?.({
      loaded: 4,
      total: 10,
      lengthComputable: true,
    } as ProgressEvent);
    expect(progress.mock.lastCall?.[0]).toMatchObject({
      percent: 40,
      loaded: 4,
      total: 10,
    });
    xhr.upload.onload?.();
    expect(progress.mock.lastCall?.[0]).toMatchObject({
      phase: "preparation",
      stagePercent: 50,
    });
    expect(progress.mock.calls.some(([value]) => value.phase === "ready")).toBe(
      false
    );
    xhr.onload?.();
    await expect(promise).resolves.toEqual({ id: "synthetic-id" });
    expect(progress.mock.lastCall?.[0].phase).toBe("ready");
  });
  it.each([401, 403, 500])(
    "does not report success on HTTP %s",
    async status => {
      const progress = vi.fn();
      const promise = uploadDocumentWithProgress(
        "/api/documents/upload",
        file,
        {},
        { onProgress: progress }
      );
      FakeXHR.latest.status = status;
      FakeXHR.latest.onload?.();
      await expect(promise).rejects.toThrow();
      expect(
        progress.mock.calls.some(([value]) => value.phase === "ready")
      ).toBe(false);
    }
  );
  it("rejects malformed responses and timeouts without exposing private response text", async () => {
    const malformed = uploadDocumentWithProgress(
      "/api/documents/upload",
      file,
      {}
    );
    FakeXHR.latest.responseText = "private server detail";
    FakeXHR.latest.onload?.();
    await expect(malformed).rejects.toThrow("غير صالحة");
    const timedout = uploadDocumentWithProgress(
      "/api/documents/upload",
      file,
      {}
    );
    FakeXHR.latest.ontimeout?.();
    await expect(timedout).rejects.toThrow("مهلة");
  });
  it("aborts without a ready phase or allowing late server success", async () => {
    const controller = new AbortController();
    const progress = vi.fn();
    const promise = uploadDocumentWithProgress(
      "/api/documents/upload",
      file,
      {},
      { signal: controller.signal, onProgress: progress }
    );
    controller.abort();
    FakeXHR.latest.onload?.();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(progress.mock.calls.some(([value]) => value.phase === "ready")).toBe(
      false
    );
  });
  it("rejects storage destinations before constructing a credential-bearing XHR", () => {
    expect(() =>
      uploadDocumentWithProgress("https://storage.example/file", file, {})
    ).toThrow("غير مسموحة");
  });
});
