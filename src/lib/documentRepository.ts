import { ID, Permission, Query, Role } from "appwrite";
import { account, appwriteResources, storage, tablesDB } from "./appwrite";

export type CloudDocument = {
  id: string;
  title: string;
  category: string;
  content: string;
  updatedAt: string;
};

type DocumentRow = {
  $id: string;
  ownerId: string;
  title: string;
  category: string;
  content: string;
  updatedAt: string;
};

function requireServices() {
  if (!account || !tablesDB || !appwriteResources.databaseId || !appwriteResources.tables.documents) {
    throw new Error("إعدادات Appwrite غير مكتملة. تحقق من متغيرات البيئة في الاستضافة.");
  }
  return { account, tablesDB, databaseId: appwriteResources.databaseId, tableId: appwriteResources.tables.documents };
}

function mapRow(row: DocumentRow): CloudDocument {
  return {
    id: row.$id,
    title: row.title,
    category: row.category,
    content: row.content,
    updatedAt: row.updatedAt,
  };
}

export async function getCurrentUser() {
  const { account } = requireServices();
  try {
    return await account.get();
  } catch {
    return null;
  }
}

export async function signIn(email: string, password: string) {
  const { account } = requireServices();
  await account.createEmailPasswordSession({ email: email.trim(), password });
  return account.get();
}

export async function signUp(name: string, email: string, password: string) {
  const { account } = requireServices();
  await account.create({ userId: ID.unique(), email: email.trim(), password, name: name.trim() });
  await account.createEmailPasswordSession({ email: email.trim(), password });
  return account.get();
}

export async function signOut() {
  const { account } = requireServices();
  await account.deleteSession({ sessionId: "current" });
}

export async function listDocuments(): Promise<CloudDocument[]> {
  const { account, tablesDB, databaseId, tableId } = requireServices();
  const user = await account.get();
  const result = await tablesDB.listRows({
    databaseId,
    tableId,
    queries: [Query.equal("ownerId", user.$id), Query.orderDesc("updatedAt"), Query.limit(100)],
  });
  return result.rows.map((row) => mapRow(row as unknown as DocumentRow));
}

export async function createDocument(input: Omit<CloudDocument, "id">): Promise<CloudDocument> {
  const { account, tablesDB, databaseId, tableId } = requireServices();
  const user = await account.get();
  const row = await tablesDB.createRow({
    databaseId,
    tableId,
    rowId: ID.unique(),
    data: { ownerId: user.$id, ...input, updatedAt: new Date().toISOString() },
    permissions: [
      Permission.read(Role.user(user.$id)),
      Permission.update(Role.user(user.$id)),
      Permission.delete(Role.user(user.$id)),
    ],
  });
  return mapRow(row as unknown as DocumentRow);
}

export async function updateDocument(id: string, input: Omit<CloudDocument, "id">): Promise<CloudDocument> {
  const { tablesDB, databaseId, tableId } = requireServices();
  const row = await tablesDB.updateRow({
    databaseId,
    tableId,
    rowId: id,
    data: { ...input, updatedAt: new Date().toISOString() },
  });
  return mapRow(row as unknown as DocumentRow);
}

export async function deleteDocument(id: string): Promise<void> {
  const { tablesDB, databaseId, tableId } = requireServices();
  await tablesDB.deleteRow({ databaseId, tableId, rowId: id });
}


export type CloudTemplate = { id: string; title: string; category: string; content: string };
export type CloudContact = { id: string; name: string; email: string; phone: string; organization: string };

async function requireTable(table: "templates" | "contacts") {
  const { account } = requireServices();
  if (!tablesDB || !appwriteResources.tables[table]) {
    throw new Error(`جدول ${table} غير مهيأ في Appwrite.`);
  }
  const user = await account.get();
  return { user, tablesDB, databaseId: appwriteResources.databaseId, tableId: appwriteResources.tables[table] };
}

function rowPermissions(userId: string) {
  return [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];
}

export async function listTemplates(): Promise<CloudTemplate[]> {
  const { user, tablesDB, databaseId, tableId } = await requireTable("templates");
  const result = await tablesDB.listRows({
    databaseId, tableId,
    queries: [Query.equal("ownerId", user.$id), Query.orderDesc("$createdAt"), Query.limit(100)],
  });
  return result.rows.map((value) => {
    const row = value as unknown as { $id: string; title: string; category: string; content: string };
    return { id: row.$id, title: row.title, category: row.category, content: row.content };
  });
}

export async function saveTemplate(input: Omit<CloudTemplate, "id">, id?: string): Promise<CloudTemplate> {
  const { user, tablesDB, databaseId, tableId } = await requireTable("templates");
  const row = id
    ? await tablesDB.updateRow({ databaseId, tableId, rowId: id, data: input })
    : await tablesDB.createRow({ databaseId, tableId, rowId: ID.unique(), data: { ownerId: user.$id, ...input }, permissions: rowPermissions(user.$id) });
  const saved = row as unknown as { $id: string; title: string; category: string; content: string };
  return { id: saved.$id, title: saved.title, category: saved.category, content: saved.content };
}

