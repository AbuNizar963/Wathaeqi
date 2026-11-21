import { MAX_DOCX_BYTES, validateDocxBytes } from "./docxPdfRenderer";

export const MAX_DOCUMENT_UPLOAD_BYTES = MAX_DOCX_BYTES;
export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_PDF_PAGES = 5_000;
const PDF_VALIDATION_TIMEOUT_MS = 15_000;

const DOCUMENT_MIME_TYPES: Readonly<Record<string, string>> = {
  docx: DOCX_MIME_TYPE,
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function getAllowedDocumentMimeType(fileName: string): string | null {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return DOCUMENT_MIME_TYPES[extension] ?? null;
}

/**
 * Validates bounded document containers before storage or rendering. PDF.js
 * parses PDF files from memory only; image checks validate framing and bounds,
 * not the safety of every compressed pixel stream.
 */
export async function isValidDocumentFile(
  bytes: Uint8Array,
  fileName: string
): Promise<boolean> {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_DOCUMENT_UPLOAD_BYTES
  ) {
    return false;
  }
  const mimeType = getAllowedDocumentMimeType(fileName);
  if (!mimeType) return false;

  if (mimeType === DOCX_MIME_TYPE) {
    try {
      validateDocxBytes(bytes);
      return true;
    } catch {
      return false;
    }
  }
  if (mimeType === "application/pdf") return validatePdf(bytes);
  if (mimeType === "image/png") return validatePng(bytes);
  if (mimeType === "image/jpeg") return validateJpeg(bytes);
  if (mimeType === "image/webp") return validateWebp(bytes);
  return false;
}

async function validatePdf(bytes: Uint8Array): Promise<boolean> {
  if (
    bytes.byteLength < 12 ||
    !/^%PDF-\d\.\d/.test(Buffer.from(bytes.subarray(0, 8)).toString("ascii"))
  ) {
    return false;
  }

  let loadingTask:
    | ReturnType<typeof import("pdfjs-dist/legacy/build/pdf.mjs").getDocument>
    | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    loadingTask = getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: false,
      stopAtErrors: true,
      verbosity: 0,
    });
    const documentPromise = loadingTask.promise;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        void loadingTask?.destroy().catch(() => undefined);
        reject(new Error("PDF validation timed out"));
      }, PDF_VALIDATION_TIMEOUT_MS);
      timeout.unref?.();
    });
    const document = await Promise.race([documentPromise, timeoutPromise]);
    return document.numPages > 0 && document.numPages <= MAX_PDF_PAGES;
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
    await loadingTask?.destroy().catch(() => undefined);
  }
}

function validatePng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.length < 45 ||
    signature.some((value, index) => bytes[index] !== value)
  ) {
    return false;
  }

  let offset = 8;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;
  let chunkCount = 0;
  while (offset < bytes.length) {
    if (++chunkCount > 10_000 || offset + 12 > bytes.length) return false;
    const length = readUInt32BE(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + length;
    if (crcOffset + 4 > bytes.length) return false;
    const type = Buffer.from(bytes.subarray(typeOffset, dataOffset)).toString(
      "ascii"
    );
    if (!/^[A-Za-z]{4}$/.test(type)) return false;
    if (
      readUInt32BE(bytes, crcOffset) !== crc32(bytes, typeOffset, length + 4)
    ) {
      return false;
    }

    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) return false;
      const width = readUInt32BE(bytes, dataOffset);
      const height = readUInt32BE(bytes, dataOffset + 4);
      if (!isValidImageDimensions(width, height)) return false;
      sawHeader = true;
    } else if (type === "IHDR") {
      return false;
    }

    if (type === "IDAT") sawImageData = true;
    if (type === "IEND") {
      if (length !== 0 || !sawImageData || crcOffset + 4 !== bytes.length) {
        return false;
      }
      sawEnd = true;
      break;
    }
    offset = crcOffset + 4;
  }
  return sawHeader && sawImageData && sawEnd;
}

function validateJpeg(bytes: Uint8Array): boolean {
  if (
    bytes.length < 16 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[bytes.length - 2] !== 0xff ||
    bytes[bytes.length - 1] !== 0xd9
  ) {
    return false;
  }

  let offset = 2;
  let sawFrame = false;
  let sawScan = false;
  while (offset < bytes.length - 2) {
    if (bytes[offset++] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) return false;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      break;
    }
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (offset + 2 > bytes.length) return false;
    const segmentLength = readUInt16BE(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length)
      return false;
    if (isJpegFrameMarker(marker)) {
      if (segmentLength < 8) return false;
      const height = readUInt16BE(bytes, offset + 3);
      const width = readUInt16BE(bytes, offset + 5);
      if (!isValidImageDimensions(width, height)) return false;
      sawFrame = true;
    }
    if (marker === 0xda) {
      if (segmentLength < 6 || offset + segmentLength >= bytes.length - 2) {
        return false;
      }
      sawScan = true;
      break;
    }
    offset += segmentLength;
  }
  return sawFrame && sawScan;
}

