export type OrganizationLogoRasterMime = "image/png" | "image/jpeg";

export type OrganizationLogoImageMetadata = {
  contentType: OrganizationLogoRasterMime;
  width: number;
  height: number;
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_START = [0xff, 0xd8, 0xff];
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function matches(bytes: Uint8Array, signature: readonly number[]): boolean {
  return (
    bytes.byteLength >= signature.length &&
    signature.every((byte, index) => bytes[index] === byte)
  );
}

function validDimensions(width: number, height: number): boolean {
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    Number.isSafeInteger(width * height)
  );
}

/**
 * Read dimensions from PNG IHDR or a JPEG Start Of Frame marker without
 * decoding pixel data. JPEG parsing is intentionally bounded by the caller's
 * header slice; malformed or incomplete headers are rejected.
 */
export function readOrganizationLogoImageMetadata(
  bytes: Uint8Array
): OrganizationLogoImageMetadata | null {
  if (matches(bytes, PNG_SIGNATURE)) {
    if (
      bytes.byteLength < 24 ||
      bytes[12] !== 0x49 ||
      bytes[13] !== 0x48 ||
      bytes[14] !== 0x44 ||
      bytes[15] !== 0x52
    ) {
      return null;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return validDimensions(width, height)
      ? { contentType: "image/png", width, height }
      : null;
  }

  if (!matches(bytes, JPEG_START)) return null;
  let cursor = 2;
  while (cursor < bytes.byteLength) {
    if (bytes[cursor] !== 0xff) return null;
    while (cursor < bytes.byteLength && bytes[cursor] === 0xff) cursor += 1;
    if (cursor >= bytes.byteLength) return null;
    const marker = bytes[cursor++];

    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    if (cursor + 2 > bytes.byteLength) return null;

    const segmentLength = (bytes[cursor] << 8) | bytes[cursor + 1];
    if (segmentLength < 2) return null;
    const segmentEnd = cursor + segmentLength;
    if (segmentEnd > bytes.byteLength) return null;

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 8) return null;
      const height = (bytes[cursor + 3] << 8) | bytes[cursor + 4];
      const width = (bytes[cursor + 5] << 8) | bytes[cursor + 6];
      return validDimensions(width, height)
        ? { contentType: "image/jpeg", width, height }
        : null;
    }
    cursor = segmentEnd;
  }
  return null;
}
