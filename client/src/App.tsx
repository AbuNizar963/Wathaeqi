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
const PlatformDocumentSettingsPage = lazy(
  () => import("./features/platform-settings/PlatformDocumentSettingsPage")
);
const About = lazy(() => import("./pages/About"));
const Terms = lazy(() => import("./pages/Terms"));
function DashboardPage({ children }: { children: React.ReactNode }) {
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
        <Route path="/dashboard"><DashboardPage><WorkspacePage section="dashboard" /></DashboardPage></Route>
        <Route path="/contacts">
          <DashboardPage>
            <WorkspacePage section="contacts" />
          </DashboardPage>
        </Route>
        <Route path="/notifications"><DashboardPage><WorkspacePage section="notifications" /></DashboardPage></Route>
        <Route path="/activity">
          <DashboardPage>
            <WorkspacePage section="activity" />
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
        <Route path="/settings">
          <DashboardPage>
            <PlatformDocumentSettingsPage />
          </DashboardPage>
        </Route>
        <Route path="/profile">
          <DashboardPage>
            <Profile />
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
            <DocumentStudioPage />
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
