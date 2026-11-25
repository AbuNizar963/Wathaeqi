import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSessionToken } from "@/lib/sessionToken";
import {
  documentFileUrl,
  documentStudioUrl,
  downloadDocumentFile,
  shareDocument,
} from "./documentActions";

describe("document actions", () => {
  beforeEach(() => {
    clearSessionToken();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.stubGlobal("window", {
      location: { origin: "https://wathaeqi.example" },
      document: { createElement: vi.fn() },
    });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the Blob URL alive for download navigation and then revokes it", async () => {
    vi.useFakeTimers();
    window.document.createElement = vi
      .fn()
      .mockReturnValue({ click: vi.fn(), remove: vi.fn() });
    vi.mocked(fetch).mockResolvedValue(
      new Response("PDF", { headers: { "Content-Type": "application/pdf" } })
    );
    await downloadDocumentFile("/api/file", "fixture.pdf");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
      "blob:download"
    );
  });

  it("revokes the Blob immediately if browser download invocation fails", async () => {
    window.document.createElement = vi.fn().mockReturnValue({
      click: () => {
        throw new Error("synthetic click failure");
      },
      remove: vi.fn(),
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response("PDF", { headers: { "Content-Type": "application/pdf" } })
    );
    await expect(
      downloadDocumentFile("/api/file", "fixture.pdf")
    ).rejects.toThrow("click failure");
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
      "blob:download"
    );
  });

  it("shares the authenticated studio route, never a storage URL", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });

    await shareDocument({
      documentId: "doc/42",
      title: "وثيقة سرية",
      text: "المعاينة",
    });

    expect(share).toHaveBeenCalledWith({
      title: "وثيقة سرية",
      text: "المعاينة",
      url: "https://wathaeqi.example/documents?document=doc%2F42",
    });
  });

  it("copies the authenticated route when Web Share is unavailable", async () => {
    Object.assign(navigator, { share: undefined });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    await expect(
      shareDocument({ documentId: "private-id", title: "وثيقة" })
    ).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(
      "https://wathaeqi.example/documents?document=private-id"
    );
  });

  it("downloads an imported file as a Blob instead of navigating to its URL", async () => {
    const click = vi.fn();
    const createElement = vi.fn().mockReturnValue({
      click,
      set href(value: string) {
        void value;
      },
      set download(value: string) {
        void value;
      },
      set rel(value: string) {
        void value;
      },
    });
    window.document.createElement = createElement;
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Blob(["pdf"]), {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      })
    );

    await downloadDocumentFile("/api/documents/doc-1/file", "file.pdf");

    expect(fetch).toHaveBeenCalledWith("/api/documents/doc-1/file", {
      headers: new Headers(),
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: undefined,
    });
    expect(createElement).toHaveBeenCalledWith("a");
    expect(click).toHaveBeenCalledOnce();
  });

  it("uses the configured Appwrite API origin and encodes the document ID", () => {
    vi.stubEnv("VITE_APPWRITE_API_URL", "https://api.example.test/");
    expect(documentFileUrl("id with spaces")).toBe(
      "https://api.example.test/api/documents/id%20with%20spaces/file"
    );
  });

  it.each([
    ["file.pdf", "application/pdf"],
    [
      "file.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    ["file.png", "image/png"],
    ["file.jpg", "image/jpeg"],
    ["file.webp", "image/webp"],
  ])("accepts the matching server type for %s", async (fileName, mimeType) => {
    window.document.createElement = vi.fn().mockReturnValue({ click: vi.fn() });
    vi.mocked(fetch).mockResolvedValue(
      new Response("fixture", {
        status: 200,
        headers: { "Content-Type": mimeType },
      })
    );
    await expect(
      downloadDocumentFile("/api/file", fileName)
    ).resolves.toBeUndefined();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it("rejects a successful HTML fallback instead of saving it as the file", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("<html>SPA fallback</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );
    await expect(
      downloadDocumentFile("/api/file", "file.docx")
    ).rejects.toThrow();
    expect(window.document.createElement).not.toHaveBeenCalled();
  });

  it("rejects a valid but mismatched response type", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("fixture", {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      })
    );
    await expect(
      downloadDocumentFile("/api/file", "file.png")
    ).rejects.toThrow();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("uses the canonical documents route even though legacy studio routes remain supported", () => {
    expect(documentStudioUrl("id with spaces")).toBe(
      "https://wathaeqi.example/documents?document=id%20with%20spaces"
    );
  });
});
