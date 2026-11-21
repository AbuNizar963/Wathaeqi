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
    return `${pageBreak}<w:p><w:r><w:t>PAGE${index + 1}TOP</w:t></w:r></w:p>`;
  }).join("");
  return Buffer.from(
    zipSync({
      "[Content_Types].xml": Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`
      ),
      "_rels/.rels": Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
      ),
      "word/_rels/document.xml.rels": Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`
      ),
      "word/document.xml": Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="rId1"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="180" w:gutter="0"/></w:sectPr></w:body></w:document>`
      ),
      "word/footer1.xml": Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>BOTTOMMARK</w:t></w:r></w:p></w:ftr>`
      ),
    })
  );
}

describe.skipIf(
  !chromiumPath && !(process.platform === "linux" && process.arch === "x64")
)("original Word printing in Chromium", () => {
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
      plugins: [
        {
          name: "unused-pdfjs-stub",
          setup(builder) {
            builder.onResolve({ filter: /^pdfjs-dist(?:\/|$)/ }, args => ({
              path: args.path,
              namespace: "pdfjs-stub",
            }));
            builder.onLoad({ filter: /.*/, namespace: "pdfjs-stub" }, () => ({
              contents: 'export default "";',
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
      const url = `data:${docxMimeType};base64,${makeDocx(9).toString("base64")}`;
      const fileName =
        "fixture</title><script>window.injected = true</script>.docx";
      for (const pagesPerSheet of [1, 2, 4, 6, 8]) {
        const popupPromise = page.waitForEvent("popup");
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
        const popup = await popupPromise;
        await printPromise;
        expect(await popup.title()).toBe(`طباعة ${fileName}`);
        expect(await popup.locator("script").count()).toBe(0);
        await popup.emulateMedia({ media: "print" });
        const layout = await popup.evaluate(() =>
          Array.from(
            document.querySelectorAll<HTMLElement>("section.docx"),
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

        const pdf = await popup.pdf({
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
        await popup.close();
      }
    } finally {
      await browser.close();
    }
  }, 90_000);
});
