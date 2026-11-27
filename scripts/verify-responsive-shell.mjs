import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

async function readProjectFile(relativePath) {
  return readFile(new URL(relativePath, `file://${projectRoot}/`), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const [
  indexHtml,
  manifest,
  brandMark,
  brandIcon,
  dashboardLayout,
  headerActions,
  sidebarLayout,
  appRoutes,
  settingsPage,
  documentStudio,
  documentStudioPrintDialog,
  documentPrintSections,
  documentLetterhead,
  documentSignatureBlock,
  documentWatermarkComponent,
  platformDocumentPreview,
  workspacePage,
  workspaceRouter,
  globalStyles,
  pwaInstallContext,
  serviceWorker,
] = await Promise.all(
  [
    "client/index.html",
    "client/public/manifest.json",
    "client/src/components/BrandMark.tsx",
    "client/public/icon.svg",
    "client/src/components/DashboardLayout.tsx",
    "client/src/components/HeaderActions.tsx",
    "client/src/components/ui/sidebar.tsx",
    "client/src/App.tsx",
    "client/src/features/platform-settings/PlatformDocumentSettingsPage.tsx",
    "client/src/features/document-studio/DocumentStudioPage.tsx",
    "client/src/features/document-studio/DocumentStudioPrintDialog.tsx",
    "client/src/features/document-studio/documentPrintSections.ts",
    "client/src/features/document-studio/DocumentLetterhead.tsx",
    "client/src/features/document-studio/DocumentSignatureBlock.tsx",
    "client/src/features/document-studio/DocumentWatermark.tsx",
    "client/src/features/platform-settings/PlatformDocumentPreview.tsx",
    "client/src/features/workspace/WorkspacePage.tsx",
    "server/features/workspace/workspaceRouter.ts",
    "client/src/index.css",
    "client/src/contexts/PwaInstallContext.tsx",
    "client/public/sw.js",
  ].map(readProjectFile)
);

const viewportMatch = indexHtml.match(
  /<meta\s+name="viewport"\s+content="([^"]+)"\s*\/>/i
);

assert(
  viewportMatch?.[1].includes("width=device-width"),
  "The application shell must declare a width=device-width viewport."
);

assert(
  brandMark.includes("#10262d") &&
    brandMark.includes("#c49a5b") &&
    brandMark.includes("#0f766e") &&
    brandIcon.includes("#10262d") &&
    manifest.includes('"theme_color": "#10262d"') &&
    indexHtml.includes('content="#10262d"'),
  "The in-app mark, browser icon, PWA manifest, and browser chrome must share the refreshed Wathaeqi identity."
);

assert(
  dashboardLayout.includes(
    '<h1 className="min-w-0 truncate text-sm font-semibold text-foreground">'
  ) &&
    dashboardLayout.includes('aria-label="فتح القائمة الجانبية الكاملة"') &&
    dashboardLayout.includes('aria-label="الإشعارات"') &&
    dashboardLayout.includes('aria-label="فتح البحث السريع"'),
  "The mobile dashboard header must expose the page title, full navigation drawer, and notifications."
);

assert(
  dashboardLayout.includes('<BrandMark size="sm" />') &&
    dashboardLayout.includes("وثائقي") &&
    dashboardLayout.includes("النظام متصل") &&
    !dashboardLayout.includes("TELEGRAM OPERATIONS"),
  "The top bar must contain the brand, title, and status while the legacy label is removed."
);

assert(
  dashboardLayout.includes(
    "const showSidebarBrand = isMobile || !isCollapsed;"
  ) && dashboardLayout.includes("{showSidebarBrand ? ("),
  "The sidebar brand must be visible on mobile and only when the desktop sidebar is expanded."
);

assert(
  dashboardLayout.includes(
    'isMobile\n                    ? "إغلاق القائمة الجانبية"'
  ) &&
    dashboardLayout.includes('<X className="h-4 w-4" />') &&
    dashboardLayout.includes('? "إغلاق القائمة"'),
  "The mobile drawer must expose a clearly labeled close control instead of the desktop collapse action."
);

