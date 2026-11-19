import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";

const NotFound = lazy(() => import("@/pages/NotFound"));
const DocumentStudioPage = lazy(
  () => import("./features/document-studio/DocumentStudioPage")
);
const Profile = lazy(() => import("./features/users/Profile"));
const WorkspacePage = lazy(() => import("./features/workspace/WorkspacePage"));
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage"));
const TelegramsPage = lazy(() => import("./features/telegrams/TelegramsPage"));
const TelegramDetailPage = lazy(
  () => import("./features/telegrams/TelegramDetailPage")
);
const AuditLogPage = lazy(() => import("./features/audit/AuditLogPage"));
const OrganizationsPage = lazy(
  () => import("./features/organizations/OrganizationsPage")
);
const UsersPage = lazy(() => import("./features/users/UsersPage"));
const DepartmentSettingsPage = lazy(
  () => import("./features/settings/DepartmentSettingsPage")
);
const PlatformDocumentSettingsPage = lazy(
  () => import("./features/platform-settings/PlatformDocumentSettingsPage")
);
const About = lazy(() => import("./pages/About"));
const Terms = lazy(() => import("./pages/Terms"));
function Shell({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
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
        <Route path="/dashboard">
          <Shell>
            <DashboardPage />
          </Shell>
        </Route>
        <Route path="/telegrams">
          <Shell>
            <TelegramsPage />
          </Shell>
        </Route>
        <Route path="/telegrams/:id">
          {params => (
            <Shell>
              <TelegramDetailPage id={params.id} />
            </Shell>
          )}
        </Route>
        <Route path="/audit-logs">
          <Shell>
            <AuditLogPage />
          </Shell>
        </Route>
        <Route path="/contacts">
          <Shell>
            <WorkspacePage section="contacts" />
          </Shell>
        </Route>
        <Route path="/notifications">
          <Shell>
            <WorkspacePage section="notifications" />
          </Shell>
        </Route>
        <Route path="/activity">
          <Shell>
            <WorkspacePage section="activity" />
          </Shell>
        </Route>
        <Route path="/users">
          <Shell>
            <UsersPage />
          </Shell>
        </Route>
        <Route path="/organizations">
          <Shell>
            <OrganizationsPage />
          </Shell>
        </Route>
        <Route path="/department-settings">
          <Shell>
            <DepartmentSettingsPage />
          </Shell>
        </Route>
        <Route path="/settings">
          <Shell>
            <PlatformDocumentSettingsPage />
          </Shell>
        </Route>
        <Route path="/profile">
          <Shell>
            <Profile />
          </Shell>
        </Route>
        <Route path="/about">
          <Shell>
            <About />
          </Shell>
        </Route>
        <Route path="/terms" component={Terms} />
        <Route path="/">
          <Shell>
            <DocumentStudioPage />
          </Shell>
        </Route>
        <Route path="/404">
          <Shell>
            <NotFound />
          </Shell>
        </Route>
        <Route>
          <Shell>
            <NotFound />
          </Shell>
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
