/** Resolve an API path against the Appwrite Function origin when configured. */
export function appwriteApiUrl(path: string): string {
  const baseUrl = import.meta.env.VITE_APPWRITE_API_URL?.trim();
  if (!baseUrl) return path;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/, "")}${normalizedPath}`;
}