export async function deleteTemplate(id: string): Promise<void> {
  const { tablesDB, databaseId, tableId } = await requireTable("templates");
  await tablesDB.deleteRow({ databaseId, tableId, rowId: id });
}

export async function listContacts(): Promise<CloudContact[]> {
  const { user, tablesDB, databaseId, tableId } = await requireTable("contacts");
  const result = await tablesDB.listRows({
    databaseId, tableId,
    queries: [Query.equal("ownerId", user.$id), Query.orderDesc("$createdAt"), Query.limit(100)],
  });
  return result.rows.map((value) => {
    const row = value as unknown as { $id: string; name: string; email?: string; phone?: string; organization?: string };
    return { id: row.$id, name: row.name, email: row.email ?? "", phone: row.phone ?? "", organization: row.organization ?? "" };
  });
}

export async function saveContact(input: Omit<CloudContact, "id">, id?: string): Promise<CloudContact> {
  const { user, tablesDB, databaseId, tableId } = await requireTable("contacts");
  const data = {
    name: input.name.trim(),
    email: input.email.trim() || undefined,
    phone: input.phone.trim() || undefined,
    organization: input.organization.trim() || undefined,
  };
  const row = id
    ? await tablesDB.updateRow({ databaseId, tableId, rowId: id, data })
    : await tablesDB.createRow({ databaseId, tableId, rowId: ID.unique(), data: { ownerId: user.$id, ...data }, permissions: rowPermissions(user.$id) });
  const saved = row as unknown as { $id: string; name: string; email?: string; phone?: string; organization?: string };
  return { id: saved.$id, name: saved.name, email: saved.email ?? "", phone: saved.phone ?? "", organization: saved.organization ?? "" };
}

export async function deleteContact(id: string): Promise<void> {
  const { tablesDB, databaseId, tableId } = await requireTable("contacts");
  await tablesDB.deleteRow({ databaseId, tableId, rowId: id });
}


export type CloudAttachment = {
  id: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

async function requireAttachmentServices() {
  const { user } = await requireTable("attachments");
  if (!storage || !appwriteResources.attachmentsBucketId) {
    throw new Error("إعدادات مخزن المرفقات غير مكتملة.");
  }
  return {
    user,
    storage,
    tablesDB: tablesDB!,
    databaseId: appwriteResources.databaseId,
    tableId: appwriteResources.tables.attachments,
    bucketId: appwriteResources.attachmentsBucketId,
  };
}

export async function listAttachments(documentId: string): Promise<CloudAttachment[]> {
  const { user, tablesDB, databaseId, tableId } = await requireAttachmentServices();
  const result = await tablesDB.listRows({
    databaseId, tableId,
    queries: [Query.equal("ownerId", user.$id), Query.equal("documentId", documentId), Query.orderDesc("createdAt"), Query.limit(100)],
  });
  return result.rows.map((value) => {
    const row = value as unknown as { $id: string; fileId: string; fileName: string; mimeType: string; size: number; createdAt: string };
    return { id: row.$id, fileId: row.fileId, fileName: row.fileName, mimeType: row.mimeType, size: row.size, createdAt: row.createdAt };
  });
}

export async function uploadAttachment(documentId: string, file: File): Promise<CloudAttachment> {
  const { user, storage, tablesDB, databaseId, tableId, bucketId } = await requireAttachmentServices();
  const allowed = ["pdf", "png", "jpg", "jpeg", "webp", "doc", "docx"];
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowed.includes(extension)) throw new Error("نوع الملف غير مسموح. الأنواع المدعومة: PDF وWord والصور.");
  if (file.size > 10 * 1024 * 1024) throw new Error("حجم الملف يتجاوز الحد الأقصى وهو 10 ميغابايت.");
  const fileId = ID.unique();
  const filePermissions = rowPermissions(user.$id);
  await storage.createFile({ bucketId, fileId, file, permissions: filePermissions });
  try {
    const createdAt = new Date().toISOString();
    const row = await tablesDB.createRow({
      databaseId, tableId, rowId: ID.unique(),
      data: {
        ownerId: user.$id,
        documentId,
        fileId,
        fileName: file.name.slice(0, 256),
        mimeType: (file.type || "application/octet-stream").slice(0, 128),
        size: file.size,
        createdAt,
      },
      permissions: filePermissions,
    });
    const metadata = row as unknown as { $id: string };
    return { id: metadata.$id, fileId, fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, createdAt };
  } catch (error) {
    await storage.deleteFile({ bucketId, fileId }).catch(() => undefined);
    throw error;
  }
}

export async function getAttachmentDownloadUrl(fileId: string): Promise<string> {
  const { storage, bucketId } = await requireAttachmentServices();
  return storage.getFileDownload({ bucketId, fileId }).toString();
}

export async function deleteAttachment(attachmentId: string, fileId: string): Promise<void> {
  const { storage, tablesDB, databaseId, tableId, bucketId } = await requireAttachmentServices();
  await storage.deleteFile({ bucketId, fileId });
  await tablesDB.deleteRow({ databaseId, tableId, rowId: attachmentId });
}
