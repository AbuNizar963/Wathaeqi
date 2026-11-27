import { describe, expect, it, vi } from "vitest";
import { applyDocumentPrintVisibility } from "./documentPrintSections";

function createElement(display: string) {
  return { style: { display } } as unknown as HTMLElement;
}

describe("applyDocumentPrintVisibility", () => {
  it("hides the header and footer sections and restores their prior styles", () => {
    const header = createElement("grid");
    const signature = createElement("flex");
    const pageFooter = createElement("");
    const querySelectorAll = vi.fn((selector: string) => {
      if (selector.includes('="header"')) return [header];
      if (selector.includes('="footer"')) return [signature, pageFooter];
      return [];
    });
    const root = { querySelectorAll } as unknown as ParentNode;

    const restore = applyDocumentPrintVisibility(root, {
      showHeader: false,
      showFooter: false,
    });

    expect(header.style.display).toBe("none");
    expect(signature.style.display).toBe("none");
    expect(pageFooter.style.display).toBe("none");

    restore();

    expect(header.style.display).toBe("grid");
    expect(signature.style.display).toBe("flex");
    expect(pageFooter.style.display).toBe("");
  });

  it("leaves all sections visible when both options are enabled", () => {
    const header = createElement("");
    const footer = createElement("");
    const querySelectorAll = vi.fn((selector: string) =>
      selector.includes('="header"') ? [header] : [footer]
    );
    const root = { querySelectorAll } as unknown as ParentNode;

    const restore = applyDocumentPrintVisibility(root, {
      showHeader: true,
      showFooter: true,
    });

    expect(querySelectorAll).not.toHaveBeenCalled();
    expect(header.style.display).toBe("");
    expect(footer.style.display).toBe("");
    restore();
  });

  it("can hide only the footer without changing the header", () => {
    const header = createElement("grid");
    const footer = createElement("block");
    const querySelectorAll = vi.fn((selector: string) =>
      selector.includes('="footer"') ? [footer] : [header]
    );
    const root = { querySelectorAll } as unknown as ParentNode;

    const restore = applyDocumentPrintVisibility(root, {
      showHeader: true,
      showFooter: false,
    });

    expect(querySelectorAll).toHaveBeenCalledOnce();
    expect(header.style.display).toBe("grid");
    expect(footer.style.display).toBe("none");
    restore();
    expect(footer.style.display).toBe("block");
  });
});
