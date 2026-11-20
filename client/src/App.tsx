import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import OwnerUserManagement from "./features/users/OwnerUserManagement";
import OwnerOrganizationManagement from "./features/organizations/OwnerOrganizationManagement";
import PlatformDocumentSettings from "./features/platform-settings/PlatformDocumentSettings";
import PlatformDocumentSettingsPage from "./features/platform-settings/PlatformDocumentSettingsPage";
import OperationsWorkspace from "./features/admin/OperationsWorkspace";
import WorkspacePage from "./features/workspace/WorkspacePage";
import { ThemeProvider } from "./contexts/ThemeContext";

const NotFound = lazy(() => import("@/pages/NotFound"));
const Home = lazy(() => import("./pages/Home"));
const VerifyTelegram = lazy(() => import("./pages/VerifyTelegram"));
const AuditLogPage = lazy(() => import("./features/reports/AuditLog"));
const Profile = lazy(() => import("./features/users/Profile"));
const About = lazy(() => import("./pages/About"));
const Terms = lazy(() => import("./pages/Terms"));
const OwnerDashboardPage = lazy(() => import("./pages/OwnerDashboard"));

function DashboardPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DashboardLayout>{children}</DashboardLayout>
      <OwnerUserManagement />
      <OwnerOrganizationManagement />
      <PlatformDocumentSettings />
      <OperationsWorkspace />
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
        <Route path="/verify/:token" component={VerifyTelegram} />
        <Route path="/owner-dashboard">
          <DashboardPage>
            <OwnerDashboardPage />
          </DashboardPage>
        </Route>
        <Route path="/audit-log">
          <DashboardPage>
            <AuditLogPage />
          </DashboardPage>
        </Route>
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
        <Route path="/dashboard">
          <DashboardPage>
            <WorkspacePage section="dashboard" />
          </DashboardPage>
        </Route>
        <Route path="/contacts">
          <DashboardPage>
            <WorkspacePage section="contacts" />
          </DashboardPage>
        </Route>
        <Route path="/activity">
          <DashboardPage>
            <WorkspacePage section="activity" />
          </DashboardPage>
        </Route>
        <Route path="/notifications">
          <DashboardPage>
            <WorkspacePage section="notifications" />
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
            <Home />
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
