import { Account, Client, TablesDB, Storage } from "appwrite";

// These are public Appwrite project identifiers, not secret credentials.
// Environment variables can override them for staging or another deployment.
const publicConfig = {
  endpoint: "https://fra.cloud.appwrite.io/v1",
  projectId: "wathaeqi",
  databaseId: "wathaeqi-db",
  tables: {
    documents: "documents",
    templates: "templates",
    contacts: "contacts",
    attachments: "attachments",
  },
  attachmentsBucketId: "document-attachments",
} as const;

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT?.trim() || publicConfig.endpoint;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID?.trim() || publicConfig.projectId;

export const appwriteConfigured = Boolean(endpoint && projectId);

export const appwriteClient = new Client();

if (appwriteConfigured) {
  appwriteClient.setEndpoint(endpoint).setProject(projectId);
}

export const account = appwriteConfigured ? new Account(appwriteClient) : null;
export const tablesDB = appwriteConfigured ? new TablesDB(appwriteClient) : null;
export const storage = appwriteConfigured ? new Storage(appwriteClient) : null;

export const appwriteResources = {
  databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID?.trim() || publicConfig.databaseId,
  tables: {
    documents: import.meta.env.VITE_APPWRITE_DOCUMENTS_COLLECTION_ID?.trim() || publicConfig.tables.documents,
    templates: import.meta.env.VITE_APPWRITE_TEMPLATES_COLLECTION_ID?.trim() || publicConfig.tables.templates,
    contacts: import.meta.env.VITE_APPWRITE_CONTACTS_COLLECTION_ID?.trim() || publicConfig.tables.contacts,
    attachments: import.meta.env.VITE_APPWRITE_ATTACHMENTS_TABLE_ID?.trim() || publicConfig.tables.attachments,
  },
  attachmentsBucketId: import.meta.env.VITE_APPWRITE_ATTACHMENTS_BUCKET_ID?.trim() || publicConfig.attachmentsBucketId,
} as const;
