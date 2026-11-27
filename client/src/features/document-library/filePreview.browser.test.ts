import { existsSync } from "node:fs";
import { resolve } from "node:path";
import sparticuzChromium from "@sparticuz/chromium";
import { build } from "esbuild";
import { zipSync } from "fflate";
import { chromium } from "playwright-core";
import { describe, expect, it } from "vitest";

const chromiumPath =
  process.env.CHROMIUM_PATH ??
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const docxMimeType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
type PreviewFetchCall = {
  url: string;
  method: string;
  credentials?: RequestCredentials;
};
type PreviewTestWindow = Window & {
  fixtureUrl: string;
  fixtureMime: string;
  fixtureDocumentId: string;
  previewFetchCalls: PreviewFetchCall[];
};

function makeDocx(): Buffer {
  return Buffer.from(
    zipSync({
      "[Content_Types].xml": Buffer.from(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
      ),
      "_rels/.rels": Buffer.from(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
      ),
      "word/document.xml": Buffer.from(
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>First page</w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>Second page</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>'
      ),
    })
  );
}

describe.skipIf(
  !chromiumPath && !(process.platform === "linux" && process.arch === "x64")
)("Word preview in Chromium", () => {
  it("falls back to the signed original DOCX when PDF conversion fails", async () => {
    const bundle = await build({
      stdin: {
        contents: `import React from "react";
          import { createRoot } from "react-dom/client";
          import FilePreview from "./client/src/features/document-library/FilePreview.tsx";
          createRoot(document.getElementById("root")).render(
            React.createElement(FilePreview, {url: window.fixtureUrl, fileName: "sample.docx", mimeType: window.fixtureMime, documentId: window.fixtureDocumentId})
          );`,
        resolveDir: resolve("."),
        loader: "tsx",
      },
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      jsx: "automatic",
      plugins: [
        {
          name: "unused-pdfjs-stub",
          setup(builder) {
            builder.onResolve({ filter: /^pdfjs-dist(?:\/|$)/ }, args => ({
              path: args.path,
              namespace: "pdfjs-stub",
            }));
            builder.onLoad({ filter: /.*/, namespace: "pdfjs-stub" }, () => ({
              contents:
                'export const GlobalWorkerOptions = {}; export function getDocument() { throw new Error("Unexpected PDF load"); } export default "";',
              loader: "js",
            }));
          },
        },
      ],
      define: { "import.meta.env.VITE_APPWRITE_API_URL": '""' },
    });
    const browser = await chromium.launch({
      executablePath:
        chromiumPath ?? (await sparticuzChromium.executablePath()),
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(`<!doctype html><html dir="rtl"><head><style>
        * { box-sizing: border-box }
        #root { width: 350px; }
        .relative { position: relative }
        .overflow-hidden { overflow: hidden }
        .w-max { width: max-content }
        .min-w-full { min-width: 100% }
        .mx-auto { margin-left: auto; margin-right: auto }
        .p-2 { padding: 8px }
        .document-word-preview-viewport { contain: layout paint; min-height: 160px }
        .document-word-preview .docx-wrapper { min-width: max-content; padding: 0 !important }
        .document-word-preview .docx { margin: 0 auto 12px !important }
      </style></head><body><div id="root"></div></body></html>`);
      await page.evaluate(
        ({ url, mime }) => {
          const testWindow = window as PreviewTestWindow;
          Object.assign(testWindow, {
            fixtureUrl: url,
            fixtureMime: mime,
            fixtureDocumentId: "imported-document-1",
            previewFetchCalls: [],
          });
          const nativeFetch = window.fetch.bind(window);
          window.fetch = async (input, init) => {
            const target =
              typeof input === "string"
                ? input
                : input instanceof Request
                  ? input.url
                  : input.toString();
            testWindow.previewFetchCalls.push({
              url: target,
              method: init?.method ?? "GET",
              credentials: init?.credentials,
            });
            if (
              target.includes("/api/documents/imported-document-1/print-pdf")
            ) {
              return new Response("conversion unavailable", { status: 502 });
            }
            return nativeFetch(input, init);
          };
        },
        {
          url: `data:${docxMimeType};base64,${makeDocx().toString("base64")}`,
          mime: docxMimeType,
        }
      );
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
      await page.waitForSelector(".docx-wrapper > .docx");
      const fetchCalls = await page.evaluate(
        () => (window as PreviewTestWindow).previewFetchCalls
      );
      expect(fetchCalls).toHaveLength(2);
      expect(fetchCalls[0]).toMatchObject({
        method: "POST",
        credentials: "include",
      });
      expect(fetchCalls[0]?.url).toContain(
        "/api/documents/imported-document-1/print-pdf"
      );
      expect(fetchCalls[1]).toMatchObject({
        method: "GET",
        credentials: "omit",
      });
      expect(fetchCalls[1]?.url).toMatch(/^data:/);
      await page.waitForFunction(() => {
        const host = document.querySelector<HTMLElement>(
          ".document-word-preview"
        );
        return host && getComputedStyle(host).transform !== "none";
      });

      for (const width of [350, 500, 900]) {
        await page.locator("#root").evaluate((element, value) => {
          element.style.width = `${value}px`;
        }, width);
        await page.waitForTimeout(100);
        const bounds = await page.evaluate(() => {
          const viewport = document
            .querySelector<HTMLElement>(".document-word-preview-viewport")!
            .getBoundingClientRect();
          const pages = Array.from(
            document.querySelectorAll<HTMLElement>(
              ".document-word-preview .docx"
            )
          );
          return {
            viewport: {
              left: viewport.left,
              right: viewport.right,
              width: viewport.width,
            },
            pages: pages.map(page => {
              const rect = page.getBoundingClientRect();
              return { left: rect.left, right: rect.right, width: rect.width };
            }),
          };
        });
        expect(bounds.pages).toHaveLength(2);
        for (const doc of bounds.pages) {
          expect(doc.width).toBeGreaterThan(0);
          expect(doc.left).toBeGreaterThanOrEqual(bounds.viewport.left - 1);
          expect(doc.right).toBeLessThanOrEqual(bounds.viewport.right + 1);
          expect(
            Math.abs(
              (doc.left + doc.right) / 2 -
                (bounds.viewport.left + bounds.viewport.right) / 2
            )
          ).toBeLessThan(2);
        }
      }

      expect(await page.locator(".docx-wrapper").innerText()).toContain(
        "First page"
      );

      await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>("#root")!;
        root.style.width = "350px";
      });
      await page.waitForTimeout(250);
      const firstScale = await page.evaluate(() => {
        const host = document.querySelector<HTMLElement>(
          ".document-word-preview"
        )!;
        return Number.parseFloat(getComputedStyle(host).zoom);
      });
      await page.waitForTimeout(750);
      const secondScale = await page.evaluate(() => {
        const host = document.querySelector<HTMLElement>(
          ".document-word-preview"
        )!;
        return Number.parseFloat(getComputedStyle(host).zoom);
      });
      expect(firstScale).toBeGreaterThan(0.01);
      // Chromium may report a small layout delta while ResizeObserver settles
      // on shared CI runners; this still catches a meaningful continued shrink.
      expect(Math.abs(secondScale - firstScale)).toBeLessThan(0.02);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
