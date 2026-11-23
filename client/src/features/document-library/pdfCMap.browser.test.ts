import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import sparticuzChromium from "@sparticuz/chromium";
import { chromium, type Page } from "playwright-core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createServer } from "vite";
import { describe, expect, it } from "vitest";

const chromiumPath =
  process.env.CHROMIUM_PATH ??
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

async function openPdfPrint(page: Page, data: string, pagesPerSheet: 1 | 2) {
  await page.evaluate(
    async ({ data, pagesPerSheet }) => {
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
        pagesPerSheet,
      });
    },
    { data, pagesPerSheet }
  );
}

async function openTestHost(page: Page, port: number) {
  await page.route("**/__pdf_test_host", route =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body></body></html>",
    })
  );
  await page.goto(`http://127.0.0.1:${port}/__pdf_test_host`);
}

async function measureGlyphs(popup: Page) {
  return popup
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
      // The fixture uses four 28pt-wide glyphs starting at x=20pt. The
      // original print path renders at scale 3 (84px per glyph).
      const width = 84;
      const masks = Array.from({ length: 4 }, () => [] as boolean[]);
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < width; x++) {
          for (let glyph = 0; glyph < masks.length; glyph++) {
            const i = (y * canvas.width + 60 + glyph * width + x) * 4;
            masks[glyph]!.push(
              pixels[i]! < 180 && pixels[i + 1]! < 180 && pixels[i + 2]! < 180
            );
          }
        }
      }
      const counts = masks.map(mask => mask.filter(Boolean).length);
      const differences = masks.flatMap((mask, i) =>
        masks
          .slice(i + 1)
          .map(other =>
            mask.reduce(
              (count, pixel, index) => count + Number(pixel !== other[index]),
              0
            )
          )
      );
      return {
        counts,
        differences,
        width: canvas.width,
        height: canvas.height,
      };
    });
}

describe.skipIf(
  !chromiumPath && !(process.platform === "linux" && process.arch === "x64")
)("PDF CMap resources in Chromium", () => {
  it("renders embedded CID text through the original print path and requires its CMap", async () => {
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
      // The 300 x 180 pt fixture contains only the four CID glyphs 中文测试.
      // Its subset of Droid Sans Fallback is embedded, not a system font; see
      // __fixtures__/cid-cmap-font-LICENSE.txt. UniGB-UCS2-H maps the PDF's
      // character codes to CIDs; the PDF's CIDToGIDMap maps those to glyphs.
      const pdfBytes = readFileSync(
        resolve(
          "client/src/features/document-library/__fixtures__/cid-cmap-synthetic.pdf"
        )
      );
      const pdf = pdfBytes.toString("base64");
      const fixtureTask = getDocument({
        data: new Uint8Array(pdfBytes),
        cMapUrl: resolve("node_modules/pdfjs-dist/cmaps") + sep,
        cMapPacked: true,
      });
      try {
        const document = await fixtureTask.promise;
        const text = await (await document.getPage(1)).getTextContent();
        expect(
          text.items.map(item => ("str" in item ? item.str : "")).join("")
        ).toBe("中文测试");
      } finally {
        await fixtureTask.destroy();
      }

      const page = await browser.newPage();
      const requestedMaps: string[] = [];
      page.on("request", request => {
        if (request.url().includes("/pdfjs/cmaps/"))
          requestedMaps.push(request.url());
      });
      await openTestHost(page, address.port);
      const popupPromise = page.waitForEvent("popup");
      const [popup] = await Promise.all([
        popupPromise,
        openPdfPrint(page, pdf, 2),
      ]);
      const glyphs = await measureGlyphs(popup);
      expect(
        requestedMaps.some(url => url.endsWith("/UniGB-UCS2-H.bcmap"))
      ).toBe(true);
      expect(glyphs.width).toBe(1500);
      expect(glyphs.height).toBe(900);
      for (const count of glyphs.counts) expect(count).toBeGreaterThan(50);
      // Distinct masks rule out four identical missing-glyph boxes.
      for (const difference of glyphs.differences)
        expect(difference).toBeGreaterThan(100);
      await popup.close();

      const singlePopupPromise = page.waitForEvent("popup");
      const [singlePopup] = await Promise.all([
        singlePopupPromise,
        openPdfPrint(page, pdf, 1),
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

      // A fresh browser context avoids reusing PDF.js's CMap or worker cache.
      const blockedPage = await browser.newPage();
      const blockedMaps: string[] = [];
      await blockedPage.context().route("**/pdfjs/cmaps/**", route => {
        blockedMaps.push(route.request().url());
        return route.fulfill({
          status: 404,
          body: "CMap deliberately blocked",
        });
      });
      await openTestHost(blockedPage, address.port);
      const blockedPopupPromise = blockedPage.waitForEvent("popup");
      const [blockedPopup] = await Promise.all([
        blockedPopupPromise,
        openPdfPrint(blockedPage, pdf, 2),
      ]);
      const blockedGlyphs = await measureGlyphs(blockedPopup);
      expect(blockedMaps.some(url => url.endsWith("/UniGB-UCS2-H.bcmap"))).toBe(
        true
      );
      // PDF.js currently completes with a blank image rather than throwing.
      // The same per-glyph rendering assertion above must fail without CMap.
      for (const count of blockedGlyphs.counts)
        expect(count).toBeLessThanOrEqual(50);
      await blockedPopup.close();
      await blockedPage.close();
    } finally {
      await browser.close();
      await server.close();
    }
  }, 60_000);
});
