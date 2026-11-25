import { describe, expect, it } from "vitest";
import { getOrganizationLogoValidationError } from "./organizationLogoValidation";

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(58);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  bytes.writeUInt32BE(0, 29);
  bytes.writeUInt32BE(1, 33);
  bytes.write("IDAT", 37, "ascii");
  bytes[41] = 0;
  bytes.writeUInt32BE(0, 42);
  bytes.writeUInt32BE(0, 46);
  bytes.write("IEND", 50, "ascii");
  bytes.writeUInt32BE(0, 54);
  return bytes;
}

function jpeg(width: number, height: number): Buffer {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >>> 8) & 0xff,
    height & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
    0xff,
    0xda,
    0x00,
    0x0c,
    0x03,
    0x01,
    0x00,
    0x02,
    0x11,
    0x03,
    0x11,
    0x00,
    0x3f,
    0x00,
    0x00,
    0xff,
    0xd9,
  ]);
}

describe("server organization-logo content validation", () => {
  it("accepts PNG and JPEG whose signatures match their MIME and dimensions fit limits", () => {
    expect(
      getOrganizationLogoValidationError("image/png", png(2400, 1600))
    ).toBeNull();
    expect(
      getOrganizationLogoValidationError("image/jpeg", jpeg(6400, 3200))
    ).toBeNull();
  });

  it("rejects MIME/signature mismatches and damaged or truncated raster headers", () => {
    expect(
      getOrganizationLogoValidationError("image/jpeg", png(100, 100))
    ).toMatch(/لا يطابق/);
    expect(
      getOrganizationLogoValidationError("image/png", Buffer.from("not png"))
    ).toMatch(/تالف/);
    expect(
      getOrganizationLogoValidationError(
        "image/jpeg",
        jpeg(100, 100).subarray(0, 7)
      )
    ).toMatch(/تالف/);
  });

  it("rejects a valid-looking PNG signature whose image chunks are truncated", () => {
    expect(
      getOrganizationLogoValidationError(
        "image/png",
        png(100, 100).subarray(0, 24)
      )
    ).toMatch(/تالف/);
  });

  it("rejects decompression-bomb dimensions above either server storage ceiling", () => {
    expect(
      getOrganizationLogoValidationError("image/png", png(8193, 100))
    ).toMatch(/8192/);
    expect(
      getOrganizationLogoValidationError("image/jpeg", jpeg(7000, 6000))
    ).toMatch(/40 ميغابكسل/);
  });

  it("retains vector SVG support while rejecting active or external content", () => {
    const safe = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>'
    );
    const active = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://example.test/x.png"/></svg>'
    );
    expect(
      getOrganizationLogoValidationError("image/svg+xml", safe)
    ).toBeNull();
    expect(getOrganizationLogoValidationError("image/svg+xml", active)).toMatch(
      /غير صالح/
    );
  });
});
