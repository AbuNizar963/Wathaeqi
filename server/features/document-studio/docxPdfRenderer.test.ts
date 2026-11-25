import { existsSync } from "node:fs";
import { zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import type { Browser, BrowserContext, Page } from "playwright-core";
import {
  createDocxToPdfConverter,
  MAX_DOCX_ENTRY_BYTES,
  DOCX_TO_PDF_TIMEOUT_MS,
  DocxConversionError,
  validateDocxBytes,
} from "./docxPdfRenderer";

const validDocx = Buffer.from(
  zipSync({
    "[Content_Types].xml": Buffer.from("<Types/>", "utf8"),
    "word/document.xml": Buffer.from("<document/>", "utf8"),
  })
);
const realChromiumPath =
  process.env.CHROMIUM_PATH?.trim() ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const realDocxFixture = Buffer.from(
  zipSync({
    "[Content_Types].xml": Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
    ),
    "_rels/.rels": Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
    ),
    "word/document.xml": Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Offline DOCX fixture</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`
    ),
  })
);

function createFakeBrowser() {
  const pdf = Buffer.from("%PDF-1.7\nmock PDF data");
  let evaluateCount = 0;
  const evaluatedFunctionSources: string[] = [];
  const page = {
    setDefaultTimeout: vi.fn(),
    setContent: vi.fn().mockResolvedValue(undefined),
    addStyleTag: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockImplementation(async (callback: unknown) => {
      if (typeof callback === "function") {
        evaluatedFunctionSources.push(callback.toString());
      }
      evaluateCount += 1;
      return evaluateCount === 1 ? undefined : 2;
    }),
    pdf: vi.fn().mockResolvedValue(pdf),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
  const context = {
    route: vi.fn().mockResolvedValue(undefined),
    setOffline: vi.fn().mockResolvedValue(undefined),
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as BrowserContext;
  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Browser;
  return { browser, context, page, pdf, evaluatedFunctionSources };
}

const bundleLoader = async () => ({ jsZip: "", docxPreview: "" });

describe("DOCX to PDF renderer", () => {
  it("validates the ZIP document before starting Chromium", async () => {
    const launchBrowser = vi.fn();
    const convert = createDocxToPdfConverter({
      launchBrowser,
      loadRendererBundles: bundleLoader,
    });

    await expect(convert(Buffer.from("not a docx"))).rejects.toMatchObject({
      code: "invalid_docx",
    });
    expect(launchBrowser).not.toHaveBeenCalled();
  });

  it("rejects DOCX entries whose actual expanded size differs from ZIP metadata", () => {
    const forgedSize = Buffer.from(validDocx);
    let centralDirectoryOffset = -1;
    for (let offset = 0; offset <= forgedSize.length - 46; offset += 1) {
      if (forgedSize.readUInt32LE(offset) === 0x02014b50) {
        centralDirectoryOffset = offset;
        break;
      }
    }
    expect(centralDirectoryOffset).toBeGreaterThanOrEqual(0);
    forgedSize.writeUInt32LE(1, centralDirectoryOffset + 24);

    expect(() => validateDocxBytes(forgedSize)).toThrow(DocxConversionError);
  });

  it("stops actual per-entry ZIP expansion at the real byte limit before Chromium", async () => {
    const oversizedEntry = Buffer.alloc(MAX_DOCX_ENTRY_BYTES + 1, 0x41);
    const entries: Record<string, Uint8Array> = {
      "[Content_Types].xml": Buffer.from("<Types/>", "utf8"),
      "word/document.xml": Buffer.from("<document/>", "utf8"),
      "word/media/image.bin": oversizedEntry,
    };
    const forgedArchive = Buffer.from(zipSync(entries, { level: 6 }));
    for (let offset = 0; offset <= forgedArchive.length - 46; offset += 1) {
      if (forgedArchive.readUInt32LE(offset) !== 0x02014b50) continue;
      const nameLength = forgedArchive.readUInt16LE(offset + 28);
      const nameStart = offset + 46;
      const name = forgedArchive
        .subarray(nameStart, nameStart + nameLength)
        .toString("utf8");
      if (name.startsWith("word/media/")) {
        forgedArchive.writeUInt32LE(1, offset + 24);
      }
    }

    const launchBrowser = vi.fn();
    const convert = createDocxToPdfConverter({
      launchBrowser,
      loadRendererBundles: bundleLoader,
    });
    await expect(convert(forgedArchive)).rejects.toMatchObject({
      code: "expanded_docx_too_large",
    });
    expect(launchBrowser).not.toHaveBeenCalled();
  });

  it("converts a valid DOCX with a mocked browser and enforces PDF output", async () => {
    const fake = createFakeBrowser();
    const convert = createDocxToPdfConverter({
      launchBrowser: async () => fake.browser,
      loadRendererBundles: bundleLoader,
    });

    await expect(convert(validDocx)).resolves.toEqual(fake.pdf);
    expect(fake.evaluatedFunctionSources).toHaveLength(2);
    expect(fake.evaluatedFunctionSources.join("\n")).not.toContain("__name");
    expect(fake.page.addStyleTag).toHaveBeenCalledWith({
      content: expect.stringContaining(
        "html,body{margin:0!important;padding:0!important}"
      ),
    });
    expect(fake.page.pdf).toHaveBeenCalledWith(
      expect.objectContaining({ format: "A4", printBackground: true })
    );
    expect(fake.browser.close).toHaveBeenCalled();
  });

  it.skipIf(!realChromiumPath)(
    "converts a real DOCX fixture with local Chromium without external requests",
    async () => {
      const previousChromiumPath = process.env.CHROMIUM_PATH;
      process.env.CHROMIUM_PATH = realChromiumPath!;
      try {
        const pdf = await createDocxToPdfConverter()(realDocxFixture);
        expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
        expect(pdf.byteLength).toBeGreaterThan(100);
      } finally {
        if (previousChromiumPath === undefined) {
          delete process.env.CHROMIUM_PATH;
        } else {
          process.env.CHROMIUM_PATH = previousChromiumPath;
        }
      }
    },
    DOCX_TO_PDF_TIMEOUT_MS + 5_000
  );

  it("times out before the function request deadline and closes late Chromium startup", async () => {
    expect(DOCX_TO_PDF_TIMEOUT_MS).toBeLessThan(55_000);
    const fake = createFakeBrowser();
    let resolveLaunch!: (browser: Browser) => void;
    const launchBrowser = () =>
      new Promise<Browser>(resolve => {
        resolveLaunch = resolve;
      });
    const convert = createDocxToPdfConverter({
      launchBrowser,
      loadRendererBundles: bundleLoader,
      timeoutMs: 5,
    });

    const result = convert(validDocx);
    await expect(result).rejects.toMatchObject({
      code: "conversion_timeout",
    } satisfies Partial<DocxConversionError>);
    resolveLaunch(fake.browser);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fake.browser.close).toHaveBeenCalled();
    expect(fake.browser.newContext).not.toHaveBeenCalled();
  });
});
