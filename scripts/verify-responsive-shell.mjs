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
  dashboardLayout,
  headerActions,
  sidebarLayout,
  appRoutes,
  settingsPage,
  documentStudio,
  documentWatermarkComponent,
  platformDocumentPreview,
  workspacePage,
  workspaceRouter,
  globalStyles,
] = await Promise.all(
  [
    "client/index.html",
    "client/src/components/DashboardLayout.tsx",
    "client/src/components/HeaderActions.tsx",
    "client/src/components/ui/sidebar.tsx",
    "client/src/App.tsx",
    "client/src/features/platform-settings/PlatformDocumentSettingsPage.tsx",
    "client/src/features/document-studio/DocumentStudioPage.tsx",
    "client/src/features/document-studio/DocumentWatermark.tsx",
    "client/src/features/platform-settings/PlatformDocumentPreview.tsx",
    "client/src/features/workspace/WorkspacePage.tsx",
    "server/features/workspace/workspaceRouter.ts",
    "client/src/index.css",
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
  dashboardLayout.includes(
    '<h1 className="max-w-[72vw] truncate text-sm font-semibold text-foreground">'
  ) &&
    dashboardLayout.includes('className="h-11 w-11 rounded-lg"') &&
    dashboardLayout.includes('aria-label="الإشعارات"'),
  "The mobile dashboard header must stay minimal and expose the page title and notifications."
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
  dashboardLayout.includes("const isMobile = useIsMobile();") &&
    dashboardLayout.includes("useState(() => !isMobile)") &&
    dashboardLayout.includes('collapsible={isMobile ? "offcanvas" : "icon"}') &&
    dashboardLayout.includes("isMobile && openMobile") &&
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
    dashboardLayout.includes("<CommandDialog"),
  "The desktop shell must expose a searchable command palette with the Ctrl+K shortcut."
);

assert(
  dashboardLayout.includes("<HeaderActions />") &&
    dashboardLayout.includes(
      'className="mt-auto border-t border-sidebar-border p-3"'
    ),
  "Mobile users must retain theme and account controls inside the drawer, not the top bar."
);

assert(
  dashboardLayout.includes('aria-label="التنقل الرئيسي"') &&
    dashboardLayout.includes(
      'paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))"'
    ) &&
    dashboardLayout.includes('setLocation("/documents?create=1")') &&
    dashboardLayout.includes("إنشاء جديد") &&
    dashboardLayout.includes("h-[52px]"),
  "The mobile navigation must expose dashboard, documents, create, and more actions with safe-area spacing and a 52px top bar."
);

assert(
  dashboardLayout.includes('collapsible={isMobile ? "offcanvas" : "icon"}') &&
    dashboardLayout.includes("DEFAULT_WIDTH = 240"),
  "The desktop navigation must use a 240px expanded rail and a 72px icon-collapsed state."
);

assert(
  appRoutes.includes('ThemeProvider defaultTheme="light" switchable') &&
    (await readProjectFile("client/src/index.css")).includes(
      "--background: #f9fafb"
    ) &&
    (await readProjectFile("client/src/index.css")).includes(
      "--card: #121215"
    ) &&
    (await readProjectFile("client/src/index.css")).includes(
      "--primary: #fafafa"
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
    ['["all", "الكل"]', '["draft", "مسودات"]', '["issued", "صادرة"]', '["archived", "مؤرشفة"]'].every(filter =>
      documentStudio.includes(filter)
    ) &&
    documentStudio.includes('xl:grid-cols-[360px_minmax(0,1fr)]'),
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

console.log(
  "Responsive shell and single-organization print-only checks passed."
);
