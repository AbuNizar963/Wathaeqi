import { existsSync } from "node:fs";
import { resolve } from "node:path";
import sparticuzChromium from "@sparticuz/chromium";
import { build } from "esbuild";
import { zipSync } from "fflate";
import { chromium } from "playwright-core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

const chromiumPath =
  process.env.CHROMIUM_PATH ??
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const docxMimeType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// A real, synthetic DOCX with explicit page breaks and a footer near the edge.
function makeDocx(pageCount: number): Buffer {
  const body = Array.from({ length: pageCount }, (_, index) => {
    const pageBreak = index
      ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
      : "";
    const richContent =
      index === 0
        ? '<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="C00000"/><w:rFonts w:ascii="Arial"/></w:rPr><w:t>LTR FORMAT</w:t></w:r></w:p><w:p><w:pPr><w:bidi/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="28"/></w:rPr><w:t>نص عربي منسق</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>جدول</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Table</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="914400" cy="914400"/><wp:docPr id="1" name="fixture-image"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="fixture.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
        : "";
    return `${pageBreak}${richContent}<w:p><w:r><w:t>PAGE${index + 1}TOP</w:t></w:r></w:p>`;
  }).join("");
  const fixturePng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
    "base64"
  );
  return Buffer.from(
    zipSync({
      "[Content_Types].xml": Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`
      ),
      "_rels/.rels": Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
      ),
      "word/_rels/document.xml.rels": Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/fixture.png"/></Relationships>`
      ),
      "word/document.xml": Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="rId1"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="180" w:gutter="0"/></w:sectPr></w:body></w:document>`
      ),
      "word/media/fixture.png": fixturePng,
      "word/footer1.xml": Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>BOTTOMMARK</w:t></w:r></w:p></w:ftr>`
      ),
    })
  );
}

