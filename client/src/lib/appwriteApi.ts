const PRODUCTION_API_ORIGIN = "https://wathaeqi-api.fra.appwrite.run";

function getConfiguredApiOrigin(): string {
  const configuredOrigin = import.meta.env.VITE_APPWRITE_API_URL?.trim();
  if (configuredOrigin) return configuredOrigin;

  // Keep the fallback limited to production; preview and local environments
  // must continue using their own relative API path.
  if (globalThis.location?.hostname === "wathaeqi.appwrite.network") {
    return PRODUCTION_API_ORIGIN;
  }

  return "";
}

/** Resolve an API path against the Appwrite Function origin when configured. */
export function appwriteApiUrl(path: string): string {
  const baseUrl = getConfiguredApiOrigin();
  if (!baseUrl) return path;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/, "")}${normalizedPath}`;
}
