import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import type { Browser, BrowserContext, Page } from "playwright-core";

export const MAX_DOCX_BYTES = 25 * 1024 * 1024;
export const MAX_DOCX_EXPANDED_BYTES = 100 * 1024 * 1024;
export const MAX_DOCX_ENTRIES = 4096;
export const MAX_DOCX_ENTRY_BYTES = 64 * 1024 * 1024;
export const MAX_DOCX_PAGES = 300;
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
// Leave time for server startup and response handling within the function limit.
export const DOCX_TO_PDF_TIMEOUT_MS = 40_000;

export type DocxConversionErrorCode =
  | "invalid_input"
  | "input_too_large"
  | "invalid_docx"
  | "expanded_docx_too_large"
  | "page_limit_exceeded"
  | "pdf_too_large"
  | "conversion_timeout"
  | "conversion_failed";

export class DocxConversionError extends Error {
  constructor(readonly code: DocxConversionErrorCode) {
    super(code);
    this.name = "DocxConversionError";
  }
}

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;
const REQUIRED_DOCX_ENTRIES = new Set([
  "[Content_Types].xml",
  "word/document.xml",
]);
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_value, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function calculateCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Validate the input container before Chromium or the DOCX parser is started. */
export function validateDocxBytes(input: Uint8Array): void {
  if (!(input instanceof Uint8Array) || input.byteLength === 0) {
    throw new DocxConversionError("invalid_input");
  }
  if (input.byteLength > MAX_DOCX_BYTES) {
    throw new DocxConversionError("input_too_large");
  }

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (
    input.byteLength < 22 ||
    view.getUint32(0, true) !== ZIP_LOCAL_FILE_HEADER
  ) {
    throw new DocxConversionError("invalid_docx");
  }

  const minEocdOffset = Math.max(0, input.byteLength - 22 - 0xffff);
  let eocdOffset = -1;
  for (
    let offset = input.byteLength - 22;
    offset >= minEocdOffset;
    offset -= 1
  ) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      const commentLength = view.getUint16(offset + 20, true);
      if (offset + 22 + commentLength === input.byteLength) {
        eocdOffset = offset;
        break;
      }
    }
  }
  if (eocdOffset < 0) throw new DocxConversionError("invalid_docx");

  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const directoryDisk = view.getUint16(eocdOffset + 6, true);
  const diskEntryCount = view.getUint16(eocdOffset + 8, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const directorySize = view.getUint32(eocdOffset + 12, true);
  const directoryOffset = view.getUint32(eocdOffset + 16, true);
  if (
    diskNumber !== 0 ||
    directoryDisk !== 0 ||
    diskEntryCount !== entryCount ||
    entryCount === 0 ||
    entryCount === ZIP64_SENTINEL_16 ||
    directorySize === ZIP64_SENTINEL_32 ||
    directoryOffset === ZIP64_SENTINEL_32 ||
    entryCount > MAX_DOCX_ENTRIES ||
    directoryOffset + directorySize !== eocdOffset
  ) {
    throw new DocxConversionError("invalid_docx");
  }

  let cursor = directoryOffset;
  let expandedBytes = 0;
  const entryNames = new Set<string>();
  const decoder = new TextDecoder("utf-8");

  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + 46 > eocdOffset ||
      view.getUint32(cursor, true) !== ZIP_CENTRAL_DIRECTORY_HEADER
    ) {
      throw new DocxConversionError("invalid_docx");
    }

    const flags = view.getUint16(cursor + 8, true);
    const compressionMethod = view.getUint16(cursor + 10, true);
    const expectedCrc32 = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const startDisk = view.getUint16(cursor + 34, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;

    if (
      recordEnd > eocdOffset ||
      nameLength === 0 ||
      startDisk !== 0 ||
      compressedSize === ZIP64_SENTINEL_32 ||
      uncompressedSize === ZIP64_SENTINEL_32 ||
      localHeaderOffset === ZIP64_SENTINEL_32 ||
      (flags & 0x41) !== 0 ||
      (compressionMethod !== 0 && compressionMethod !== 8)
    ) {
      throw new DocxConversionError("invalid_docx");
    }

    if (
      uncompressedSize > MAX_DOCX_ENTRY_BYTES ||
      expandedBytes + uncompressedSize > MAX_DOCX_EXPANDED_BYTES ||
      (uncompressedSize > 0 && compressedSize === 0)
    ) {
      throw new DocxConversionError("expanded_docx_too_large");
    }

    const nameStart = cursor + 46;
    const entryName = decoder.decode(
      input.subarray(nameStart, nameStart + nameLength)
    );
    if (
      entryName.includes("\0") ||
      entryName.startsWith("/") ||
      entryName.includes("\\") ||
      entryName.split("/").some(part => part === "..") ||
      entryNames.has(entryName)
    ) {
      throw new DocxConversionError("invalid_docx");
    }
    entryNames.add(entryName);

    if (
      localHeaderOffset + 30 > directoryOffset ||
      view.getUint32(localHeaderOffset, true) !== ZIP_LOCAL_FILE_HEADER
    ) {
      throw new DocxConversionError("invalid_docx");
    }
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart =
      localHeaderOffset + 30 + localNameLength + localExtraLength;
    if (
      dataStart + compressedSize > directoryOffset ||
      localNameLength !== nameLength ||
      decoder.decode(
        input.subarray(
          localHeaderOffset + 30,
          localHeaderOffset + 30 + localNameLength
        )
      ) !== entryName
    ) {
      throw new DocxConversionError("invalid_docx");
    }

    const compressedBytes = input.subarray(
      dataStart,
      dataStart + compressedSize
    );
    let expandedEntry: Uint8Array;
    try {
      if (compressionMethod === 0) {
        if (compressedSize !== uncompressedSize) {
          throw new DocxConversionError("invalid_docx");
        }
        expandedEntry = compressedBytes;
      } else {
        const remainingExpandedBytes = MAX_DOCX_EXPANDED_BYTES - expandedBytes;
        expandedEntry = inflateRawSync(compressedBytes, {
          maxOutputLength:
            Math.min(MAX_DOCX_ENTRY_BYTES, remainingExpandedBytes) + 1,
        });
      }
    } catch (error) {
      if (error instanceof DocxConversionError) throw error;
      throw new DocxConversionError("expanded_docx_too_large");
    }
    if (
      expandedEntry.byteLength > MAX_DOCX_ENTRY_BYTES ||
      expandedEntry.byteLength > MAX_DOCX_EXPANDED_BYTES - expandedBytes
    ) {
      throw new DocxConversionError("expanded_docx_too_large");
    }
    if (
      expandedEntry.byteLength !== uncompressedSize ||
      calculateCrc32(expandedEntry) !== expectedCrc32
    ) {
      throw new DocxConversionError("invalid_docx");
    }
    expandedBytes += expandedEntry.byteLength;

    cursor = recordEnd;
  }

  if (
    cursor !== directoryOffset + directorySize ||
    [...REQUIRED_DOCX_ENTRIES].some(name => !entryNames.has(name))
  ) {
    throw new DocxConversionError("invalid_docx");
  }
}

