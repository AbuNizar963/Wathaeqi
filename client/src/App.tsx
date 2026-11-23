import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import OwnerUserManagement from "./features/users/OwnerUserManagement";
import OwnerOrganizationManagement from "./features/organizations/OwnerOrganizationManagement";
import PlatformDocumentSettingsPage from "./features/platform-settings/PlatformDocumentSettingsPage";
import WorkspacePage from "./features/workspace/WorkspacePage";
import { ThemeProvider } from "./contexts/ThemeContext";

const NotFound = lazy(() => import("@/pages/NotFound"));
const DocumentLibraryPage = lazy(
  () => import("./features/document-library/DocumentLibraryPage")
);
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
      <OwnerOrganizationManagement />
    </>
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
        <Route path="/studio">
          <DashboardPage>
            <DocumentStudioPage />
          </DashboardPage>
        </Route>
        <Route path="/dashboard">
          <DashboardPage>
            <DocumentLibraryPage />
          </DashboardPage>
        </Route>
        <Route path="/users">
          <DashboardPage>
            <WorkspacePage section="users" />
          </DashboardPage>
        </Route>
        <Route path="/organizations">
          <DashboardPage>
            <WorkspacePage section="organizations" />
          </DashboardPage>
        </Route>
        <Route path="/about">
          <DashboardPage>
            <About />
          </DashboardPage>
        </Route>
        <Route path="/terms" component={Terms} />
        <Route path="/">
          <DashboardPage>
            <DocumentLibraryPage />
          </DashboardPage>
        </Route>
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
