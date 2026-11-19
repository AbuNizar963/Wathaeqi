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
] = await Promise.all(
  [
    "client/index.html",
    "client/src/components/DashboardLayout.tsx",
    "client/src/components/HeaderActions.tsx",
    "client/src/components/ui/sidebar.tsx",
    "client/src/App.tsx",
    "client/src/features/platform-settings/PlatformDocumentSettingsPage.tsx",
    "client/src/features/document-studio/DocumentStudioPage.tsx",
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
  dashboardLayout.includes('<BrandMark size="sm" />') &&
    dashboardLayout.includes(
      'className="h-10 w-10 rounded-xl border bg-background shadow-sm"'
    ),
  "The mobile dashboard header must provide the primary brand mark."
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
    dashboardLayout.includes('collapsible="offcanvas"') &&
    dashboardLayout.includes("isMobile && !isCollapsed") &&
    dashboardLayout.includes("fixed inset-0 z-20") &&
    dashboardLayout.includes("setOpen(false)"),
  "The desktop sidebar must overlay the page and close through its backdrop."
);

assert(
  dashboardLayout.includes(
    "flex h-16 shrink-0 items-center justify-between border-b"
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
    sidebarLayout.includes('"w-0"'),
  "An offcanvas sidebar must not reserve layout width for the page content."
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
    documentStudio.includes("OFFICIAL_MINISTRY_NAME") &&
    documentStudio.includes("buildTelegramWatermarkCss") &&
    documentStudio.includes("editable={!previewMode}"),
  "The document workspace must expose a read-only preview and apply watermark settings."
);

console.log("Responsive application shell checks passed.");
