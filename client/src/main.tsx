import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { appwriteApiUrl } from "@/lib/appwriteApi";
import { fetchWithSession } from "@/lib/trpcFetch";
import App from "./App";
import { initializeAnalytics } from "./analytics";
import "./index.css";

// Keep every visible screen fresh without replacing the document or resetting
// local UI state. Individual screens may still opt into a shorter interval.
const LIVE_QUERY_REFRESH_INTERVAL_MS = 15_000;
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: LIVE_QUERY_REFRESH_INTERVAL_MS,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

const trpcEndpoint = appwriteApiUrl("/api/trpc");

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: trpcEndpoint,
      transformer: superjson,
      fetch: fetchWithSession,
    }),
  ],
});

initializeAnalytics();

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then(registration => registration.update())
      .catch(error => console.warn("PWA shell registration failed", error));
  });
}
