import { afterEach, describe, expect, it, vi } from "vitest";
import { showDocumentEditorPrintCopies } from "./documentEditorPrintLayout";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("document editor print layout", () => {
  it("matches the print textarea height to the editor and restores its state", () => {
    const editor = { scrollHeight: 920 } as HTMLTextAreaElement;
    const copy = {
      style: { display: "none", height: "640px" },
    } as HTMLTextAreaElement;
    const element = {
      querySelectorAll: (selector: string) =>
        selector === ".document-editor-input" ? [editor] : [copy],
    } as unknown as HTMLElement;
    vi.stubGlobal("window", {
      getComputedStyle: () => ({ minHeight: "570px" }),
    });

    const restore = showDocumentEditorPrintCopies(element);

    expect(copy.style.display).toBe("block");
    expect(copy.style.height).toBe("920px");

    restore();

    expect(copy.style.display).toBe("none");
    expect(copy.style.height).toBe("640px");
  });

  it("respects the editor minimum height when its text is short", () => {
    const editor = { scrollHeight: 180 } as HTMLTextAreaElement;
    const copy = {
      style: { display: "none", height: "" },
    } as HTMLTextAreaElement;
    const element = {
      querySelectorAll: (selector: string) =>
        selector === ".document-editor-input" ? [editor] : [copy],
    } as unknown as HTMLElement;
    vi.stubGlobal("window", {
      getComputedStyle: () => ({ minHeight: "570px" }),
    });

    const restore = showDocumentEditorPrintCopies(element);

    expect(copy.style.height).toBe("570px");
    restore();
  });
});
