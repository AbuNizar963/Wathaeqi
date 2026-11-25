import { describe, expect, it } from "vitest";
import {
  buildPrintHtml,
  buildPrintSheets,
  groupPages,
  requiresManualPrint,
} from "./printSheets";
import type { PrintOptions, SourcePage } from "./types";

function page(index: number): SourcePage {
  return {
    src: `data:image/jpeg;base64,page-${index}`,
    width: 1240,
    height: 1754,
  };
}

const pages = [1, 2, 3, 4, 5].map(page);

const baseOptions: PrintOptions = {
  pagesPerSheet: 1,
  marginMm: 8,
  headerText: "",
  footerText: "",
  showPageNumbers: true,
};

describe("document print sheet layout", () => {
  it("requires a deliberate print tap on Android browsers", () => {
    expect(requiresManualPrint("Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile")).toBe(true);
    expect(requiresManualPrint("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0")).toBe(false);
    expect(requiresManualPrint("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(false);
  });

  it("places one, two, four, six, or eight pages on each A4 sheet", () => {
    expect(groupPages(pages, 1)).toHaveLength(5);
    expect(groupPages(pages, 2)).toHaveLength(3);
    expect(groupPages(pages, 4)).toHaveLength(2);
    expect(groupPages(pages, 4).at(-1)).toHaveLength(1);
    expect(groupPages(pages, 6)).toHaveLength(1);
    expect(groupPages(pages, 8)).toHaveLength(1);
  });

  it("renders the selected grid and keeps every page in the output", () => {
    const html = buildPrintHtml(pages, {
      ...baseOptions,
      pagesPerSheet: 4,
      headerText: "وزارة الداخلية",
      footerText: "نسخة أرشيفية",
    });
    expect(html).toContain("grid portrait per-4");
    expect(html).toContain("grid-auto-flow: row");
    expect(html).toContain('class="grid portrait per-4" dir="ltr"');
    expect(html.match(/<section class="sheet">/g)).toHaveLength(2);
    expect(html.match(/<img /g)).toHaveLength(5);
    expect(html).toContain("وزارة الداخلية");
    expect(html).toContain("نسخة أرشيفية");
    expect(html).toContain("ورقة 1 من 2");
  });

  it("repeats each source page in its own sheet without mixing sequential pages", () => {
    const sheets = buildPrintSheets(pages.slice(0, 3), "repeat", 4);
    expect(sheets).toHaveLength(3);
    expect(sheets.map(sheet => sheet.map(item => item.src))).toEqual([
      [
        "data:image/jpeg;base64,page-1",
        "data:image/jpeg;base64,page-1",
        "data:image/jpeg;base64,page-1",
        "data:image/jpeg;base64,page-1",
      ],
      [
        "data:image/jpeg;base64,page-2",
        "data:image/jpeg;base64,page-2",
        "data:image/jpeg;base64,page-2",
        "data:image/jpeg;base64,page-2",
      ],
      [
        "data:image/jpeg;base64,page-3",
        "data:image/jpeg;base64,page-3",
        "data:image/jpeg;base64,page-3",
        "data:image/jpeg;base64,page-3",
      ],
    ]);
    expect(
      buildPrintSheets(pages.slice(0, 3), "sequential", 2).map(sheet =>
        sheet.map(item => item.src)
      )
    ).toEqual([
      ["data:image/jpeg;base64,page-1", "data:image/jpeg;base64,page-2"],
      ["data:image/jpeg;base64,page-3"],
    ]);
  });

  it("keeps one-up output at full A4 size and lays out repeated copies on one sheet", () => {
    const oneUp = buildPrintHtml([page(1)], { ...baseOptions, marginMm: 0 });
    expect(oneUp).toContain("@page { size: A4 portrait; margin: 0; }");
    expect(oneUp).toContain("width: 210mm;");
    expect(oneUp).toContain("height: 297mm;");
    expect(oneUp).toContain(
      ".per-1 { grid-template-columns: 1fr; grid-template-rows: 1fr; }"
    );

    const repeated = buildPrintHtml([page(1)], {
      ...baseOptions,
      pagesPerSheet: 1,
      layoutMode: "repeat",
      copiesPerSheet: 4,
    });
    expect(repeated.match(/<section class="sheet">/g)).toHaveLength(1);
    expect(repeated.match(/<img /g)).toHaveLength(4);
    expect(repeated.match(/page-1/g)).toHaveLength(4);
  });

  it("applies landscape paper dimensions and grid orientation", () => {
    const html = buildPrintHtml(pages.slice(0, 2), {
      ...baseOptions,
      pagesPerSheet: 2,
      orientation: "landscape",
      marginMm: 0,
    });
    expect(html).toContain("@page { size: A4 landscape; margin: 0; }");
    expect(html).toContain("width: 297mm;");
    expect(html).toContain("height: 210mm;");
    expect(html).toContain(
      ".grid.landscape.per-2 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr; }"
    );
  });

  it("escapes header and footer text instead of injecting HTML", () => {
    const html = buildPrintHtml([page(1)], {
      ...baseOptions,
      headerText: '<script>alert("x")</script>',
      footerText: "A & B",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
  });

  it("rejects unsafe image sources instead of embedding them in generated markup", () => {
    const html = buildPrintHtml(
      [{ ...page(1), src: 'javascript:alert("x")' }],
      baseOptions
    );
    expect(html).not.toContain("javascript:");
    expect(html).toContain('<img src="" alt="" />');
  });
});
