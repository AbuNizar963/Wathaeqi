import { Client, Storage, TablesDB, Tokens, Users } from "node-appwrite";
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
let adminClientKey: string | null = null;
let tablesDb: TablesDB | null = null;
let tablesDbClient: Client | null = null;
let storage: Storage | null = null;
let storageClient: Client | null = null;
let tokens: Tokens | null = null;
let tokensClient: Client | null = null;
let users: Users | null = null;
let usersClient: Client | null = null;

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
  const config = readAdminConfig();
  if (adminClient && adminClientKey === config.apiKey) return adminClient;

  // Appwrite Functions can inject a short-lived, per-execution API key.
  // Rebuild cached SDK services when that key changes between warm executions.
  adminClientKey = config.apiKey;
  adminClient = new Client()
    .setEndpoint(config.endpoint)
    .setProject(config.projectId)
    .setKey(config.apiKey);
  tablesDb = null;
  tablesDbClient = null;
  storage = null;
  storageClient = null;
  tokens = null;
  tokensClient = null;
  users = null;
  usersClient = null;

  return adminClient;
}

export function getAppwriteTablesDB(): TablesDB {
  const client = getAppwriteAdminClient();
  if (!tablesDb || tablesDbClient !== client) {
    tablesDb = new TablesDB(client);
    tablesDbClient = client;
  }

  return tablesDb;
}

export function getAppwriteStorage(): Storage {
  const client = getAppwriteAdminClient();
  if (!storage || storageClient !== client) {
    storage = new Storage(client);
    storageClient = client;
  }

  return storage;
}

export function getAppwriteTokens(): Tokens {
  const client = getAppwriteAdminClient();
  if (!tokens || tokensClient !== client) {
    tokens = new Tokens(client);
    tokensClient = client;
  }

  return tokens;
}

export function getAppwriteUsers(): Users {
  const client = getAppwriteAdminClient();
  if (!users || usersClient !== client) {
    users = new Users(client);
    usersClient = client;
  }

  return users;
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
