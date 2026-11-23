import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import sparticuzChromium from "@sparticuz/chromium";
import { chromium } from "playwright-core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createServer } from "vite";
import { describe, expect, it } from "vitest";

const chromiumPath =
  process.env.CHROMIUM_PATH ??
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

describe.skipIf(
  !chromiumPath && !(process.platform === "linux" && process.arch === "x64")
)("PDF CMap resources in Chromium", () => {
  it("renders the text of a CID-font PDF in the original print path", async () => {
    const server = await createServer({
      configFile: resolve("vite.config.ts"),
      server: { port: 0, host: "127.0.0.1" },
      logLevel: "silent",
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("No test port");
    const browser = await chromium.launch({
      executablePath:
        chromiumPath ?? (await sparticuzChromium.executablePath()),
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.route("**/__pdf_test_host", route =>
        route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<html><body></body></html>",
        })
      );
      await page.goto(`http://127.0.0.1:${address.port}/__pdf_test_host`);
      const pdf = readFileSync(
        resolve(
          "client/src/features/document-library/__fixtures__/cid-cmap-synthetic.pdf"
        )
      ).toString("base64");
      const popupPromise = page.waitForEvent("popup");
      const printPromise = page.evaluate(async data => {
        const moduleUrl = "/src/features/document-library/printOriginal.ts";
        const loadModule = new Function("url", "return import(url)") as (
          url: string
        ) => Promise<{
          openOriginalPrintWindow(options: unknown): Promise<void>;
        }>;
        const module = await loadModule(moduleUrl);
        await module.openOriginalPrintWindow({
          url: `data:application/pdf;base64,${data}`,
          fileName: "synthetic.pdf",
          mimeType: "application/pdf",
          pagesPerSheet: 2,
        });
      }, pdf);
      const [popup] = await Promise.all([popupPromise, printPromise]);
      const darkPixels = await popup
        .locator("img")
        .first()
        .evaluate(async image => {
          const source = image as HTMLImageElement;
          await source.decode();
          const canvas = document.createElement("canvas");
          canvas.width = source.naturalWidth;
          canvas.height = source.naturalHeight;
          const context = canvas.getContext("2d")!;
          context.drawImage(source, 0, 0);
          const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          ).data;
          let count = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (
              pixels[i]! < 180 &&
              pixels[i + 1]! < 180 &&
              pixels[i + 2]! < 180
            )
              count++;
          }
          return count;
        });
      expect(darkPixels).toBeGreaterThan(50);
      await popup.close();

      const singlePopupPromise = page.waitForEvent("popup");
      const singlePrintPromise = page.evaluate(async data => {
        const loadModule = new Function("url", "return import(url)") as (
          url: string
        ) => Promise<{
          openOriginalPrintWindow(options: unknown): Promise<void>;
        }>;
        const module = await loadModule(
          "/src/features/document-library/printOriginal.ts"
        );
        await module.openOriginalPrintWindow({
          url: `data:application/pdf;base64,${data}`,
          fileName: "synthetic.pdf",
          mimeType: "application/pdf",
          pagesPerSheet: 1,
        });
      }, pdf);
      const [singlePopup] = await Promise.all([
        singlePopupPromise,
        singlePrintPromise,
      ]);
      const printed = await singlePopup.pdf({
        preferCSSPageSize: true,
        printBackground: true,
      });
      const loadingTask = getDocument({ data: new Uint8Array(printed) });
      try {
        const printedDocument = await loadingTask.promise;
        const viewport = (await printedDocument.getPage(1)).getViewport({
          scale: 1,
        });
        expect(viewport.width).toBeCloseTo(300, 0);
        expect(viewport.height).toBeCloseTo(180, 0);
      } finally {
        await loadingTask.destroy();
      }
      await singlePopup.close();
    } finally {
      await browser.close();
      await server.close();
    }
  }, 60_000);
});
