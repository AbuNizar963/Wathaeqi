type NetlifyRuntime = typeof globalThis & {
  Netlify?: { env: { get(name: string): string | undefined } };
};

/**
 * Wathaeqi's independent Netlify API health endpoint.
 *
 * This endpoint reports configuration presence only. It does not claim that
 * authentication, database reads, or storage operations have been migrated.
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
    env?.get("APPWRITE_ENDPOINT") ??
    env?.get("VITE_APPWRITE_ENDPOINT") ??
    "";
  const projectId =
    env?.get("APPWRITE_PROJECT_ID") ??
    env?.get("VITE_APPWRITE_PROJECT_ID") ??
    "";

  let validEndpoint = false;
  try {
    const parsed = new URL(endpoint);
    validEndpoint =
      parsed.protocol === "https:" && parsed.pathname.startsWith("/v1");
  } catch {
    validEndpoint = false;
  }

  const appwriteConfigured = validEndpoint && projectId.trim().length > 0;

  return Response.json(
    {
      ok: true,
      service: "wathaeqi-api",
      apiVersion: 1,
      integrations: {
        appwrite: appwriteConfigured ? "configured" : "configuration-required",
      },
      capabilities: {
        authentication: "migration-pending",
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