assert(
  dashboardLayout.includes("const isMobile = useIsMobile();") &&
    dashboardLayout.includes("useState(() => !isMobile)") &&
    dashboardLayout.includes('collapsible={isMobile ? "offcanvas" : "icon"}') &&
    dashboardLayout.includes("isMobile && openMobile") &&
    dashboardLayout.includes('"z-[60]"') &&
    dashboardLayout.includes("fixed inset-0 z-20") &&
    dashboardLayout.includes("setOpenMobile(false)"),
  "The desktop sidebar must overlay the page and close through its backdrop."
);

assert(
  dashboardLayout.includes(
    "flex h-14 shrink-0 items-center justify-between border-b"
  ) &&
    dashboardLayout.includes('dir="rtl"') &&
    dashboardLayout.includes("<HeaderActions />") &&
    dashboardLayout.includes(
      '<SidebarTrigger\n                className="h-10 w-10 shrink-0'
    ),
  "The desktop sidebar must expose its open button in a dedicated top bar."
);

assert(
  sidebarLayout.includes('collapsible === "offcanvas"') &&
    sidebarLayout.includes('"w-0"') &&
    sidebarLayout.includes('const SIDEBAR_WIDTH_ICON = "4.5rem"'),
  "An offcanvas sidebar must not reserve layout width for the page content."
);

assert(
  dashboardLayout.includes('event.key.toLowerCase() === "k"') &&
    dashboardLayout.includes('aria-label="البحث السريع، الاختصار Ctrl K"') &&
    dashboardLayout.includes('aria-label="فتح البحث السريع"') &&
    dashboardLayout.includes("<CommandDialog"),
  "The desktop shell must expose a searchable command palette with the Ctrl+K shortcut."
);

assert(
  dashboardLayout.includes("<HeaderActions showMenu={false} />") &&
    dashboardLayout.includes("<HeaderActions showTheme={false} />") &&
    dashboardLayout.includes("grid grid-cols-5") &&
    !dashboardLayout.includes(
      'className="mt-auto border-t border-sidebar-border p-3"'
    ),
  "Mobile users must have theme control beside notifications and account actions beside the more item."
);

assert(
  dashboardLayout.includes('aria-label="التنقل الرئيسي"') &&
    dashboardLayout.includes("grid grid-cols-5") &&
    dashboardLayout.includes(
      'paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))"'
    ) &&
    dashboardLayout.includes(
      'height: "calc(52px + env(safe-area-inset-top))"'
    ) &&
    dashboardLayout.includes('paddingTop: "env(safe-area-inset-top)"') &&
    dashboardLayout.includes("pt-[calc(1rem_+_env(safe-area-inset-top))]") &&
    dashboardLayout.includes('setLocation("/documents?create=1")') &&
    dashboardLayout.includes("إنشاء جديد") &&
    dashboardLayout.includes("h-[52px]"),
  "The mobile navigation must expose dashboard, documents, create, and more actions with safe-area spacing and a 52px top bar."
);

assert(
  dashboardLayout.includes('aria-label="فتح القائمة الجانبية الكاملة"') &&
    dashboardLayout.includes("onClick={() => setOpenMobile(true)}") &&
    dashboardLayout.includes("aria-expanded={openMobile}"),
  "The mobile top bar must expose an explicit button for opening the full navigation drawer."
);

assert(
  dashboardLayout.includes('collapsible={isMobile ? "offcanvas" : "icon"}') &&
    dashboardLayout.includes("DEFAULT_WIDTH = 240"),
  "The desktop navigation must use a 240px expanded rail and a 72px icon-collapsed state."
);

