import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prepareOrganizationLogoUpload,
  uploadOrganizationLogoDirect,
} from "./organizationLogoUpload";
import { MAX_ORGANIZATION_LOGO_BYTES } from "@shared/organizationLogoLimits";
import { clearSessionToken } from "@/lib/sessionToken";

describe("prepared organization logo size", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(["image/png", "image/jpeg"])(
    "resizes %s above the server limit and accepts the exact boundary",
    async contentType => {
      const blobAtSize = (size: number) =>
        new Blob([new Uint8Array(size)], { type: contentType });
      const toBlob = vi
        .fn()
        .mockImplementationOnce((callback: (blob: Blob) => void) =>
          callback(blobAtSize(MAX_ORGANIZATION_LOGO_BYTES + 1))
        )
        .mockImplementationOnce((callback: (blob: Blob) => void) =>
          callback(blobAtSize(MAX_ORGANIZATION_LOGO_BYTES))
        );
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toBlob,
      };
      vi.stubGlobal("document", { createElement: () => canvas });
      vi.stubGlobal(
        "Image",
        class {
          naturalWidth = 1600;
          naturalHeight = 1600;
          async decode() {}
        }
      );
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
      const revoke = vi
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => {});

      const result = await prepareOrganizationLogoUpload(
        new File(["fixture"], "logo", { type: contentType })
      );
      expect(result.blob.size).toBe(MAX_ORGANIZATION_LOGO_BYTES);
      expect(result.contentType).toBe(contentType);
      expect(toBlob).toHaveBeenCalledTimes(2);
      expect(revoke).toHaveBeenCalledWith("blob:fixture");
    }
  );

  it("automatically downsizes valid images larger than 40 megapixels", async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage() {} }),
      toBlob: vi.fn((callback: (blob: Blob) => void) =>
        callback(new Blob(["small-png"], { type: "image/png" }))
      ),
    };
    vi.stubGlobal("document", { createElement: () => canvas });
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 13_000;
        naturalHeight = 4_000;
        async decode() {}
      }
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:large-image");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});

    const result = await prepareOrganizationLogoUpload(
      new File(["fixture"], "large-logo.png", { type: "image/png" })
    );

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(492);
    expect(result.contentType).toBe("image/png");
    expect(result.blob.type).toBe("image/png");
    expect(revoke).toHaveBeenCalledWith("blob:large-image");
  });

  it("rejects an empty input without attempting an upload", async () => {
    await expect(
      prepareOrganizationLogoUpload(
        new File([], "logo.png", { type: "image/png" })
      )
    ).rejects.toThrow("ملف الشعار فارغ");
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