function validateWebp(bytes: Uint8Array): boolean {
  if (
    bytes.length < 20 ||
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") !== "RIFF" ||
    readUInt32LE(bytes, 4) !== bytes.length - 8 ||
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") !== "WEBP"
  ) {
    return false;
  }

  let offset = 12;
  let sawImageBitstream = false;
  let chunkCount = 0;
  while (offset < bytes.length) {
    if (++chunkCount > 10_000 || offset + 8 > bytes.length) return false;
    const type = Buffer.from(bytes.subarray(offset, offset + 4)).toString(
      "ascii"
    );
    const length = readUInt32LE(bytes, offset + 4);
    const dataOffset = offset + 8;
    const paddedLength = length + (length % 2);
    if (dataOffset + paddedLength > bytes.length) return false;

    if (type === "VP8 ") {
      if (
        length < 10 ||
        (bytes[dataOffset] & 1) !== 0 ||
        bytes[dataOffset + 3] !== 0x9d ||
        bytes[dataOffset + 4] !== 0x01 ||
        bytes[dataOffset + 5] !== 0x2a
      ) {
        return false;
      }
      const width = readUInt16LE(bytes, dataOffset + 6) & 0x3fff;
      const height = readUInt16LE(bytes, dataOffset + 8) & 0x3fff;
      if (!isValidImageDimensions(width, height)) return false;
      sawImageBitstream = true;
    } else if (type === "VP8L") {
      if (length < 5 || bytes[dataOffset] !== 0x2f) return false;
      const width =
        1 + bytes[dataOffset + 1] + ((bytes[dataOffset + 2] & 0x3f) << 8);
      const height =
        1 +
        (bytes[dataOffset + 2] >> 6) +
        (bytes[dataOffset + 3] << 2) +
        ((bytes[dataOffset + 4] & 0x0f) << 10);
      if (!isValidImageDimensions(width, height)) return false;
      sawImageBitstream = true;
    } else if (type === "VP8X") {
      if (length !== 10) return false;
      const width = readUInt24LE(bytes, dataOffset + 4) + 1;
      const height = readUInt24LE(bytes, dataOffset + 7) + 1;
      if (!isValidImageDimensions(width, height)) return false;
    }
    offset = dataOffset + paddedLength;
  }
  return offset === bytes.length && sawImageBitstream;
}

function isJpegFrameMarker(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function isValidImageDimensions(width: number, height: number): boolean {
  return (
    width > 0 &&
    height > 0 &&
    width <= MAX_IMAGE_PIXELS &&
    height <= MAX_IMAGE_PIXELS &&
    width * height <= MAX_IMAGE_PIXELS
  );
}

function readUInt16BE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 0x100 + bytes[offset + 1];
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + bytes[offset + 1] * 0x100;
}

function readUInt24LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] + bytes[offset + 1] * 0x100 + bytes[offset + 2] * 0x10000
  );
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000
  );
}

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array, offset: number, length: number): number {
  let crc = 0xffffffff;
  for (let index = offset; index < offset + length; index++) {
    crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function isSafeDocumentStorageKey(
  storageKey: string,
  ownerId: string,
  fileName: string
): boolean {
  if (
    typeof storageKey !== "string" ||
    typeof ownerId !== "string" ||
    typeof fileName !== "string" ||
    !ownerId ||
    !fileName ||
    storageKey.length > 512
  ) {
    return false;
  }
  const expectedPrefix = `documents/${ownerId}/`;
  if (!storageKey.startsWith(expectedPrefix)) return false;
  const objectName = storageKey.slice(expectedPrefix.length);
  // Dots inside the generated single filename are valid upload names; path
  // traversal requires a separate segment, which the separator checks reject.
  if (
    objectName.includes("/") ||
    objectName.includes("\\") ||
    objectName.length <= fileName.length + 1
  ) {
    return false;
  }
  const separator = 36;
  const nonce = objectName.slice(0, separator);
  const storedName = objectName.slice(separator + 1);
  return (
    separator === 36 &&
    objectName[separator] === "-" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      nonce
    ) &&
    storedName === fileName
  );
}
