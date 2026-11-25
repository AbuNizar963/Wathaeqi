import { describe, expect, it } from "vitest";
import { readOrganizationLogoImageMetadata } from "./organizationLogoImageMetadata";

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width, false);
  new DataView(bytes.buffer).setUint32(20, height, false);
  return bytes;
}

function jpegHeader(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x08,
    0x08,
    (height >>> 8) & 0xff,
    height & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    0x00,
  ]);
}

describe("organization logo raster metadata", () => {
  it("reads PNG IHDR dimensions without decoding pixels", () => {
    expect(readOrganizationLogoImageMetadata(pngHeader(2400, 1600))).toEqual({
      contentType: "image/png",
      width: 2400,
      height: 1600,
    });
  });

  it("reads JPEG SOF dimensions from a bounded header", () => {
    expect(readOrganizationLogoImageMetadata(jpegHeader(6400, 3200))).toEqual({
      contentType: "image/jpeg",
      width: 6400,
      height: 3200,
    });
  });

  it("handles large legal integer dimensions but returns them for policy checks", () => {
    expect(
      readOrganizationLogoImageMetadata(pngHeader(40_000, 3000))
    ).toMatchObject({
      width: 40_000,
      height: 3000,
    });
  });

  it.each([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 2]),
    new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 7, 8, 0, 1, 0, 1, 0]),
    new Uint8Array([1, 2, 3, 4]),
  ])("rejects damaged, truncated, or unsupported headers", bytes => {
    expect(readOrganizationLogoImageMetadata(bytes)).toBeNull();
  });

  it("rejects zero or overflowing PNG dimensions", () => {
    expect(readOrganizationLogoImageMetadata(pngHeader(0, 20))).toBeNull();
    expect(
      readOrganizationLogoImageMetadata(pngHeader(0xffffffff, 0xffffffff))
    ).toBeNull();
  });
});
