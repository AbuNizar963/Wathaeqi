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

  it("keeps four-up pages evenly spaced on a mobile A4 print root", async () => {
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
      const page = await browser.newPage({
        viewport: { width: 360, height: 800 },
      });
      await page.goto("data:text/html,<html><body></body></html>");
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
      await page.evaluate(async () => {
        window.print = () => undefined;
        const api = (
          window as unknown as {
            printSheetsTest: {
              openPrintWindow: (content: unknown) => Promise<void>;
            };
          }
        ).printSheetsTest;
        await api.openPrintWindow({
          pages: Array.from({ length: 4 }, (_, index) => ({
            src: `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123"><rect width="794" height="1123" fill="rgb(${index * 50},80,140)"/></svg>`)}`,
            width: 794,
            height: 1123,
          })),
          options: {
            pagesPerSheet: 4,
            marginMm: 8,
            orientation: "portrait",
            headerText: "",
            footerText: "",
            showPageNumbers: false,
          },
        });
      });
      await page.emulateMedia({ media: "print" });
      const geometry = await page.evaluate(() => {
        const root = document.getElementById("wathaeqi-print-root")!;
        const sheet = root.querySelector<HTMLElement>(".sheet")!;
        const sheetRect = sheet.getBoundingClientRect();
        const cells = Array.from(
          root.querySelectorAll<HTMLElement>(".cell"),
          cell => {
            const rect = cell.getBoundingClientRect();
            return {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
            };
          }
        );
        return {
          rootWidth: root.getBoundingClientRect().width,
          bodyWidth: document.body.getBoundingClientRect().width,
          sheet: {
            left: sheetRect.left,
            top: sheetRect.top,
            right: sheetRect.right,
            bottom: sheetRect.bottom,
            width: sheetRect.width,
            height: sheetRect.height,
          },
          cells,
        };
      });
      const mmToCssPixels = 96 / 25.4;
      expect(geometry.rootWidth).toBeCloseTo(210 * mmToCssPixels, 0);
      expect(geometry.bodyWidth).toBeCloseTo(210 * mmToCssPixels, 0);
      expect(geometry.sheet.width).toBeCloseTo(210 * mmToCssPixels, 0);
      expect(geometry.sheet.height).toBeCloseTo(297 * mmToCssPixels, 0);
      expect(geometry.cells).toHaveLength(4);
      expect(geometry.cells[0]!.left - geometry.sheet.left).toBeCloseTo(
        8 * mmToCssPixels,
        0
      );
      expect(geometry.sheet.right - geometry.cells[1]!.right).toBeCloseTo(
        8 * mmToCssPixels,
        0
      );
      expect(geometry.cells[0]!.top - geometry.sheet.top).toBeCloseTo(
        8 * mmToCssPixels,
        0
      );
      expect(geometry.sheet.bottom - geometry.cells[3]!.bottom).toBeCloseTo(
        8 * mmToCssPixels,
        0
      );
      expect(geometry.cells[1]!.left - geometry.cells[0]!.right).toBeCloseTo(
        3 * mmToCssPixels,
        0
      );
      expect(geometry.cells[2]!.top - geometry.cells[0]!.bottom).toBeCloseTo(
        3 * mmToCssPixels,
        0
      );
      expect(geometry.cells.map(cell => cell.right - cell.left)).toEqual([
        expect.closeTo(geometry.cells[0]!.right - geometry.cells[0]!.left, 0),
        expect.closeTo(geometry.cells[0]!.right - geometry.cells[0]!.left, 0),
        expect.closeTo(geometry.cells[0]!.right - geometry.cells[0]!.left, 0),
        expect.closeTo(geometry.cells[0]!.right - geometry.cells[0]!.left, 0),
      ]);

      const pdf = await page.pdf({
        preferCSSPageSize: true,
        printBackground: true,
      });
      const loadingTask = getDocument({ data: new Uint8Array(pdf) });
      const pdfDocument = await loadingTask.promise;
      try {
        expect(pdfDocument.numPages).toBe(1);
        const printedPage = await pdfDocument.getPage(1);
        const pageBox = printedPage.getViewport({ scale: 1 });
        expect(pageBox.width).toBeCloseTo(595.28, 0);
        expect(pageBox.height).toBeCloseTo(841.89, 0);
      } finally {
        await loadingTask.destroy();
      }
    } finally {
      await browser.close();
    }
  });

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
  it("prints an isolated root in the same page without popup or replacing application DOM", async () => {
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
      const printPromise = page.evaluate(async () => {
        window.open = () => {
          throw new Error("Popup is forbidden");
        };
        const app = document.createElement("main");
        app.id = "application-fixture";
        app.textContent = "Keep existing app";
        document.body.append(app);
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
          window,
          "<!doctype html><html><head><title>Print fixture</title></head><body><h1>Ready to print</h1></body></html>"
        );
      });
      await printPromise;
      expect(page.url()).toContain("data:text/html");
      expect(await page.locator("#application-fixture").textContent()).toBe(
        "Keep existing app"
      );
      expect(await page.locator("#wathaeqi-print-root").count()).toBe(1);
      expect(await page.title()).toBe("Print fixture");
      expect(await page.locator("h1").textContent()).toBe("Ready to print");
      expect(
        await page.evaluate(
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

it.skipIf(!chromiumPath)(
  "honors PDF repeat layouts and orientation without dropping any source pages",
  async () => {
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
      await page.setContent("<title>Application</title><main>App</main>");
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
      const result = await page.evaluate(async () => {
        window.print = () => undefined;
        window.open = () => {
          throw new Error("No popup allowed");
        };
        const api = (
          window as unknown as {
            printSheetsTest: {
              openPrintWindow: (content: unknown) => Promise<void>;
            };
          }
        ).printSheetsTest;
        const pages = [1, 2, 3].map(index => ({
          src: `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="612" height="792"><text x="10" y="50">PAGE${index}</text></svg>`)}`,
          width: 612,
          height: 792,
          widthPt: 612,
          heightPt: 792,
        }));
        await api.openPrintWindow({
          pages,
          options: {
            layoutMode: "repeat",
            pagesPerSheet: 1,
            copiesPerSheet: 2,
            orientation: "landscape",
            marginMm: 0,
            headerText: "",
            footerText: "",
            showPageNumbers: false,
          },
        });
        const root = document.getElementById("wathaeqi-print-root")!;
        const sheets = Array.from(root.querySelectorAll(".sheet"));
        return {
          sources: sheets.map(sheet =>
            Array.from(sheet.querySelectorAll("img"), image => image.src)
          ),
          landscape: root
            .querySelector(".grid")
            ?.classList.contains("landscape"),
          grids: root.querySelectorAll(".per-2").length,
        };
      });
      expect(result.sources).toHaveLength(3);
      expect(
        result.sources.every(
          sheet => sheet.length === 2 && sheet[0] === sheet[1]
        )
      ).toBe(true);
      expect(new Set(result.sources.map(sheet => sheet[0])).size).toBe(3);
      expect(result.landscape).toBe(true);
      expect(result.grids).toBe(3);
    } finally {
      await browser.close();
    }
  }
);
