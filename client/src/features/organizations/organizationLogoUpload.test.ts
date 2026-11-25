import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prepareOrganizationLogoUpload,
  uploadOrganizationLogoDirect,
} from "./organizationLogoUpload";
import { MAX_ORGANIZATION_LOGO_BYTES } from "@shared/organizationLogoLimits";
import { clearSessionToken } from "@/lib/sessionToken";

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
    0,
    8,
    8,
    (height >>> 8) & 0xff,
    height & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    0,
  ]);
}

function stubRasterPreparation(
  contentType: "image/png" | "image/jpeg",
  blobs: Blob[]
) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ clearRect() {}, drawImage: vi.fn() }),
    toBlob: vi.fn((callback: (blob: Blob) => void) => callback(blobs.shift()!)),
  };
  vi.stubGlobal("document", { createElement: () => canvas });
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (_file: File, options: ImageBitmapOptions) => ({
      width: options.resizeWidth,
      height: options.resizeHeight,
      close: vi.fn(),
    }))
  );
  return canvas;
}

describe("prepared organization logo size and image safety", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["image/png", pngHeader] as const,
    ["image/jpeg", jpegHeader] as const,
  ])(
    "resizes %s and returns an output within the 5 MiB cap",
    async (type, header) => {
      const canvas = stubRasterPreparation(type, [
        new Blob(["small"], { type }),
      ]);
      const result = await prepareOrganizationLogoUpload(
        new File([header(3000, 1500)], "logo", { type })
      );
      expect(result.blob.size).toBeLessThanOrEqual(MAX_ORGANIZATION_LOGO_BYTES);
      expect(result.contentType).toBe(type);
      expect(canvas.width).toBe(2400);
      expect(canvas.height).toBe(1200);
      expect(createImageBitmap).toHaveBeenCalledWith(
        expect.any(File),
        expect.objectContaining({ resizeWidth: 2400, resizeHeight: 1200 })
      );
    }
  );

  it("inspects high-resolution metadata before resized decode and preserves aspect ratio", async () => {
    const canvas = stubRasterPreparation("image/png", [
      new Blob(["small"], { type: "image/png" }),
    ]);
    const result = await prepareOrganizationLogoUpload(
      new File([pngHeader(40_000, 3000)], "large.png", { type: "image/png" })
    );
    expect(createImageBitmap).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ resizeWidth: 2400, resizeHeight: 180 })
    );
    expect(canvas.width / canvas.height).toBeCloseTo(40_000 / 3000, 2);
    expect(result.blob.type).toBe("image/png");
  });

  it("rejects source files above 25 MiB before reading or decoding", async () => {
    const bitmapDecoder = vi.fn();
    vi.stubGlobal("createImageBitmap", bitmapDecoder);
    const file = new File(
      [new Uint8Array(25 * 1024 * 1024 + 1)],
      "oversized.png",
      { type: "image/png" }
    );
    await expect(prepareOrganizationLogoUpload(file)).rejects.toThrow(
      "25 ميغابايت"
    );
    expect(bitmapDecoder).not.toHaveBeenCalled();
  });

  it("rejects MIME/signature mismatches and damaged headers before decoder use", async () => {
    const bitmapDecoder = vi.fn();
    vi.stubGlobal("createImageBitmap", bitmapDecoder);
    const file = new File([pngHeader(10, 10)], "not-a-jpeg.jpg", {
      type: "image/jpeg",
    });
    await expect(prepareOrganizationLogoUpload(file)).rejects.toThrow(
      "لا يطابق"
    );
    const damaged = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 2])],
      "bad.jpg",
      { type: "image/jpeg" }
    );
    await expect(prepareOrganizationLogoUpload(damaged)).rejects.toThrow(
      "لا يطابق"
    );
    expect(bitmapDecoder).not.toHaveBeenCalled();
  });

  it("refuses image dimensions beyond 40,000px/120MP before decoding", async () => {
    const createBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createBitmap);
    const file = new File([pngHeader(40_001, 2000)], "too-wide.png", {
      type: "image/png",
    });
    await expect(prepareOrganizationLogoUpload(file)).rejects.toThrow("40,000");
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it("does not fall back to full-resolution decode for huge images when bitmap resize fails", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("unsupported"))
    );
    const imageConstructor = vi.fn();
    vi.stubGlobal("Image", imageConstructor);
    const file = new File([pngHeader(13_000, 4000)], "large.png", {
      type: "image/png",
    });
    await expect(prepareOrganizationLogoUpload(file)).rejects.toThrow("بأمان");
    expect(imageConstructor).not.toHaveBeenCalled();
  });

  it("reduces output dimensions to the 1024px minimum before rejecting oversized output", async () => {
    const canvas = stubRasterPreparation("image/jpeg", [
      new Blob([new Uint8Array(MAX_ORGANIZATION_LOGO_BYTES + 1)], {
        type: "image/jpeg",
      }),
      new Blob(["small"], { type: "image/jpeg" }),
    ]);
    await prepareOrganizationLogoUpload(
      new File([jpegHeader(2400, 1200)], "large.jpg", { type: "image/jpeg" })
    );
    expect(canvas.toBlob).toHaveBeenCalledTimes(2);
    expect(canvas.width).toBe(1800);
    expect(canvas.height).toBe(900);
  });

  it("passes SVG files through for strict server-side static validation", async () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
    const file = new File([source], "organization-logo.svg", {
      type: "image/svg+xml",
    });
    const result = await prepareOrganizationLogoUpload(file);
    expect(result.blob).toBe(file);
    expect(result.contentType).toBe("image/svg+xml");
  });
});
describe("direct organization logo upload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clearSessionToken();
  });

  it("sends the prepared image without cookies to the configured API origin", async () => {
    vi.stubEnv("VITE_APPWRITE_API_URL", "https://api.example.test/");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          key: "department/logos/org/logo.png",
          url: "/api/storage/department/logos/org/logo.png",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const blob = new Blob([new Uint8Array([1, 2, 3])], {
      type: "image/png",
    });

    await expect(
      uploadOrganizationLogoDirect({
        organizationId: "550e8400-e29b-41d4-a716-446655440000",
        fileName: "badge.png",
        blob,
        contentType: "image/png",
      })
    ).resolves.toEqual({
      key: "department/logos/org/logo.png",
      url: "/api/storage/department/logos/org/logo.png",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.test/api/storage/department-logo");
    expect(options).toMatchObject({
      method: "PUT",
      credentials: "omit",
      body: blob,
    });
    const headers = new Headers(options.headers);
    expect(headers.get("Content-Type")).toBe("image/png");
    expect(headers.get("X-Organization-Id")).toBe(
      "550e8400-e29b-41d4-a716-446655440000"
    );
    expect(headers.get("X-File-Name")).toBe("badge.png");
    expect(headers.get("Authorization")).toBeNull();
  });

  it("surfaces authorization and validation errors from the server", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "لا تملك صلاحية رفع الشعار" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadOrganizationLogoDirect({
        organizationId: "550e8400-e29b-41d4-a716-446655440000",
        fileName: "badge.png",
        blob: new Blob([new Uint8Array([1])], { type: "image/png" }),
        contentType: "image/png",
      })
    ).rejects.toThrow("لا تملك صلاحية رفع الشعار");
  });

  it("rejects malformed success responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ key: "department/logos/org/logo.png" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(
      uploadOrganizationLogoDirect({
        organizationId: "550e8400-e29b-41d4-a716-446655440000",
        fileName: "badge.png",
        blob: new Blob([new Uint8Array([1])], { type: "image/png" }),
        contentType: "image/png",
      })
    ).rejects.toThrow("استجابة الخادم لرفع الشعار غير صالحة");
  });
});

describe("logo upload recovery responses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearSessionToken();
  });

  const input = {
    organizationId: "550e8400-e29b-41d4-a716-446655440000",
    fileName: "badge.png",
    blob: new Blob([new Uint8Array([1])], { type: "image/png" }),
    contentType: "image/png" as const,
  };

  it("includes the server request id for HTTP 502 errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "تعذر حفظ شعار الجهة",
            requestId: "req-123",
          }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    await expect(uploadOrganizationLogoDirect(input)).rejects.toThrow(
      "تعذر حفظ شعار الجهة (رقم المتابعة: req-123)"
    );
  });

  it("accepts a stored logo when its preview URL is temporarily unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ key: "organizations/org/logo.png", url: null }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
    );
    await expect(uploadOrganizationLogoDirect(input)).resolves.toMatchObject({
      key: "organizations/org/logo.png",
      url: null,
    });
  });
});