type RendererBundles = { jsZip: string; docxPreview: string };
type ConversionDependencies = {
  launchBrowser?: () => Promise<Browser>;
  loadRendererBundles?: () => Promise<RendererBundles>;
  timeoutMs?: number;
};

function stripSourceMapReference(source: string): string {
  return source.replace(/\n?\/\/[#@] sourceMappingURL=.*(?:\r?\n)?$/, "");
}

async function loadInstalledRendererBundles(): Promise<RendererBundles> {
  const appRequire = createRequire(resolve(process.cwd(), "package.json"));
  const docxPreviewPath = appRequire.resolve("docx-preview");
  const rendererRequire = createRequire(docxPreviewPath);
  const jsZipEntryPath = rendererRequire.resolve("jszip");
  const jsZipBundlePath = resolve(
    dirname(dirname(jsZipEntryPath)),
    "dist/jszip.min.js"
  );
  const [jsZip, docxPreview] = await Promise.all([
    readFile(jsZipBundlePath, "utf8"),
    readFile(docxPreviewPath, "utf8"),
  ]);
  return {
    jsZip: stripSourceMapReference(jsZip),
    docxPreview: stripSourceMapReference(docxPreview),
  };
}

async function launchInstalledChromium(): Promise<Browser> {
  const [{ chromium: playwrightChromium }, { default: sparticuzChromium }] =
    await Promise.all([
      import("playwright-core"),
      import("@sparticuz/chromium"),
    ]);
  const executablePath = await sparticuzChromium.executablePath();
  return playwrightChromium.launch({
    args: [
      ...sparticuzChromium.args,
      "--disable-background-networking",
      "--disable-sync",
    ],
    executablePath,
    headless: true,
    timeout: DOCX_TO_PDF_TIMEOUT_MS,
  });
}

function makeCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "object-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
}

const LOAD_RENDERER_IN_PAGE = async (pageArguments: {
  jsZip: string;
  docxPreview: string;
  nonce: string;
}): Promise<void> => {
  const jsZipScript = document.createElement("script");
  jsZipScript.nonce = pageArguments.nonce;
  jsZipScript.textContent = pageArguments.jsZip;
  (document.head ?? document.documentElement).appendChild(jsZipScript);
  jsZipScript.remove();

  const docxPreviewScript = document.createElement("script");
  docxPreviewScript.nonce = pageArguments.nonce;
  docxPreviewScript.textContent = pageArguments.docxPreview;
  (document.head ?? document.documentElement).appendChild(docxPreviewScript);
  docxPreviewScript.remove();
  const renderer = (window as unknown as { docx?: { renderAsync?: unknown } })
    .docx;
  if (typeof renderer?.renderAsync !== "function") {
    throw new Error("DOCX renderer failed to initialize");
  }
};

const RENDER_DOCX_IN_PAGE = async (pageArguments: {
  base64Bytes: string;
}): Promise<number> => {
  const host = document.getElementById("docx-render-host");
  const renderer = (
    window as unknown as {
      docx: {
        renderAsync: (
          data: Uint8Array,
          bodyContainer: HTMLElement,
          styleContainer?: HTMLElement,
          options?: Record<string, unknown>
        ) => Promise<unknown>;
      };
    }
  ).docx;
  if (!host) throw new Error("DOCX rendering host is missing");

  const binary = atob(pageArguments.base64Bytes);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  await renderer.renderAsync(bytes, host, undefined, {
    className: "docx",
    inWrapper: true,
    breakPages: true,
    ignoreLastRenderedPageBreak: false,
    renderHeaders: true,
    renderFooters: true,
    useBase64URL: true,
    renderAltChunks: false,
  });
  await document.fonts?.ready;

  let sections = Array.from(host.querySelectorAll<HTMLElement>("section.docx"));
  if (sections.length === 0) {
    sections = Array.from(
      host.querySelectorAll<HTMLElement>(".docx-wrapper > .docx")
    );
  }
  if (sections.length === 0 && host.childElementCount > 0) sections = [host];
  return sections.length;
};

export function createDocxToPdfConverter(
  dependencies: ConversionDependencies = {}
) {
  const launchBrowser = dependencies.launchBrowser ?? launchInstalledChromium;
  const loadRendererBundles =
    dependencies.loadRendererBundles ?? loadInstalledRendererBundles;
  const timeoutMs = dependencies.timeoutMs ?? DOCX_TO_PDF_TIMEOUT_MS;

  return async function convertDocxToPdf(input: Uint8Array): Promise<Buffer> {
    validateDocxBytes(input);

    let browser: Browser | undefined;
    let browserLaunch: Promise<Browser> | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const conversion = (async (): Promise<Buffer> => {
      browserLaunch = launchBrowser();
      browser = await browserLaunch;
      if (timedOut) throw new DocxConversionError("conversion_timeout");
      context = await browser.newContext({
        javaScriptEnabled: true,
        serviceWorkers: "block",
      });
      await context.route("**/*", route => route.abort("blockedbyclient"));
      await context.setOffline(true);
      page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      const nonce = randomBytes(18).toString("base64url");
      await page.setContent(
        `<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${makeCsp(nonce)}"></head><body><div id="docx-render-host" dir="auto"></div></body></html>`,
        { timeout: timeoutMs, waitUntil: "domcontentloaded" }
      );

      const bundles = await loadRendererBundles();
      await page.evaluate(LOAD_RENDERER_IN_PAGE, { ...bundles, nonce });
      const pageCount = await page.evaluate(RENDER_DOCX_IN_PAGE, {
        base64Bytes: Buffer.from(
          input.buffer,
          input.byteOffset,
          input.byteLength
        ).toString("base64"),
      });
      if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
        throw new DocxConversionError("conversion_failed");
      }
      if (pageCount > MAX_DOCX_PAGES) {
        throw new DocxConversionError("page_limit_exceeded");
      }

      await page.addStyleTag({
        content: [
          "html,body{margin:0!important;padding:0!important}",
          ".docx-wrapper{background:#fff!important;padding:0!important;display:block!important}",
          ".docx-wrapper>section.docx{margin:0!important;box-shadow:none!important}",
          "section.docx{break-after:page;page-break-after:always}",
          "section.docx:last-child{break-after:auto;page-break-after:auto}",
        ].join("\n"),
      });

      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      if (pdf.byteLength === 0 || pdf.byteLength > MAX_PDF_BYTES) {
        throw new DocxConversionError("pdf_too_large");
      }
      if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new DocxConversionError("conversion_failed");
      }
      return pdf;
    })();

    const timedConversion = new Promise<Buffer>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        void browser?.close().catch(() => undefined);
        void browserLaunch
          ?.then(instance => instance.close())
          .catch(() => undefined);
        reject(new DocxConversionError("conversion_timeout"));
      }, timeoutMs);
    });

    try {
      return await Promise.race([conversion, timedConversion]);
    } catch (error) {
      if (error instanceof DocxConversionError) throw error;
      throw new DocxConversionError(
        timedOut ? "conversion_timeout" : "conversion_failed"
      );
    } finally {
      if (timer) clearTimeout(timer);
      await page?.close().catch(() => undefined);
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  };
}

export const convertDocxToPdf = createDocxToPdfConverter();

export async function renderDocxToPdf(input: Buffer): Promise<Buffer> {
  return convertDocxToPdf(input);
}