assert(
  appRoutes.includes('ThemeProvider defaultTheme="light" switchable') &&
    (await readProjectFile("client/src/index.css")).includes(
      "--background: #f4f7f6"
    ) &&
    (await readProjectFile("client/src/index.css")).includes(
      "--card: #152832"
    ) &&
    (await readProjectFile("client/src/index.css")).includes(
      "--primary: #0f766e"
    ),
  "The crisp light theme must be the initial preference while remaining switchable."
);

assert(
  headerActions.includes("if (!user) {\n    return null;\n  }"),
  "Header actions must not render before an authenticated user is available."
);

assert(
  appRoutes.includes('path="/settings"') &&
    settingsPage.includes("platformDocumentSettings.update"),
  "The owner workspace must expose a real Appwrite-backed document settings page."
);

assert(
  documentStudio.includes("معاينة الوثيقة") &&
    documentStudio.includes("watermarkText") &&
    documentStudio.includes(
      'import DocumentWatermark from "./DocumentWatermark"'
    ) &&
    documentWatermarkComponent.includes("buildDocumentWatermarkCss") &&
    documentStudio.includes("watermarkScalePercent") &&
    documentStudio.includes("editable={!previewMode}"),
  "The document workspace must expose a read-only preview and apply watermark settings."
);

assert(
  platformDocumentPreview.includes("ResponsiveA4Preview") &&
    platformDocumentPreview.includes("DocumentEditor") &&
    platformDocumentPreview.includes("editable={false}") &&
    platformDocumentPreview.includes(
      "scalePercent={settings.watermarkScalePercent}"
    ),
  "Document settings must preview a saved document with the actual read-only print components."
);

assert(
  ["إدارة الوثائق", "إدارة المستخدمين", "إعدادات الوثائق"].every(label =>
    dashboardLayout.includes(`label: "${label}"`)
  ),
  "The sidebar must expose the unified document workspace and administrative navigation."
);

assert(
  !dashboardLayout.includes('label: "استوديو الوثائق"'),
  "The document studio must not appear as a separate sidebar item."
);

assert(
  ["/documents", "/dashboard", "/studio", "/users", "/settings"].every(path =>
    appRoutes.includes(`path="${path}"`)
  ),
  "Every restored workspace navigation item must resolve to a registered route."
);

assert(
  workspacePage.includes('section === "users"') &&
    !workspacePage.includes('section === "organizations"') &&
    !dashboardLayout.includes('label: "إدارة الجهات"') &&
    !appRoutes.includes('path="/organizations"') &&
    workspacePage.includes("trpc.workspace.administration.overview.useQuery"),
  "The workspace must expose user administration without any organization-management route or navigation."
);

assert(
  workspaceRouter.includes('tableId: "contacts"') &&
    workspaceRouter.includes('tableId: "organizations"') &&
    workspaceRouter.includes('tableId: "users"') &&
    !workspaceRouter.includes('tableId: "audit_logs"') &&
    workspaceRouter.includes("ctx.user.authUserId"),
  "Workspace API reads and writes must use the existing Appwrite tables and scope data to the signed-in owner."
);

assert(
  documentStudio.includes('aria-label="تصفية الوثائق حسب الحالة"') &&
    [
      '["all", "الكل"]',
      '["draft", "مسودات"]',
      '["issued", "صادرة"]',
      '["archived", "مؤرشفة"]',
    ].every(filter => documentStudio.includes(filter)) &&
    documentStudio.includes("xl:grid-cols-[360px_minmax(0,1fr)]"),
  "The document workspace must expose the four status filters and a 360px desktop list."
);

assert(
  documentStudio.includes('window.matchMedia("(max-width: 767px)").matches') &&
    documentStudio.includes("العودة إلى قائمة الوثائق") &&
    documentStudio.includes("document-preview-actions") &&
    globalStyles.includes(".document-preview-actions {") &&
    globalStyles.includes("env(safe-area-inset-bottom)"),
  "Mobile document selection must open a full preview with a safe-area action dock and a return path."
);

