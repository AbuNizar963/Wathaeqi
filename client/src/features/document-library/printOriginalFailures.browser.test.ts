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

function overflowingDocx(): Buffer {
  const paragraphs = Array.from(
    { length: 120 },
    (_, index) => `<w:p><w:r><w:t>Paragraph ${index + 1}</w:t></w:r></w:p>`
  ).join("");
  return Buffer.from(
    zipSync({
      "[Content_Types].xml": Buffer.from(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
      ),
      "_rels/.rels": Buffer.from(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
      ),
      "word/document.xml": Buffer.from(
        `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`
      ),
    })
  );
}

describe.skipIf(
  !chromiumPath && !(process.platform === "linux" && process.arch === "x64")
)("original print failure handling in Chromium", () => {
  it("closes the owned popup on network failure, invalid Word, or unsafe Word pagination and refreshes URLs after opening", async () => {
    const bundle = await build({
      entryPoints: [
        resolve("client/src/features/document-library/printOriginal.ts"),
      ],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "printOriginalTest",
      platform: "browser",
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
                'export const GlobalWorkerOptions = {}; export default "";',
              loader: "js",
            }));
          },
        },
      ],
    });
    const browser = await chromium.launch({
      executablePath:
        chromiumPath ?? (await sparticuzChromium.executablePath()),
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.goto("data:text/html,<html><body></body></html>");
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
      const overflowUrl = `data:${docxMimeType};base64,${overflowingDocx().toString("base64")}`;
      const results = await page.evaluate(
        async ({ overflowUrl, docxMimeType }) => {
          const api = (
            window as unknown as {
              printOriginalTest: {
                openOriginalPrintWindow(options: unknown): Promise<void>;
              };
            }
          ).printOriginalTest;
          const realOpen = window.open.bind(window);
          let popup: Window | null = null;
          window.open = (...args) => {
            popup = realOpen(...args);
            if (popup) popup.print = () => undefined;
            return popup;
          };
          const actualFetch = window.fetch;
          const failures = [];
          for (const [fileName, mimeType] of [
            ["a.pdf", "application/pdf"],
            ["a.docx", docxMimeType],
            ["a.png", "image/png"],
          ]) {
            window.fetch = async () => {
              throw new Error("synthetic network failure");
            };
            try {
              await api.openOriginalPrintWindow({
                url: "https://example.test/file",
                fileName,
                mimeType,
              });
              failures.push({ fileName, rejected: false, closed: false });
            } catch {
              failures.push({
                fileName,
                rejected: true,
                closed: Boolean(popup?.closed),
              });
              if (popup && !popup.closed) popup.close();
            }
          }
          window.fetch = actualFetch;
          let overflow = { rejected: false, closed: false, message: "" };
          try {
            await api.openOriginalPrintWindow({
              url: overflowUrl,
              fileName: "a.docx",
              mimeType: docxMimeType,
              pagesPerSheet: 2,
            });
          } catch (error) {
            overflow = {
              rejected: true,
              closed: Boolean(popup?.closed),
              message: String(error),
            };
          }
          if (popup && !popup.closed) popup.close();
          let openedBeforeRefresh = false;
          let refreshCalled = false;
          try {
            await api.openOriginalPrintWindow({
              url: "https://expired.example.test/file",
              fileName: "a.docx",
              mimeType: docxMimeType,
              resolveUrl: async () => {
                refreshCalled = true;
                openedBeforeRefresh = Boolean(popup && !popup.closed);
                throw new Error("synthetic refresh failure");
              },
            });
          } catch {}
          const refreshClosed = Boolean(popup?.closed);
          if (popup && !popup.closed) popup.close();
          return {
            failures,
            overflow,
            refreshCalled,
            openedBeforeRefresh,
            refreshClosed,
          };
        },
        { overflowUrl, docxMimeType }
      );
      expect(results.failures).toEqual([
        { fileName: "a.pdf", rejected: true, closed: true },
        { fileName: "a.docx", rejected: true, closed: true },
        { fileName: "a.png", rejected: true, closed: true },
      ]);
      expect(results.overflow.rejected).toBe(true);
      expect(results.overflow.closed).toBe(true);
      expect(results.overflow.message).toContain("PDF");
      expect(results.refreshCalled).toBe(true);
      expect(results.openedBeforeRefresh).toBe(true);
      expect(results.refreshClosed).toBe(true);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
