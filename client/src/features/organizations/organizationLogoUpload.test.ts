import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prepareOrganizationLogoUpload,
  uploadOrganizationLogoDirect,
} from "./organizationLogoUpload";
import { MAX_ORGANIZATION_LOGO_BYTES } from "@shared/organizationLogoLimits";

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
  });

  it("sends the prepared image with credentials to the configured API origin", async () => {
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
      credentials: "include",
      headers: {
        "Content-Type": "image/png",
        "X-Organization-Id": "550e8400-e29b-41d4-a716-446655440000",
        "X-File-Name": "badge.png",
      },
      body: blob,
    });
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
