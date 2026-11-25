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
                marginMm: pagesPerSheet === 1 ? 0 : 8,
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
                sheetWidth:
                  cell.parentElement!.parentElement!.getBoundingClientRect()
                    .width,
                sheetHeight:
                  cell.parentElement!.parentElement!.getBoundingClientRect()
                    .height,
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
        if (pagesPerSheet === 1) {
          expect(
            layout.every(item => item.cellWidth > item.sheetWidth * 0.98)
          ).toBe(true);
          expect(
            layout.every(item => item.cellHeight > item.sheetHeight * 0.98)
          ).toBe(true);
        }

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

  it("prints repeated copies of each same source page on separate sheets", async () => {
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
      const html = await page.evaluate(() => {
        const api = (
          window as unknown as {
            printSheetsTest: { buildPrintHtml: BuiltPrintHtml };
          }
        ).printSheetsTest;
        const sourcePages = ["#b91c1c", "#1d4ed8"].map((color, index) => {
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123"><rect width="794" height="1123" fill="${color}"/><text x="397" y="570" fill="white" font-size="72" text-anchor="middle">PAGE${index + 1}</text></svg>`;
          return {
            src: `data:image/svg+xml;base64,${btoa(svg)}`,
            width: 794,
            height: 1123,
          };
        });
        return api.buildPrintHtml(sourcePages, {
          pagesPerSheet: 1,
          layoutMode: "repeat",
          copiesPerSheet: 4,
          marginMm: 0,
          orientation: "portrait",
          headerText: "",
          footerText: "",
          showPageNumbers: false,
        });
      });
      await page.setContent(html, { waitUntil: "load" });
      await page.waitForFunction(() =>
        Array.from(document.images).every(
          image => image.complete && image.naturalWidth > 0
        )
      );
      const layout = await page.evaluate(() => ({
        sourcesBySheet: Array.from(document.querySelectorAll(".sheet"), sheet =>
          Array.from(sheet.querySelectorAll("img"), image =>
            image.getAttribute("src")
          )
        ),
        firstCell: (() => {
          const sheet = document.querySelector<HTMLElement>(".sheet")!;
          const cell = document.querySelector<HTMLElement>(".cell")!;
          const sheetRect = sheet.getBoundingClientRect();
          const cellRect = cell.getBoundingClientRect();
          return {
            sheetWidth: sheetRect.width,
            sheetHeight: sheetRect.height,
            cellWidth: cellRect.width,
            cellHeight: cellRect.height,
          };
        })(),
      }));
      expect(layout.sourcesBySheet).toHaveLength(2);
      expect(layout.sourcesBySheet.every(sheet => sheet.length === 4)).toBe(
        true
      );
      expect(
        layout.sourcesBySheet.every(sheet => new Set(sheet).size === 1)
      ).toBe(true);
      expect(layout.sourcesBySheet[0]![0]).not.toBe(
        layout.sourcesBySheet[1]![0]
      );
      expect(layout.firstCell.cellWidth).toBeGreaterThan(
        layout.firstCell.sheetWidth * 0.4
      );
      expect(layout.firstCell.cellWidth).toBeLessThan(
        layout.firstCell.sheetWidth * 0.6
      );

      const pdf = await page.pdf({
        format: "A4",
        preferCSSPageSize: true,
        printBackground: true,
      });
      const loadingTask = getDocument({ data: new Uint8Array(pdf) });
      const pdfDocument = await loadingTask.promise;
      try {
        expect(pdfDocument.numPages).toBe(2);
      } finally {
        await loadingTask.destroy();
      }
    } finally {
      await browser.close();
    }
  }, 90_000);
  it("replaces the blank popup with a loaded print document before invoking print", async () => {
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
      const context = await browser.newContext();
      await context.addInitScript(() => {
        Object.defineProperty(window, "print", {
          configurable: true,
          value: () => {
            (window as unknown as { printWasCalled: boolean }).printWasCalled =
              true;
          },
        });
      });
      const page = await context.newPage();
      await page.goto("data:text/html,<html><body></body></html>");
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
      const popupPromise = page.waitForEvent("popup");
      const printPromise = page.evaluate(async () => {
        const popup = window.open("", "_blank");
        if (!popup) throw new Error("Popup was blocked");
        const api = (
          window as unknown as {
            printSheetsTest: {
              printHtmlDocument: (
                target: Window,
                html: string
              ) => Promise<void>;
            };
          }
        ).printSheetsTest;
        await api.printHtmlDocument(
          popup,
          "<!doctype html><html><head><title>Print fixture</title></head><body><h1>Ready to print</h1></body></html>"
        );
      });
      const popup = await popupPromise;
      await printPromise;
      expect(popup.url()).toMatch(/^blob:/);
      expect(await popup.title()).toBe("Print fixture");
      expect(await popup.locator("h1").textContent()).toBe("Ready to print");
      expect(
        await popup.evaluate(
          () =>
            (window as unknown as { printWasCalled?: boolean })
              .printWasCalled === true
        )
      ).toBe(true);
      await context.close();
    } finally {
      await browser.close();
    }
  });
});
