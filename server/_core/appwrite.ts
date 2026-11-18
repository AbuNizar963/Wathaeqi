import { Client, Storage, TablesDB, Tokens } from "node-appwrite";
import { ENV } from "./env";

export class AppwriteConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppwriteConfigurationError";
  }
}

type AppwriteAdminConfig = {
  endpoint: string;
  projectId: string;
  apiKey: string;
};

let adminClient: Client | null = null;
let tablesDb: TablesDB | null = null;
let storage: Storage | null = null;
let tokens: Tokens | null = null;

function normalizeEndpointPath(pathname: string): string {
  let normalizedPath = pathname;
  while (normalizedPath.endsWith("/")) {
    normalizedPath = normalizedPath.slice(0, -1);
  }
  return normalizedPath;
}

function readAdminConfig(): AppwriteAdminConfig {
  const endpoint = ENV.appwriteEndpoint.trim();
  const projectId = ENV.appwriteProjectId.trim();
  const apiKey = ENV.appwriteApiKey.trim();
  const missing: string[] = [];

  if (!endpoint) missing.push("APPWRITE_ENDPOINT");
  if (!projectId) missing.push("APPWRITE_PROJECT_ID");
  if (!apiKey) missing.push("APPWRITE_API_KEY");

  if (missing.length > 0) {
    throw new AppwriteConfigurationError(
      `Missing server-side Appwrite configuration: ${missing.join(", ")}`
    );
  }

  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new AppwriteConfigurationError(
      "APPWRITE_ENDPOINT must be a valid absolute HTTPS URL ending in /v1"
    );
  }

  const normalizedPath = normalizeEndpointPath(parsedEndpoint.pathname);
  if (
    parsedEndpoint.protocol !== "https:" ||
    !parsedEndpoint.hostname ||
    !normalizedPath.endsWith("/v1") ||
    parsedEndpoint.username ||
    parsedEndpoint.password ||
    parsedEndpoint.search ||
    parsedEndpoint.hash
  ) {
    throw new AppwriteConfigurationError(
      "APPWRITE_ENDPOINT must be a valid absolute HTTPS URL ending in /v1"
    );
  }

  return {
    endpoint: `${parsedEndpoint.origin}${normalizedPath}`,
    projectId,
    apiKey,
  };
}

export function isAppwriteConfigured(): boolean {
  try {
    readAdminConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the privileged Appwrite client for server-side use only.
 *
 * This module must never be imported by client-side code. The API key is read
 * only from APPWRITE_API_KEY and is deliberately excluded from all return
 * values, logs, and error messages.
 */
export function getAppwriteSessionClient(sessionSecret?: string): Client {
  const endpoint = ENV.appwriteEndpoint.trim();
  const projectId = ENV.appwriteProjectId.trim();
  const missing: string[] = [];

  if (!endpoint) missing.push("APPWRITE_ENDPOINT");
  if (!projectId) missing.push("APPWRITE_PROJECT_ID");

  if (missing.length > 0) {
    throw new AppwriteConfigurationError(
      `Missing public Appwrite configuration: ${missing.join(", ")}`
    );
  }

  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new AppwriteConfigurationError(
      "APPWRITE_ENDPOINT must be a valid absolute HTTPS URL ending in /v1"
    );
  }

  const normalizedPath = normalizeEndpointPath(parsedEndpoint.pathname);
  if (
    parsedEndpoint.protocol !== "https:" ||
    !parsedEndpoint.hostname ||
    !normalizedPath.endsWith("/v1") ||
    parsedEndpoint.username ||
    parsedEndpoint.password ||
    parsedEndpoint.search ||
    parsedEndpoint.hash
  ) {
    throw new AppwriteConfigurationError(
      "APPWRITE_ENDPOINT must be a valid absolute HTTPS URL ending in /v1"
    );
  }

  const client = new Client()
    .setEndpoint(`${parsedEndpoint.origin}${normalizedPath}`)
    .setProject(projectId);

  if (sessionSecret) client.setSession(sessionSecret);
  return client;
}

export function getAppwriteAdminClient(): Client {
  if (adminClient) return adminClient;

  const config = readAdminConfig();
  adminClient = new Client()
    .setEndpoint(config.endpoint)
    .setProject(config.projectId)
    .setKey(config.apiKey);

  return adminClient;
}

export function getAppwriteTablesDB(): TablesDB {
  if (!tablesDb) {
    tablesDb = new TablesDB(getAppwriteAdminClient());
  }

  return tablesDb;
}

export function getAppwriteStorage(): Storage {
  if (!storage) {
    storage = new Storage(getAppwriteAdminClient());
  }

  return storage;
}

export function getAppwriteTokens(): Tokens {
  if (!tokens) {
    tokens = new Tokens(getAppwriteAdminClient());
  }

  return tokens;
}

export function getAppwriteDatabaseId(): string {
  const databaseId = ENV.appwriteDatabaseId.trim();
  if (!databaseId) {
    throw new AppwriteConfigurationError(
      "APPWRITE_DATABASE_ID is required for Appwrite database operations"
    );
  }

  return databaseId;
}

export function getAppwriteBucketId(): string {
  const bucketId = ENV.appwriteBucketId.trim();
  if (!bucketId) {
    throw new AppwriteConfigurationError(
      "APPWRITE_BUCKET_ID is required for Appwrite storage operations"
    );
  }

  return bucketId;
}
