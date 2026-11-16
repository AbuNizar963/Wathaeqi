import { Account, Client, Databases, Storage } from "appwrite";

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT?.trim() ?? "";
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID?.trim() ?? "";

export const appwriteConfigured = Boolean(endpoint && projectId);

export const appwriteClient = new Client();

if (appwriteConfigured) {
  appwriteClient.setEndpoint(endpoint).setProject(projectId);
}

export const account = appwriteConfigured ? new Account(appwriteClient) : null;
export const databases = appwriteConfigured ? new Databases(appwriteClient) : null;
export const storage = appwriteConfigured ? new Storage(appwriteClient) : null;

export const appwriteResources = {
  databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID?.trim() ?? "",
  collections: {
    documents: import.meta.env.VITE_APPWRITE_DOCUMENTS_COLLECTION_ID?.trim() ?? "",
    templates: import.meta.env.VITE_APPWRITE_TEMPLATES_COLLECTION_ID?.trim() ?? "",
    contacts: import.meta.env.VITE_APPWRITE_CONTACTS_COLLECTION_ID?.trim() ?? "",
  },
  attachmentsBucketId: import.meta.env.VITE_APPWRITE_ATTACHMENTS_BUCKET_ID?.trim() ?? "",
} as const;
