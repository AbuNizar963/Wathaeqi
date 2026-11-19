import { ownerTrpc } from "@/lib/ownerTrpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
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

// The migration preview is a static Appwrite Site. Never fall back to its
// own origin for tRPC: that origin serves the frontend, not the owner API.
// The environment variable remains the preferred override for other previews.
const DEFAULT_APPWRITE_OWNER_API_URL =
  "https://wathaeqi-api.fra.appwrite.run";
const configuredAppwriteApiUrl = import.meta.env.VITE_APPWRITE_API_URL?.trim();
const appwriteApiUrl =
  configuredAppwriteApiUrl || DEFAULT_APPWRITE_OWNER_API_URL;
const trpcEndpoint = `${appwriteApiUrl.replace(/\/+$/, "")}/api/trpc`;

const trpcClient = ownerTrpc.createClient({
  links: [
    httpBatchLink({
      url: trpcEndpoint,
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...init,
          credentials: "include",
        });
      },
    }),
  ],
});

initializeAnalytics();

createRoot(document.getElementById("root")!).render(
  <ownerTrpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ownerTrpc.Provider>
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
