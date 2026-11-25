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

function landscapeDocx(): Buffer {
  return Buffer.from(
    zipSync({
      "[Content_Types].xml": Buffer.from(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
      ),
      "_rels/.rels": Buffer.from(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
      ),
      "word/document.xml": Buffer.from(
        `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblPr><w:tblW w:w="14000" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="7000"/><w:gridCol w:w="7000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="7000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>LEFTMARK</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="7000" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>RIGHTMOSTMARK</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`
      ),
    })
  );
}

describe.skipIf(
  !chromiumPath && !(process.platform === "linux" && process.arch === "x64")
)("landscape Word printing in Chromium", () => {
  it("keeps both ends of a wide table at one, two and four pages per sheet", async () => {
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
      await page.evaluate(() => {
        window.print = () => undefined;
        window.open = () => {
          throw new Error("Printing must not create a popup");
        };
      });
      const url = `data:${docxMimeType};base64,${landscapeDocx().toString("base64")}`;
      for (const pagesPerSheet of [1, 2, 4]) {
        const printPromise = page.evaluate(
          ({ url, mimeType, pagesPerSheet }) =>
            (
              window as unknown as {
                printOriginalTest: {
                  openOriginalPrintWindow(options: unknown): Promise<void>;
                };
              }
            ).printOriginalTest.openOriginalPrintWindow({
              url,
              fileName: "landscape.docx",
              mimeType,
              pagesPerSheet,
              orientation: "landscape",
            }),
          { url, mimeType: docxMimeType, pagesPerSheet }
        );
        await printPromise;
        await page.emulateMedia({ media: "print" });
        const printed = await page.pdf({
          preferCSSPageSize: true,
          printBackground: true,
        });
        const loadingTask = getDocument({ data: new Uint8Array(printed) });
        try {
          const pdf = await loadingTask.promise;
          const pdfPage = await pdf.getPage(1);
          const viewport = pdfPage.getViewport({ scale: 1 });
          const text = (await pdfPage.getTextContent()).items
            .map(item => ("str" in item ? item.str : ""))
            .join(" ");
          expect(text, `left marker for ${pagesPerSheet}`).toContain(
            "LEFTMARK"
          );
          expect(text, `right marker for ${pagesPerSheet}`).toContain(
            "RIGHTMOSTMARK"
          );
          if (pagesPerSheet === 1)
            expect(viewport.width).toBeGreaterThan(viewport.height);
        } finally {
          await loadingTask.destroy();
        }
        await page.evaluate(() =>
          window.dispatchEvent(new Event("afterprint"))
        );
        await page.emulateMedia({ media: "screen" });
      }
    } finally {
      await browser.close();
    }
  }, 60_000);
});
