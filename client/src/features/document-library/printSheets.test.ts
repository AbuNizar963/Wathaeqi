import { describe, expect, it } from "vitest";
import { buildPrintHtml, duplicatePages, groupPages } from "./printSheets";
import type { PrintOptions, SourcePage } from "./types";

function page(index: number): SourcePage {
  return {
    dataUrl: `data:image/jpeg;base64,page-${index}`,
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
  it("places one, two, four, six, or eight pages on each A4 sheet", () => {
    expect(groupPages(pages, 1)).toHaveLength(5);
    expect(groupPages(pages, 2)).toHaveLength(3);
    expect(groupPages(pages, 4)).toHaveLength(2);
    expect(groupPages(pages, 4).at(-1)).toHaveLength(1);
    expect(groupPages(pages, 6)).toHaveLength(1);
    expect(groupPages(pages, 8)).toHaveLength(1);
  });

  it("duplicates each source page for compact copy printing", () => {
    expect(duplicatePages([page(1)], 2)).toEqual([page(1), page(1)]);
    expect(duplicatePages([page(1)], 4)).toEqual([
      page(1),
      page(1),
      page(1),
      page(1),
    ]);
    expect(duplicatePages([page(1), page(2)], 2)).toEqual([
      page(1),
      page(1),
      page(2),
      page(2),
    ]);
  });

  it("renders the selected grid and keeps every page in the output", () => {
    const html = buildPrintHtml(pages, {
      ...baseOptions,
      pagesPerSheet: 4,
      headerText: "وزارة الداخلية",
      footerText: "نسخة أرشيفية",
    });
    expect(html).toContain("grid per-4");
    expect(html).toContain(
      ".per-2 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr; }"
    );
    expect(html.match(/<section class="sheet">/g)).toHaveLength(2);
    expect(html.match(/<img /g)).toHaveLength(5);
    expect(html).toContain("وزارة الداخلية");
    expect(html).toContain("نسخة أرشيفية");
    expect(html).toContain("ورقة 1 من 2");
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
});
