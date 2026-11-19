type NetlifyRuntime = typeof globalThis & {
  Netlify?: { env: { get(name: string): string | undefined } };
};

/**
 * Wathaeqi's independent Netlify API health endpoint.
 *
 * This endpoint reports configuration presence only; it does not claim API
 * reachability or successful database/storage operations.
 */
export default async function apiHealth(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json(
      { ok: false, error: "Method not allowed" },
      { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } }
    );
  }

  const env = (globalThis as NetlifyRuntime).Netlify?.env;
  const endpoint =
    env?.get("APPWRITE_ENDPOINT") ?? env?.get("VITE_APPWRITE_ENDPOINT") ?? "";
  const projectId =
    env?.get("APPWRITE_PROJECT_ID") ??
    env?.get("VITE_APPWRITE_PROJECT_ID") ??
    "";
  const apiKey = env?.get("APPWRITE_API_KEY") ?? "";
  const databaseId =
    env?.get("APPWRITE_DATABASE_ID") ??
    env?.get("VITE_APPWRITE_DATABASE_ID") ??
    "";
  const bucketId =
    env?.get("APPWRITE_BUCKET_ID") ??
    env?.get("VITE_APPWRITE_ATTACHMENTS_BUCKET_ID") ??
    "";
  const sessionSecret = env?.get("AUTH_SESSION_SECRET") ?? "";

  let validEndpoint = false;
  try {
    const parsed = new URL(endpoint);
    validEndpoint =
      parsed.protocol === "https:" &&
      Boolean(parsed.hostname) &&
      parsed.pathname.replace(/\/+$/, "") === "/v1" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash;
  } catch {
    validEndpoint = false;
  }

  // This checks configuration presence, not key scopes or API reachability.
  const appwriteConfigured =
    validEndpoint &&
    projectId.trim().length > 0 &&
    apiKey.trim().length > 0 &&
    databaseId.trim().length > 0 &&
    bucketId.trim().length > 0;

  return Response.json(
    {
      ok: true,
      service: "wathaeqi-api",
      apiVersion: 1,
      integrations: {
        appwrite: appwriteConfigured ? "configured" : "configuration-required",
      },
      capabilities: {
        authentication:
          appwriteConfigured && sessionSecret.length >= 32
            ? "appwrite-auth-configured"
            : "configuration-required",
        records: "migration-pending",
        storage: "migration-pending",
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

export const config = {
  path: "/api/health",
  method: "GET",
};
