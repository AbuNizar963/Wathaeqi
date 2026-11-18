const splitCsv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);

export const ENV = {
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? "",
  supabaseStorageBucket:
    process.env.SUPABASE_STORAGE_BUCKET ?? "telegram-files",
  // Server-only Appwrite credentials. Never add VITE_ fallbacks for secrets.
  appwriteEndpoint:
    process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || "",
  appwriteProjectId:
    process.env.APPWRITE_PROJECT_ID ||
    process.env.VITE_APPWRITE_PROJECT_ID ||
    "",
  appwriteApiKey: process.env.APPWRITE_API_KEY ?? "",
  appwriteDatabaseId:
    process.env.APPWRITE_DATABASE_ID ||
    process.env.VITE_APPWRITE_DATABASE_ID ||
    "",
  appwriteBucketId:
    process.env.APPWRITE_BUCKET_ID ||
    process.env.VITE_APPWRITE_ATTACHMENTS_BUCKET_ID ||
    "",
  adminEmails: splitCsv(process.env.ADMIN_EMAILS),
  authSessionSecret: process.env.AUTH_SESSION_SECRET ?? "",
  ownerUsername: process.env.OWNER_USERNAME ?? "AbuNizar",
  ownerPasswordHash: process.env.OWNER_PASSWORD_HASH ?? "",
  ownerInitialPassword: process.env.OWNER_INITIAL_PASSWORD ?? "",
  ownerNotificationWebhookUrl: process.env.OWNER_NOTIFICATION_WEBHOOK_URL ?? "",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
  firebasePrivateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(
    /\\n/g,
    "\n"
  ),
  releaseNotificationSecret: process.env.RELEASE_NOTIFICATION_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",
};

export function assertProductionEnvironment(env: typeof ENV = ENV): void {
  if (!env.isProduction) return;

  const missing: string[] = [];

  if (!env.appwriteEndpoint.trim()) {
    missing.push("APPWRITE_ENDPOINT");
  } else {
    let parsedEndpoint: URL;
    try {
      parsedEndpoint = new URL(env.appwriteEndpoint);
    } catch {
      throw new Error(
        "APPWRITE_ENDPOINT must be a valid absolute HTTPS URL ending in /v1"
      );
    }

    const endpointPath = parsedEndpoint.pathname.replace(/\/+$/, "");
    if (
      parsedEndpoint.protocol !== "https:" ||
      !parsedEndpoint.hostname ||
      !endpointPath.endsWith("/v1") ||
      parsedEndpoint.username ||
      parsedEndpoint.password ||
      parsedEndpoint.search ||
      parsedEndpoint.hash
    ) {
      throw new Error(
        "APPWRITE_ENDPOINT must be a valid absolute HTTPS URL ending in /v1"
      );
    }
  }

  if (!env.appwriteProjectId.trim()) missing.push("APPWRITE_PROJECT_ID");
  if (!env.appwriteApiKey.trim()) missing.push("APPWRITE_API_KEY");
  if (!env.appwriteDatabaseId.trim()) missing.push("APPWRITE_DATABASE_ID");
  if (!env.appwriteBucketId.trim()) missing.push("APPWRITE_BUCKET_ID");
  // The API may start without a session-signing key so public health and
  // non-auth routes remain available. Auth helpers fail closed until it exists.
  if (env.authSessionSecret && env.authSessionSecret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must contain at least 32 characters");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing or invalid production environment configuration: ${missing.join(", ")}`
    );
  }
}
