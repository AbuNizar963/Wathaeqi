import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const origin = new URL(baseUrl).origin;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({ serviceWorkers: "block" });
const failures = [];
let includeDocument = false;
const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=";
const testDocument = {
  id: "test-file",
  ownerId: "test-user",
  title: "وثيقة اختبار تنزيل",
  subject: "",
  category: "general",
  status: "draft",
  documentDate: "2026-01-01",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  content: { type: "doc", content: [] },
  templateFieldsSnapshot: [],
  fieldValues: {},
  file: {
    fileName: "fixture.png",
    mimeType: "image/png",
    pageCount: 1,
    sizeBytes: Buffer.from(pngBase64, "base64").length,
  },
};
const user = {
  id: 7,
  authUserId: "test-user",
  name: "مستخدم اختبار",
  username: "test-user",
  email: "fixture@example.test",
  role: "user",
  isActive: true,
  mustChangePassword: false,
};
function fixture(procedure) {
  if (procedure === "auth.me") return user;
  if (procedure === "organizations.context")
    return {
      organizationId: "org-test",
      organizationName: "جهة اختبار",
      role: "member",
      isOwner: false,
    };
  if (procedure === "documentStudio.listDocuments")
    return includeDocument ? [testDocument] : [];
  if (procedure === "documentStudio.listTemplates") return [];
  if (procedure === "documentStudio.getFileUrl")
    return { url: `data:image/png;base64,${pngBase64}` };
  if (procedure.includes("list") || procedure.includes("notifications"))
    return [];
  if (procedure === "documentStudio.getLetterheadSettings")
    return { departmentName: "جهة اختبار", unitName: "", logoUrl: null };
  if (procedure === "platformDocumentSettings.get")
    return {
      watermarkText: "",
      watermarkOpacityPercent: 12,
      watermarkScalePercent: 100,
      showMinistryWatermarkText: false,
      headerDividerColor: "#334155",
      pageFooterRows: [],
    };
  return null;
}
try {
  const page = await context.newPage();
  page.on("pageerror", error => failures.push(error.message));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    // Never reach a real backend or any external origin, even when build-time
    // environment settings specify one. All API responses below are fixtures.
    if (url.pathname === "/api/documents/test-file/file") {
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        await route.fulfill({
          status: 200,
          contentType: "image/png",
          body: Buffer.from(pngBase64, "base64"),
        });
      } catch {
        /* Cancellation intentionally aborts this synthetic request. */
      }
      return;
    }
    if (url.pathname.includes("/api/trpc/")) {
      const procedures = decodeURIComponent(
        url.pathname.split("/api/trpc/")[1]
      ).split(",");
      const payload = procedures.map(procedure => ({
        result: { data: { json: fixture(procedure) } },
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          url.searchParams.has("batch") ? payload : payload[0]
        ),
      });
      return;
    }
    if (url.origin !== origin || url.pathname.startsWith("/api/")) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  for (const path of ["/", "/dashboard", "/studio"]) {
    await page.goto(`${baseUrl}${path}`);
    await page
      .getByRole("heading", { name: "مساحة الوثائق", exact: true })
      .waitFor();
    assert.equal(new URL(page.url()).pathname, "/documents");
  }
  await page.getByRole("button", { name: "القوالب", exact: true }).click();
  await page
    .getByRole("heading", { name: "إنشاء نموذج رسمي", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "الملفات", exact: true }).click();
  await page.getByRole("heading", { name: "الملفات", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "إنشاء وثيقة جديدة", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .filter({
      has: page.getByRole("heading", { name: "إنشاء وثيقة", exact: true }),
    })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, "/documents");
  await page.keyboard.press("Escape");
  await page.goto(`${baseUrl}/studio?create=1`);
  await page
    .getByRole("dialog")
    .filter({
      has: page.getByRole("heading", { name: "إنشاء وثيقة", exact: true }),
    })
    .waitFor();
  await page.keyboard.press("Escape");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/documents?tab=files`);
    await page.getByRole("heading", { name: "الملفات", exact: true }).waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    assert.ok(
      overflow <= 1,
      `Unexpected horizontal overflow at ${width}px: ${overflow}px`
    );
  }
  const manifest = await context.request.get(`${baseUrl}/document-routes.json`);
  assert.equal(manifest.status(), 200);
  assert.ok(
    (await manifest.json()).routes.some(route => route.path === "/documents")
  );
  includeDocument = true;
  await page.goto(`${baseUrl}/documents?tab=files`);
  await page.getByText("وثيقة اختبار تنزيل", { exact: true }).first().click();
  const modal = page.getByRole("dialog").filter({
    has: page.getByRole("heading", {
      name: "وثيقة اختبار تنزيل",
      exact: true,
    }),
  });
  await modal.getByRole("button", { name: "تنزيل", exact: true }).click();
  await modal.getByRole("progressbar").waitFor();
  const cancel = modal.getByRole("button", {
    name: "إلغاء التنزيل",
    exact: true,
  });
  assert.ok(
    await cancel.isEnabled(),
    "Cancellation must remain interactive inside the modal focus boundary"
  );
  await cancel.click();
  await modal.getByRole("progressbar").waitFor({ state: "detached" });
  await page.getByText("أُلغيت عملية التنزيل", { exact: true }).waitFor();
  assert.deepEqual(failures, [], "Uncaught application errors");
  console.log(
    "Unified workspace browser checks passed: legacy routes, four sections, same-route creation, 320/390/768/1440px, route manifest, cancellation inside the modal; backend calls mocked."
  );
} finally {
  await context.close();
  await browser.close();
}
