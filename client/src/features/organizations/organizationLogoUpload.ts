import { appwriteApiUrl } from "@/lib/appwriteApi";
import { fetchWithSession } from "@/lib/trpcFetch";
import {
  INITIAL_ORGANIZATION_LOGO_DIMENSION,
  MAX_ORGANIZATION_LOGO_BYTES,
  MAX_ORGANIZATION_LOGO_SOURCE_BYTES,
  MAX_ORGANIZATION_LOGO_SOURCE_DIMENSION,
  MAX_ORGANIZATION_LOGO_SOURCE_PIXELS,
  MINIMUM_ORGANIZATION_LOGO_DIMENSION,
  ORGANIZATION_LOGO_METADATA_SCAN_BYTES,
} from "@shared/organizationLogoLimits";
import { readOrganizationLogoImageMetadata } from "@shared/organizationLogoImageMetadata";

export type OrganizationLogoContentType =
  "image/png" | "image/jpeg" | "image/svg+xml";
const MAX_SAFE_FALLBACK_PIXELS = 24_000_000;
const MAX_SAFE_FALLBACK_DIMENSION = 8192;
type ResizedImageBitmap = ImageBitmap & { close?: () => void };

async function readRasterMetadata(file: File) {
  const prefix = new Uint8Array(
    await file.slice(0, ORGANIZATION_LOGO_METADATA_SCAN_BYTES).arrayBuffer()
  );
  const metadata = readOrganizationLogoImageMetadata(prefix);
  if (!metadata || metadata.contentType !== file.type) {
    throw new Error("محتوى الصورة لا يطابق نوع الملف؛ اختر PNG أو JPG صالحاً.");
  }
  if (
    metadata.width > MAX_ORGANIZATION_LOGO_SOURCE_DIMENSION ||
    metadata.height > MAX_ORGANIZATION_LOGO_SOURCE_DIMENSION ||
    metadata.width * metadata.height > MAX_ORGANIZATION_LOGO_SOURCE_PIXELS
  ) {
    throw new Error(
      "أبعاد الصورة تتجاوز الحد الآمن (40,000 بكسل للضلع أو 120 ميغابكسل). اختر صورة بأبعاد أقل."
    );
  }
  return metadata;
}

function validateSvgFile(file: File): void {
  const hasSvgExtension = /\.svg$/i.test(file.name);
  if (
    (file.type &&
      file.type !== "image/svg+xml" &&
      file.type !== "application/octet-stream") ||
    (!hasSvgExtension && file.type !== "image/svg+xml")
  ) {
    throw new Error("صيغة الشعار يجب أن تكون SVG أو PNG أو JPG");
  }
  if (file.size > MAX_ORGANIZATION_LOGO_BYTES) {
    throw new Error("حجم ملف SVG يجب ألا يتجاوز 5 ميغابايت");
  }
}

function targetSize(width: number, height: number, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decodeResizedImage(
  file: File,
  targetWidth: number,
  targetHeight: number,
  sourceWidth: number,
  sourceHeight: number
): Promise<{ source: CanvasImageSource; close?: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = (await createImageBitmap(file, {
        resizeWidth: targetWidth,
        resizeHeight: targetHeight,
        resizeQuality: "high",
      })) as ResizedImageBitmap;
      return { source: bitmap, close: () => bitmap.close?.() };
    } catch {
      // Full-resolution fallback below is deliberately restricted to small inputs.
    }
  }
  if (
    sourceWidth * sourceHeight > MAX_SAFE_FALLBACK_PIXELS ||
    Math.max(sourceWidth, sourceHeight) > MAX_SAFE_FALLBACK_DIMENSION
  ) {
    throw new Error(
      "المتصفح لا يدعم تصغير الصورة عالية الدقة بأمان؛ حدّث المتصفح أو اختر صورة أصغر."
    );
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error(
        "تعذر فتح صورة الشعار. تأكد من سلامة الملف وأنه بصيغة PNG أو JPG صالحة."
      );
    }
    if (
      image.naturalWidth !== sourceWidth ||
      image.naturalHeight !== sourceHeight
    ) {
      throw new Error("أبعاد الصورة لا تطابق بيانات الملف الفعلية.");
    }
    return { source: image };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Prepare SVG for server-side static validation or resize a raster logo. */
