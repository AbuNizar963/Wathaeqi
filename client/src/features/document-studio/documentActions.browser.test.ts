import { existsSync } from "node:fs";
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
      expect(output.width).toBe(360);
      expect(output.height).toBe(480);
      expect(output.pixel[1]).toBeGreaterThan(180);
      expect(output.background[0]).toBeGreaterThan(output.background[1]! * 2);
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
        expect(result.width).toBe(360);
        expect(result.height).toBe(480);
        expect(result.corner[1]).toBeGreaterThan(150);
        expect(result.corner[0]).toBeLessThan(50);
      }
    } finally {
      await browser.close();
    }
  }, 60_000);
});
