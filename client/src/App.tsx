import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Redirect, Route, Switch, useSearch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import OwnerUserManagement from "./features/users/OwnerUserManagement";
import PlatformDocumentSettingsPage from "./features/platform-settings/PlatformDocumentSettingsPage";
import WorkspacePage from "./features/workspace/WorkspacePage";
import { legacyWorkspaceTarget } from "./features/document-studio/workspaceRoutes";
import { ThemeProvider } from "./contexts/ThemeContext";

const NotFound = lazy(() => import("@/pages/NotFound"));
const DocumentStudioPage = lazy(
  () => import("./features/document-studio/DocumentStudioPage")
);
const Profile = lazy(() => import("./features/users/Profile"));
const About = lazy(() => import("./pages/About"));
const Terms = lazy(() => import("./pages/Terms"));

function DashboardPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DashboardLayout>{children}</DashboardLayout>
      <OwnerUserManagement />
    </>
  );
}

function LegacyWorkspaceRoute() {
  const search = useSearch();
  return (
    <Redirect to={legacyWorkspaceTarget(search ? `?${search}` : "")} replace />
  );
}

function Router() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          جارٍ تحميل الصفحة...
        </div>
      }
    >
      <Switch>
        <Route path="/profile">
          <DashboardPage>
            <Profile />
          </DashboardPage>
        </Route>
        <Route path="/settings">
          <DashboardPage>
            <PlatformDocumentSettingsPage />
          </DashboardPage>
        </Route>
        <Route path="/documents">
          <DashboardPage>
            <DocumentStudioPage />
          </DashboardPage>
        </Route>
        <Route path="/studio" component={LegacyWorkspaceRoute} />
        <Route path="/dashboard" component={LegacyWorkspaceRoute} />
        <Route path="/users">
          <DashboardPage>
            <WorkspacePage section="users" />
          </DashboardPage>
        </Route>
        <Route path="/about">
          <DashboardPage>
            <About />
          </DashboardPage>
        </Route>
        <Route path="/terms" component={Terms} />
        <Route path="/" component={LegacyWorkspaceRoute} />
        <Route path="/404">
          <DashboardPage>
            <NotFound />
          </DashboardPage>
        </Route>
        <Route>
          <DashboardPage>
            <NotFound />
          </DashboardPage>
        </Route>
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