export async function prepareOrganizationLogoUpload(
  file: File
): Promise<{ blob: Blob; contentType: OrganizationLogoContentType }> {
  if (file.size === 0) throw new Error("ملف الشعار فارغ");
  if (file.size > MAX_ORGANIZATION_LOGO_SOURCE_BYTES) {
    throw new Error("حجم ملف الشعار الأصلي يجب ألا يتجاوز 25 ميغابايت");
  }
  const isSvg =
    file.type === "image/svg+xml" ||
    (/\.svg$/i.test(file.name) &&
      (file.type === "" || file.type === "application/octet-stream"));
  if (isSvg) {
    validateSvgFile(file);
    return { blob: file, contentType: "image/svg+xml" };
  }
  if (file.type !== "image/png" && file.type !== "image/jpeg") {
    throw new Error("صيغة الشعار يجب أن تكون SVG أو PNG أو JPG");
  }

  // Signature and dimensions are inspected before any image decoder sees bytes.
  const metadata = await readRasterMetadata(file);
  const startingSize = targetSize(
    metadata.width,
    metadata.height,
    INITIAL_ORGANIZATION_LOGO_DIMENSION
  );
  const decoded = await decodeResizedImage(
    file,
    startingSize.width,
    startingSize.height,
    metadata.width,
    metadata.height
  );
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("تعذر تجهيز صورة الشعار للرفع");
    let maxDimension = Math.min(
      INITIAL_ORGANIZATION_LOGO_DIMENSION,
      Math.max(metadata.width, metadata.height)
    );
    let quality = 0.92;
    while (true) {
      const dimensions = targetSize(
        metadata.width,
        metadata.height,
        maxDimension
      );
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, file.type, quality)
      );
      if (!blob || blob.type !== file.type) {
        throw new Error("تعذر ضغط شعار الجهة إلى الصيغة المطلوبة");
      }
      if (blob.size <= MAX_ORGANIZATION_LOGO_BYTES) {
        return { blob, contentType: file.type };
      }
      if (maxDimension <= MINIMUM_ORGANIZATION_LOGO_DIMENSION) {
        throw new Error("تعذر ضغط الشعار إلى الحد المسموح؛ اختر صورة أصغر");
      }
      maxDimension = Math.max(
        MINIMUM_ORGANIZATION_LOGO_DIMENSION,
        Math.floor(maxDimension * 0.75)
      );
      if (file.type === "image/jpeg") quality = Math.max(0.7, quality - 0.06);
    }
  } finally {
    decoded.close?.();
  }
}

export type UploadedOrganizationLogo = {
  key: string;
  url: string | null;
  requestId?: string;
};
type OrganizationLogoUploadResponse = {
  key?: unknown;
  url?: unknown;
  error?: unknown;
  requestId?: unknown;
};

/** Upload a prepared logo as raw bytes through the authenticated API. */
export async function uploadOrganizationLogoDirect(input: {
  organizationId: string;
  fileName: string;
  blob: Blob;
  contentType: OrganizationLogoContentType;
}): Promise<UploadedOrganizationLogo> {
  let response: Response;
  try {
    response = await fetchWithSession(
      appwriteApiUrl("/api/storage/department-logo"),
      {
        method: "PUT",
        headers: {
          "Content-Type": input.contentType,
          "X-Organization-Id": input.organizationId,
          "X-File-Name": encodeURIComponent(input.fileName),
        },
        body: input.blob,
      }
    );
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "تعذر الاتصال بخدمة رفع الشعار. تحقق من الاتصال بالإنترنت ثم أعد المحاولة؛ لم يُؤكَّد حفظ الملف."
      );
    }
    throw error;
  }
  const result = (await response
    .json()
    .catch(() => null)) as OrganizationLogoUploadResponse | null;
  if (!response.ok) {
    const message =
      typeof result?.error === "string" ? result.error : "تعذر رفع شعار الجهة";
    const requestId =
      typeof result?.requestId === "string" ? result.requestId : null;
    throw new Error(
      requestId ? `${message} (رقم المتابعة: ${requestId})` : message
    );
  }
  if (
    typeof result?.key !== "string" ||
    (typeof result.url !== "string" && result.url !== null)
  ) {
    throw new Error("استجابة الخادم لرفع الشعار غير صالحة");
  }
  return {
    key: result.key,
    url: result.url,
    requestId:
      typeof result.requestId === "string" ? result.requestId : undefined,
  };
}
