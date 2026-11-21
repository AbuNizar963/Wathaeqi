import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  documentStudioUrl,
  downloadDocumentFile,
  shareDocument,
} from "./documentActions";

describe("document actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("window", {
      location: { origin: "https://wathaeqi.example" },
      document: { createElement: vi.fn() },
    });
    vi.stubGlobal("navigator", {});
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
      url: "https://wathaeqi.example/studio?document=doc%2F42",
    });
    expect(share.mock.calls[0][0].url).not.toContain("manus-storage");
  });

  it("copies the authenticated route when Web Share is unavailable", async () => {
    Object.assign(navigator, { share: undefined });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    await expect(
      shareDocument({ documentId: "private-id", title: "وثيقة" })
    ).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(
      "https://wathaeqi.example/studio?document=private-id"
    );
  });

  it("downloads an imported file through the existing signed URL", () => {
    const click = vi.fn();
    const createElement = vi.fn().mockReturnValue({ click });
    window.document.createElement = createElement;

    downloadDocumentFile("https://private-storage.test/signed", "file.pdf");

    expect(createElement).toHaveBeenCalledWith("a");
    expect(click).toHaveBeenCalledOnce();
  });

  it("encodes document ids in the internal route", () => {
    expect(documentStudioUrl("id with spaces")).toBe(
      "https://wathaeqi.example/studio?document=id%20with%20spaces"
    );
  });
});