describe.skipIf(
  !chromiumPath && !(process.platform === "linux" && process.arch === "x64")
)("original document printing in Chromium", () => {
  it("fits every source page and its footer on A4 for every pages-per-sheet option", async () => {
    // Stub only the unrelated PDF renderer; the DOCX parser and print path are real.
    const bundle = await build({
      entryPoints: [
        resolve("client/src/features/document-library/printOriginal.ts"),
      ],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "printOriginalTest",
      platform: "browser",
      define: {
        "import.meta.env": JSON.stringify({
          BASE_URL: "/",
          VITE_APPWRITE_API_URL: "",
        }),
      },
      plugins: [
        {
          name: "pdfjs-browser-test-stub",
          setup(builder) {
            builder.onResolve({ filter: /^pdfjs-dist(?:\/|$)/ }, args => ({
              path: args.path,
              namespace: "pdfjs-stub",
            }));
            builder.onLoad({ filter: /.*/, namespace: "pdfjs-stub" }, args => ({
              contents: args.path.endsWith("?url")
                ? 'export default "pdf.worker.js";'
                : `export const GlobalWorkerOptions = {};
                     export function getDocument() {
                       const page = {
                         getViewport: ({ scale }) => ({ width: 612 * scale, height: 792 * scale }),
                         render: ({ canvas, canvasContext }) => {
                           canvasContext.fillStyle = "#fff";
                           canvasContext.fillRect(0, 0, canvas.width, canvas.height);
                           return { promise: Promise.resolve() };
                         },
                         cleanup() {},
                       };
                       return { promise: Promise.resolve({ numPages: 1, getPage: async () => page, destroy: async () => {} }) };
                     }`,
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
      await page.evaluate(() => {
        window.print = () => undefined;
        window.open = () => {
          throw new Error("Printing must not create a popup");
        };
      });
      const url = `data:${docxMimeType};base64,${makeDocx(9).toString("base64")}`;
      const fileName =
        "fixture</title><script>window.injected = true</script>.docx";
      for (const pagesPerSheet of [1, 2, 4, 6, 8]) {
        const printPromise = page.evaluate(
          ({ url, mimeType, pagesPerSheet, fileName }) =>
            (
              window as unknown as {
                printOriginalTest: {
                  openOriginalPrintWindow: (options: unknown) => Promise<void>;
                };
              }
            ).printOriginalTest.openOriginalPrintWindow({
              url,
              mimeType,
              pagesPerSheet,
              fileName,
            }),
          { url, mimeType: docxMimeType, pagesPerSheet, fileName }
        );
        await printPromise;
        expect(await page.title()).toBe(`طباعة ${fileName}`);
        expect(await page.locator("#wathaeqi-print-root script").count()).toBe(
          0
        );
        await page.emulateMedia({ media: "print" });
        const layout = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll<HTMLElement>(
              "section.wathaeqi-print-docx"
            ),
            sourcePage => {
              const source = sourcePage.getBoundingClientRect();
              const cell = sourcePage.closest<HTMLElement>(".cell");
              const target = cell?.getBoundingClientRect();
              const footer = sourcePage
                .querySelector("footer")
                ?.getBoundingClientRect();
              return {
                display: getComputedStyle(sourcePage).display,
                source: {
                  left: source.left,
                  top: source.top,
                  right: source.right,
                  bottom: source.bottom,
                  height: source.height,
                },
                cell: target && {
                  left: target.left,
                  top: target.top,
                  right: target.right,
                  bottom: target.bottom,
                },
                footer: footer && { top: footer.top, bottom: footer.bottom },
              };
            }
          )
        );
        expect(layout, `source pages for ${pagesPerSheet}`).toHaveLength(9);
        for (const sourcePage of layout) {
          expect(sourcePage.display).toBe("flex");
          expect(sourcePage.footer).toBeDefined();
          expect(sourcePage.footer!.top).toBeGreaterThan(
            sourcePage.source.top + sourcePage.source.height * 0.75
          );
          expect(sourcePage.footer!.bottom).toBeLessThanOrEqual(
            sourcePage.source.bottom + 0.1
          );
          if (pagesPerSheet !== 1) {
            expect(sourcePage.cell).toBeDefined();
            expect(sourcePage.source.left).toBeGreaterThanOrEqual(
              sourcePage.cell!.left - 0.1
            );
            expect(sourcePage.source.top).toBeGreaterThanOrEqual(
              sourcePage.cell!.top - 0.1
            );
            expect(sourcePage.source.right).toBeLessThanOrEqual(
              sourcePage.cell!.right + 0.1
            );
            expect(sourcePage.source.bottom).toBeLessThanOrEqual(
              sourcePage.cell!.bottom + 0.1
            );
          }
        }

        expect(
          await page
            .locator("section.wathaeqi-print-docx")
            .first()
            .locator("img")
            .count(),
          `embedded images for ${pagesPerSheet}`
        ).toBe(1);
        expect(
          await page
            .locator("section.wathaeqi-print-docx")
            .first()
            .locator("table")
            .count(),
          `tables for ${pagesPerSheet}`
        ).toBe(1);
        expect(
          await page
            .locator("section.wathaeqi-print-docx")
            .first()
            .textContent()
        ).toContain("LTR FORMAT");
        expect(
          await page
            .locator("section.wathaeqi-print-docx")
            .first()
            .textContent()
        ).toContain("نص عربي منسق");

        const pdf = await page.pdf({
          format: "A4",
          preferCSSPageSize: true,
          printBackground: true,
        });
        const loadingTask = getDocument({ data: new Uint8Array(pdf) });
        const pdfDocument = await loadingTask.promise;
        try {
          expect(pdfDocument.numPages, `sheets for ${pagesPerSheet}`).toBe(
            Math.ceil(9 / pagesPerSheet)
          );
          for (let sheet = 1; sheet <= pdfDocument.numPages; sheet += 1) {
            const pdfPage = await pdfDocument.getPage(sheet);
            const content = await pdfPage.getTextContent();
            const text = content.items
              .map(item => ("str" in item ? item.str : ""))
              .join(" ");
            const first = (sheet - 1) * pagesPerSheet + 1;
            const last = Math.min(sheet * pagesPerSheet, 9);
            for (let number = first; number <= last; number += 1) {
              expect(text, `page ${number} for ${pagesPerSheet}`).toContain(
                `PAGE${number}TOP`
              );
            }
            expect(
              text.match(/BOTTOMMARK/g),
              `footers on sheet ${sheet} for ${pagesPerSheet}`
            ).toHaveLength(last - first + 1);
          }
        } finally {
          await loadingTask.destroy();
        }
        await page.evaluate(() =>
          window.dispatchEvent(new Event("afterprint"))
        );
        await page.emulateMedia({ media: "screen" });
      }

      const repeatedPrintPromise = page.evaluate(
        ({ url, mimeType, fileName }) =>
          (
            window as unknown as {
              printOriginalTest: {
                openOriginalPrintWindow: (options: unknown) => Promise<void>;
              };
            }
          ).printOriginalTest.openOriginalPrintWindow({
            url,
            mimeType,
            fileName,
            layoutMode: "repeat",
            copiesPerSheet: 2,
          }),
        { url, mimeType: docxMimeType, fileName: "repeat-fixture.docx" }
      );
      await repeatedPrintPromise;
      await page.emulateMedia({ media: "print" });
      const repeatedPdf = await page.pdf({
        format: "A4",
        preferCSSPageSize: true,
        printBackground: true,
      });
      const repeatedTask = getDocument({ data: new Uint8Array(repeatedPdf) });
      try {
        const repeatedDocument = await repeatedTask.promise;
        expect(repeatedDocument.numPages).toBe(9);
        for (let index = 1; index <= 9; index += 1) {
          const printedPage = await repeatedDocument.getPage(index);
          const text = (await printedPage.getTextContent()).items
            .map(item => ("str" in item ? item.str : ""))
            .join(" ");
          expect(text.match(new RegExp(`PAGE${index}TOP`, "g"))).toHaveLength(
            2
          );
          expect(text.match(/BOTTOMMARK/g)).toHaveLength(2);
          for (let other = 1; other <= 9; other += 1) {
            if (other !== index) expect(text).not.toContain(`PAGE${other}TOP`);
          }
        }
      } finally {
        await repeatedTask.destroy();
      }
      await page.close();
    } finally {
      await browser.close();
    }
  }, 90_000);

  it("renders PDF pages at a high print ratio using revocable Blob URLs", async () => {
    const bundle = await build({
      entryPoints: [
        resolve("client/src/features/document-library/printOriginal.ts"),
      ],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "printOriginalTest",
      platform: "browser",
      define: {
        "import.meta.env": JSON.stringify({
          BASE_URL: "/",
          VITE_APPWRITE_API_URL: "",
        }),
      },
      plugins: [
        {
          name: "pdfjs-browser-test-stub",
          setup(builder) {
            builder.onResolve({ filter: /^pdfjs-dist(?:\/|$)/ }, args => ({
              path: args.path,
              namespace: "pdfjs-stub",
            }));
            builder.onLoad({ filter: /.*/, namespace: "pdfjs-stub" }, args => ({
              contents: args.path.endsWith("?url")
                ? 'export default "pdf.worker.js";'
                : `export const GlobalWorkerOptions = {};
                     export function getDocument() {
                       const page = {
                         getViewport: ({ scale }) => ({ width: 612 * scale, height: 792 * scale }),
                         render: ({ canvas, canvasContext }) => {
                           canvasContext.fillStyle = "#fff";
                           canvasContext.fillRect(0, 0, canvas.width, canvas.height);
                           return { promise: Promise.resolve() };
                         },
                         cleanup() {},
                       };
                       return { promise: Promise.resolve({ numPages: 1, getPage: async () => page, destroy: async () => {} }) };
                     }`,
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
      await page.evaluate(() => {
        window.print = () => undefined;
        window.open = () => {
          throw new Error("Printing must not create a popup");
        };
      });
      await page.evaluate(() => {
        const revoked: string[] = [];
        const revoke = URL.revokeObjectURL.bind(URL);
        URL.revokeObjectURL = url => {
          revoked.push(url);
          revoke(url);
        };
        (window as unknown as { revokedBlobUrls: string[] }).revokedBlobUrls =
          revoked;
      });
      const printPromise = page.evaluate(() =>
        (
          window as unknown as {
            printOriginalTest: {
              openOriginalPrintWindow: (options: unknown) => Promise<void>;
            };
          }
        ).printOriginalTest.openOriginalPrintWindow({
          url: "data:application/pdf;base64,JVBERi0xLjQK",
          fileName: "fixture.pdf",
          mimeType: "application/pdf",
        })
      );
      await printPromise;
      await page.waitForFunction(() => {
        const image = document.querySelector("img");
        return image?.complete && image.naturalWidth > 0;
      });
      const image = await page.locator("img").evaluate(node => ({
        src: (node as HTMLImageElement).src,
        width: (node as HTMLImageElement).naturalWidth,
        height: (node as HTMLImageElement).naturalHeight,
      }));
      expect(image.src).toMatch(/^blob:/);
      expect(image.width).toBe(3060);
      expect(image.height).toBe(3960);
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await page.waitForFunction(
        () =>
          (window as unknown as { revokedBlobUrls: string[] }).revokedBlobUrls
            .length > 0
      );
    } finally {
      await browser.close();
    }
  }, 60_000);
});
