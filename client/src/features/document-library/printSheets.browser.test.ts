import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import type { PagesPerSheet } from "./types";

const chromiumPath =
  process.env.CHROMIUM_PATH ??
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

type BuiltPrintHtml = (pages: unknown[], options: unknown) => string;

function pageDataUrl(index: number): string {
  const colors = ["#b91c1c", "#1d4ed8", "#15803d", "#a16207", "#7e22ce"];
  const color = colors[(index - 1) % colors.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123"><rect width="794" height="1123" fill="${color}"/><text x="397" y="570" fill="white" font-size="72" text-anchor="middle">PAGE${index}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

describe.skipIf(!chromiumPath)("multi-page print layout in Chromium", () => {
  it.each([1, 2, 4, 6, 8] as PagesPerSheet[])(
    "renders every source document page once for %s pages per sheet",
    async pagesPerSheet => {
      const bundle = await build({
        entryPoints: [
          resolve("client/src/features/document-library/printSheets.ts"),
        ],
        bundle: true,
        write: false,
        format: "iife",
        globalName: "printSheetsTest",
        platform: "browser",
      });
      const browser = await chromium.launch({
        executablePath: chromiumPath,
        headless: true,
        args: ["--no-sandbox"],
      });
      try {
        const page = await browser.newPage();
        await page.goto("data:text/html,<html><body></body></html>");
        await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
        const html = await page.evaluate(
          ({ pagesPerSheet }) => {
            const api = (
              window as unknown as {
                printSheetsTest: { buildPrintHtml: BuiltPrintHtml };
              }
            ).printSheetsTest;
            return api.buildPrintHtml(
              Array.from({ length: 9 }, (_, index) => ({
                src: `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123"><rect width="794" height="1123" fill="rgb(${index * 20},80,140)"/></svg>`)}`,
                width: 794,
                height: 1123,
              })),
              {
                pagesPerSheet,
                marginMm: 8,
                headerText: "",
                footerText: "",
                showPageNumbers: false,
              }
            );
          },
          { pagesPerSheet }
        );
        await page.setContent(html, { waitUntil: "load" });
        await page.waitForFunction(() =>
          Array.from(document.images).every(
            image => image.complete && image.naturalWidth > 0
          )
        );
        const layout = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>(".cell")).map(
            cell => {
              const cellRect = cell.getBoundingClientRect();
              const image = cell.querySelector("img")!;
              const imageRect = image.getBoundingClientRect();
              return {
                imageLoaded: image.complete && image.naturalWidth > 0,
                cellWidth: cellRect.width,
                cellHeight: cellRect.height,
                imageWidth: imageRect.width,
                imageHeight: imageRect.height,
              };
            }
          )
        );
        expect(layout).toHaveLength(9);
        expect(layout.every(item => item.imageLoaded)).toBe(true);
        expect(
          layout.every(item => item.imageWidth > 0 && item.imageHeight > 0)
        ).toBe(true);
        expect(
          layout.every(item => item.imageWidth <= item.cellWidth + 0.1)
        ).toBe(true);
        expect(
          layout.every(item => item.imageHeight <= item.cellHeight + 0.1)
        ).toBe(true);

        const pdf = await page.pdf({
          format: "A4",
          preferCSSPageSize: true,
          printBackground: true,
        });
        const loadingTask = getDocument({ data: new Uint8Array(pdf) });
        const pdfDocument = await loadingTask.promise;
        try {
          expect(pdfDocument.numPages).toBe(Math.ceil(9 / pagesPerSheet));
        } finally {
          await loadingTask.destroy();
        }
      } finally {
        await browser.close();
      }
    },
    90_000
  );
});
