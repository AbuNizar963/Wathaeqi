/**
 * Wathaeqi API health endpoint on Appwrite Functions.
 *
 * Reports runtime availability only. It deliberately does not claim that
 * authentication, database, storage, or business API migrations are complete.
 */
export default async ({ req, res, log, error }) => {
  if (req.method !== "GET") {
    return res.json(
      { ok: false, error: "Method not allowed" },
      405,
      { allow: "GET", "cache-control": "no-store" }
    );
  }

  try {
    log("Wathaeqi Appwrite health endpoint invoked");

    return res.json(
      {
        ok: true,
        service: "wathaeqi-api",
        platform: "appwrite-functions",
        runtime: process.version,
        capabilities: {
          apiRuntime: "available",
          authentication: "migration-pending",
          records: "migration-pending",
          storage: "migration-pending"
        },
        timestamp: new Date().toISOString()
      },
      200,
      { "cache-control": "no-store, max-age=0" }
    );
  } catch (cause) {
    error("Wathaeqi health endpoint failed");
    return res.json(
      { ok: false, error: "Health endpoint unavailable" },
      503,
      { "cache-control": "no-store" }
    );
  }
};
