import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import sparticuzChromium from "@sparticuz/chromium";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { describe, expect, it } from "vitest";

const chromiumPath =
  process.env.CHROMIUM_PATH ??
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

describe.skipIf(
  !chromiumPath && !(process.platform === "linux" && process.arch === "x64")
)("studio PNG download in Chromium", () => {
  it("exports a page containing CSS Color 4 colors and the print copy", async () => {
    const bundle = await build({
      entryPoints: [
        resolve("client/src/features/document-studio/documentActions.ts"),
      ],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "documentActionsTest",
      platform: "browser",
      define: {
        "import.meta.env": JSON.stringify({ VITE_APPWRITE_API_URL: "" }),
      },
    });
    const browser = await chromium.launch({
      executablePath:
        chromiumPath ?? (await sparticuzChromium.executablePath()),
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(`<!doctype html><html><head><style>
        body { background: oklch(0.9 0.02 90); }
        .document-a4-page { width: 120px; height: 160px; background: oklch(0.63 0.25 29); }
        .document-editor-print-copy { display:none; width:40px; height:40px; background:rgb(0, 220, 0); }
      </style></head><body><div class="document-a4-page"><div class="document-editor-print-copy"></div></div></body></html>`);
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
      const output = await page.evaluate(async () => {
        let exported: Blob | null = null;
        let downloadedName = "";
        URL.createObjectURL = (blob: Blob | MediaSource) => {
          if (blob instanceof Blob) exported = blob;
          return "blob:test";
        };
        URL.revokeObjectURL = () => undefined;
        HTMLAnchorElement.prototype.click = function () {
          downloadedName = this.download;
        };
        await (
          window as unknown as {
            documentActionsTest: {
              downloadA4PageAsPng: (
                element: HTMLElement,
                fileName: string
              ) => Promise<void>;
            };
          }
        ).documentActionsTest.downloadA4PageAsPng(
          document.querySelector<HTMLElement>(".document-a4-page")!,
          "fixture.png"
        );
        if (!exported) throw new Error("PNG was not downloaded");
        const bitmap = await createImageBitmap(exported);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        return {
          downloadedName,
          width: bitmap.width,
          height: bitmap.height,
          pixel: Array.from(context.getImageData(30, 30, 1, 1).data),
          background: Array.from(context.getImageData(300, 300, 1, 1).data),
        };
      });
      expect(output.downloadedName).toBe("fixture.png");
      expect(output.width).toBe(480);
      expect(output.height).toBe(640);
      expect(output.pixel[1]).toBeGreaterThan(180);
      expect(output.background[0]).toBeGreaterThan(output.background[1]! * 2);
    } finally {
      await browser.close();
    }
  }, 60_000);

  it("preserves Arabic letter shaping in exported PNGs", async () => {
    const bundle = await build({
      entryPoints: [
        resolve("client/src/features/document-studio/documentActions.ts"),
      ],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "documentActionsTest",
      platform: "browser",
      define: {
        "import.meta.env": JSON.stringify({ VITE_APPWRITE_API_URL: "" }),
      },
    });
    const browser = await chromium.launch({
      executablePath:
        chromiumPath ?? (await sparticuzChromium.executablePath()),
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1000, height: 1000 },
        deviceScaleFactor: 4,
      });
      const cairoFont = readFileSync(
        resolve("client/public/fonts/cairo-700.ttf")
      ).toString("base64");
      const letterhead = (className: string) => `
        <div class="document-a4-page ${className}">
          <header class="document-letterhead" dir="rtl">
            <div class="title">جهة اختبار - Wathaeqi</div>
            <div></div>
            <div class="serial">
              <p><strong>الرقم:</strong> يخصص عند الإصدار</p>
              <p><strong>التاريخ:</strong> 23 نوفمبر 2026</p>
            </div>
          </header>
        </div>`;
      await page.setContent(`<!doctype html><html dir="rtl"><head><style>
        @font-face {
          font-family: Cairo;
          font-style: normal;
          font-weight: 700;
          src: url(data:font/ttf;base64,${cairoFont}) format("truetype");
        }
        body { margin: 0; font-family: Cairo, sans-serif; }
        .document-a4-page {
          box-sizing: border-box;
          width: 794px;
          height: 350px;
          padding: 60px;
          color: #172033;
          background: #fff;
        }
        .document-letterhead {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 120px minmax(0, 1fr);
          align-items: start;
          letter-spacing: -0.12px;
        }
        .document-letterhead p,
        .document-letterhead .title {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
          line-height: 1.5;
          white-space: nowrap;
          letter-spacing: inherit;
        }
        .document-letterhead .serial {
          direction: rtl;
          text-align: left;
          transform: scaleX(0.86);
          transform-origin: left center;
        }
        .document-letterhead .title {
          direction: rtl;
          text-align: right;
          transform: scaleX(0.86);
          transform-origin: right center;
        }
        .reference {
          position: absolute;
          top: 400px;
          left: 0;
        }
      </style></head><body>
        ${letterhead("target")}
        ${letterhead("reference")}
      </body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const reference = await page.locator(".reference").screenshot();
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
      const output = await page.evaluate(async referenceBase64 => {
        let exported: Blob | null = null;
        let downloadedName = "";
        URL.createObjectURL = (blob: Blob | MediaSource) => {
          if (blob instanceof Blob) exported = blob;
          return "blob:test";
        };
        URL.revokeObjectURL = () => undefined;
        HTMLAnchorElement.prototype.click = function () {
          downloadedName = this.download;
        };
        await (
          window as unknown as {
            documentActionsTest: {
              downloadA4PageAsPng: (
                element: HTMLElement,
                fileName: string
              ) => Promise<void>;
            };
          }
        ).documentActionsTest.downloadA4PageAsPng(
          document.querySelector<HTMLElement>(".target")!,
          "arabic.png"
        );
        if (!exported) throw new Error("PNG was not downloaded");
        const bitmap = await createImageBitmap(exported);
        const referenceBitmap = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${referenceBase64}`)).blob()
        );
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        const referenceCanvas = document.createElement("canvas");
        referenceCanvas.width = referenceBitmap.width;
        referenceCanvas.height = referenceBitmap.height;
        const referenceContext = referenceCanvas.getContext("2d")!;
        referenceContext.drawImage(referenceBitmap, 0, 0);
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        ).data;
        const referencePixels = referenceContext.getImageData(
          0,
          0,
          referenceCanvas.width,
          referenceCanvas.height
        ).data;
        let differingSamples = 0;
        let sampleCount = 0;
        for (let y = 0; y < canvas.height; y += 3) {
          for (let x = 0; x < canvas.width; x += 3) {
            const index = (y * canvas.width + x) * 4;
            const difference = Math.max(
              Math.abs(pixels[index]! - referencePixels[index]!),
              Math.abs(pixels[index + 1]! - referencePixels[index + 1]!),
              Math.abs(pixels[index + 2]! - referencePixels[index + 2]!)
            );
            if (difference > 32) differingSamples += 1;
            sampleCount += 1;
          }
        }
        return {
          downloadedName,
          width: bitmap.width,
          height: bitmap.height,
          differingRatio: differingSamples / sampleCount,
        };
      }, reference.toString("base64"));
      expect(output.downloadedName).toBe("arabic.png");
      expect(output.width).toBe(3176);
      expect(output.height).toBe(1400);
      // Allow minor rasterizer antialiasing differences, not broken shaping.
      expect(output.differingRatio).toBeLessThan(0.008);
    } finally {
      await browser.close();
    }
  }, 60_000);

  it("exports full-size PNGs independent of preview scaling and clipping", async () => {
    const bundle = await build({
      entryPoints: [
        resolve("client/src/features/document-studio/documentActions.ts"),
      ],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "documentActionsTest",
      platform: "browser",
      define: {
        "import.meta.env": JSON.stringify({ VITE_APPWRITE_API_URL: "" }),
      },
    });
    const browser = await chromium.launch({
      executablePath:
        chromiumPath ?? (await sparticuzChromium.executablePath()),
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 320, height: 480 },
      });
      await page.setContent(`<!doctype html><html><body>
        <div style="position:relative;width:80px;height:80px;overflow:hidden">
          <div class="document-a4-page" style="box-sizing:border-box;width:120px;height:160px;position:absolute;left:50%;transform-origin:top center;background:rgb(255,0,0)">
            <div style="position:absolute;right:0;bottom:0;width:20px;height:20px;background:rgb(0,200,0)"></div>
          </div>
        </div></body></html>`);
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
      const results = await page.evaluate(async () => {
        let exported: Blob | null = null;
        URL.createObjectURL = blob => {
          if (blob instanceof Blob) exported = blob;
          return "blob:test";
        };
        URL.revokeObjectURL = () => undefined;
        HTMLAnchorElement.prototype.click = () => undefined;
        const element =
          document.querySelector<HTMLElement>(".document-a4-page")!;
        const action = (
          window as unknown as {
            documentActionsTest: {
              downloadA4PageAsPng: (
                el: HTMLElement,
                name: string
              ) => Promise<void>;
            };
          }
        ).documentActionsTest.downloadA4PageAsPng;
        const outputs = [];
        for (const scale of [0.4, 1, 1.8]) {
          element.style.transform = `translateX(-50%) scale(${scale})`;
          exported = null;
          await action(element, "fixture.png");
          if (!exported) throw new Error("PNG was not downloaded");
          const bitmap = await createImageBitmap(exported);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d")!;
          context.drawImage(bitmap, 0, 0);
          outputs.push({
            width: bitmap.width,
            height: bitmap.height,
            corner: Array.from(
              context.getImageData(bitmap.width - 15, bitmap.height - 15, 1, 1)
                .data
            ),
          });
        }
        return outputs;
      });
      for (const result of results) {
        expect(result.width).toBe(480);
        expect(result.height).toBe(640);
        expect(result.corner[1]).toBeGreaterThan(150);
        expect(result.corner[0]).toBeLessThan(50);
      }
    } finally {
      await browser.close();
    }
  }, 60_000);
});
