import { ID, Permission, Query, Role } from "appwrite";
import { account, appwriteResources, tablesDB } from "./appwrite";

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
    queries: [Query.equal("ownerId", user.$id), Query.orderDesc("$updatedAt"), Query.limit(100)],
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