assert(
  [
    '["identity", "الترويسة والهوية"]',
    '["format", "تنسيق الورقة والخط"]',
    '["security", "الأمان والتحقق"]',
  ].every(tab => settingsPage.includes(tab)) &&
    settingsPage.includes('hidden={activeSettingsTab !== "identity"}') &&
    settingsPage.includes('hidden={activeSettingsTab !== "format"}') &&
    settingsPage.includes('hidden={activeSettingsTab !== "security"}'),
  "Document settings must be organized into exactly three focused tabs."
);

assert(
  settingsPage.includes(
    'className="hidden lg:sticky lg:top-24 lg:block lg:self-start"'
  ) &&
    settingsPage.includes("Dialog open={previewOpen}") &&
    settingsPage.includes("معاينة الوثيقة الرسمية A4") &&
    settingsPage.includes("منطقة إسقاط شعار الجهة") &&
    settingsPage.includes("تراجع عن التعديلات"),
  "Document settings must provide a live desktop A4 preview, a mobile preview dialog, logo drop zone, and undo action."
);

assert(
  workspacePage.includes("open={contactDialogOpen}") &&
    workspacePage.includes("open={userDialogOpen}") &&
    workspacePage.includes("xl:grid-cols-3") &&
    workspacePage.includes("setUserRole.mutate") &&
    !workspacePage.includes("min-w-[620px]") &&
    !workspacePage.includes("min-w-[680px]") &&
    workspaceRouter.includes("setUserRole: platformOwnerProcedure") &&
    workspaceRouter.includes(
      "rowData(row).organizationId !== scope.organizationId"
    ),
  "Contacts and users must use mobile-safe cards and dialogs, with organization-scoped role updates."
);

assert(
  documentStudio.includes('aria-label="خطوات إعداد الوثيقة"') &&
    documentStudio.includes('className="sticky top-0 z-20 grid grid-cols-3') &&
    documentStudio.includes("aria-selected={isDataTabActive}") &&
    documentStudio.includes("aria-selected={isPreviewTabActive}") &&
    documentStudio.includes("aria-selected={isPrintTabActive}") &&
    documentStudio.includes("setImportPrintOpen(true)") &&
    documentStudio.includes("setNativePrintOpen(true)"),
  "The mobile document workspace must expose data, A4 preview, and print tabs that open the correct print flow."
);

assert(
  documentStudioPrintDialog.includes("showDocumentHeader") &&
    documentStudioPrintDialog.includes("showDocumentFooter") &&
    documentStudioPrintDialog.includes("applyDocumentPrintVisibility") &&
    documentStudioPrintDialog.includes("معاينة A4 خلف هذا الحوار") &&
    documentPrintSections.includes('[data-document-print-section="header"]') &&
    documentPrintSections.includes('[data-document-print-section="footer"]') &&
    documentLetterhead.includes('data-document-print-section="header"') &&
    documentSignatureBlock.includes('data-document-print-section="footer"') &&
    documentStudio.includes('data-document-print-section="footer"'),
  "Header and footer visibility controls must update the A4 preview and the exact sections used by print/PDF output."
);

assert(
  pwaInstallContext.includes('"beforeinstallprompt"') &&
    pwaInstallContext.includes('"appinstalled"') &&
    pwaInstallContext.includes('"(display-mode: standalone)"') &&
    pwaInstallContext.includes("requestPwaInstall") &&
    headerActions.includes("canInstall") &&
    headerActions.includes("تثبيت التطبيق"),
  "The PWA install action must be captured at app startup and shown only when the browser offers installation."
);

assert(
  serviceWorker.includes('url.pathname === "/api"') &&
    serviceWorker.includes('url.pathname.startsWith("/api/")') &&
    serviceWorker.includes('request.method !== "GET"') &&
    serviceWorker.includes("url.origin !== self.location.origin"),
  "The service worker must bypass API and non-GET requests so private responses are never cached."
);

console.log(
  "Responsive shell and single-organization print-only checks passed."
);
