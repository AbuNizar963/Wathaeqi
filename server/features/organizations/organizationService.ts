import { randomUUID } from "node:crypto";
import { Query } from "node-appwrite";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";
import { getStorageProvider } from "../../_core/storageProvider";
import { ORGANIZATIONS_TABLE } from "../../../shared/appwriteSchema";

export type OrganizationRecord = {
  id: string;
  name: string;
  code: string;
  type: string;
  parentOrganizationId: string | null;
  telegramDestinationOrganizationId: string | null;
  logoKey: string | null;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationTreeNode = OrganizationRecord & {
  depth: number;
  path: string;
  children: OrganizationTreeNode[];
};

type AppwriteRow = Record<string, unknown> & { $id: string };

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function errorCode(error: unknown): number {
  return error && typeof error === "object" && "code" in error
    ? Number((error as { code?: unknown }).code)
    : 0;
}

export function mapOrganizationRow(row: AppwriteRow): OrganizationRecord {
  return {
    id: asString(row.id),
    name: asString(row.name, "جهة بدون اسم"),
    code: asString(row.code),
    type: asString(row.type, "department"),
    parentOrganizationId: asNullableString(row.parentOrganizationId),
    telegramDestinationOrganizationId: asNullableString(
      row.telegramDestinationOrganizationId
    ),
    logoKey: asNullableString(row.logoKey),
    isActive: row.isActive !== false,
    deletedAt: asIso(row.deletedAt),
    createdAt: asIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: asIso(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

export async function listOrganizations(
  includeInactive = true
): Promise<OrganizationRecord[]> {
  const queries = [Query.orderAsc("name"), Query.limit(500)];
  if (!includeInactive) queries.unshift(Query.equal("isActive", true));
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: ORGANIZATIONS_TABLE,
    queries,
    total: false,
  });
  return (result.rows as AppwriteRow[]).map(mapOrganizationRow);
}

export async function getOrganization(
  organizationId: string
): Promise<OrganizationRecord | null> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: ORGANIZATIONS_TABLE,
    queries: [Query.equal("id", organizationId), Query.limit(2)],
    total: false,
  });
  const rows = result.rows as AppwriteRow[];
  if (rows.length > 1) {
    throw new Error("Appwrite returned duplicate organization IDs");
  }
  return rows[0] ? mapOrganizationRow(rows[0]) : null;
}

async function getOrganizationRowId(
  organizationId: string
): Promise<AppwriteRow | null> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId: ORGANIZATIONS_TABLE,
    queries: [Query.equal("id", organizationId), Query.limit(2)],
    total: false,
  });
  const rows = result.rows as AppwriteRow[];
  if (rows.length > 1) {
    throw new Error("Appwrite returned duplicate organization IDs");
  }
  return rows[0] ?? null;
}

/** Returns the organization plus every descendant in breadth-first order. */
export async function listOrganizationDescendants(
  rootId: string,
  options: { activeOnly?: boolean } = {}
): Promise<OrganizationRecord[]> {
  const organizations = await listOrganizations(true);
  const byParent = new Map<string, OrganizationRecord[]>();
  for (const organization of organizations) {
    if (!organization.parentOrganizationId) continue;
    const siblings = byParent.get(organization.parentOrganizationId) ?? [];
    siblings.push(organization);
    byParent.set(organization.parentOrganizationId, siblings);
  }

  const descendants: OrganizationRecord[] = [];
  const queue = [...(byParent.get(rootId) ?? [])];
  const visited = new Set<string>([rootId]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);
    if (!options.activeOnly || current.isActive) descendants.push(current);
    queue.push(...(byParent.get(current.id) ?? []));
  }
  return descendants;
}

export async function listOrganizationAncestors(
  organizationId: string
): Promise<OrganizationRecord[]> {
  const organizations = await listOrganizations(true);
  const byId = new Map(organizations.map(item => [item.id, item]));
  const ancestors: OrganizationRecord[] = [];
  const visited = new Set<string>([organizationId]);
  let current = byId.get(organizationId)?.parentOrganizationId ?? null;
  while (current && !visited.has(current)) {
    visited.add(current);
    const parent = byId.get(current);
    if (!parent) break;
    ancestors.push(parent);
    current = parent.parentOrganizationId;
  }
  return ancestors;
}

export function buildOrganizationTree(
  organizations: readonly OrganizationRecord[]
): OrganizationTreeNode[] {
  const nodes = new Map<string, OrganizationTreeNode>();
  for (const organization of organizations) {
    nodes.set(organization.id, {
      ...organization,
      depth: 0,
      path: organization.name,
      children: [],
    });
  }
  const roots: OrganizationTreeNode[] = [];
  for (const organization of organizations) {
    const node = nodes.get(organization.id);
    if (!node) continue;
    const parent = organization.parentOrganizationId
      ? nodes.get(organization.parentOrganizationId)
      : undefined;
    if (parent && parent !== node) {
      node.depth = parent.depth + 1;
      node.path = `${parent.path} / ${organization.name}`;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Recompute depth/path in case the source order placed a child before its parent.
  const walk = (node: OrganizationTreeNode, depth: number, prefix: string) => {
    node.depth = depth;
    node.path = prefix ? `${prefix} / ${node.name}` : node.name;
    for (const child of node.children) walk(child, depth + 1, node.path);
  };
  for (const root of roots) walk(root, 0, "");
  return roots;
}

export function flattenOrganizationTree(
  roots: readonly OrganizationTreeNode[]
): OrganizationTreeNode[] {
  const flat: OrganizationTreeNode[] = [];
  const walk = (node: OrganizationTreeNode) => {
    flat.push(node);
    for (const child of node.children) walk(child);
  };
  for (const root of roots) walk(root);
  return flat;
}

/** Directory used to display routing paths in the composer and details. */
export async function getRoutingDirectory(): Promise<
  Array<OrganizationRecord & { path: string; depth: number }>
> {
  const organizations = await listOrganizations(false);
  const tree = buildOrganizationTree(organizations);
  return flattenOrganizationTree(tree).map(node => ({
    id: node.id,
    name: node.name,
    code: node.code,
    type: node.type,
    parentOrganizationId: node.parentOrganizationId,
    telegramDestinationOrganizationId: node.telegramDestinationOrganizationId,
    logoKey: node.logoKey,
    isActive: node.isActive,
    deletedAt: node.deletedAt,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    path: node.path,
    depth: node.depth,
  }));
}

/**
 * Routing targets allowed for an organization: itself, its parent, its
 * siblings, its descendants and the configured routing destination.
 */
export async function listRoutingTargets(
  organizationId: string
): Promise<OrganizationRecord[]> {
  const organizations = await listOrganizations(false);
  const byId = new Map(organizations.map(item => [item.id, item]));
  const current = byId.get(organizationId);
  if (!current) return [];

  const allowed = new Map<string, OrganizationRecord>();
  const add = (organization: OrganizationRecord | undefined) => {
    if (organization?.isActive) allowed.set(organization.id, organization);
  };

  add(current);
  const parent = current.parentOrganizationId
    ? byId.get(current.parentOrganizationId)
    : undefined;
  add(parent);
  if (parent) {
    for (const sibling of organizations) {
      if (sibling.parentOrganizationId === parent.id) add(sibling);
    }
  }
  for (const descendant of await listOrganizationDescendants(organizationId, {
    activeOnly: true,
  })) {
    add(descendant);
  }
  if (current.telegramDestinationOrganizationId) {
    add(byId.get(current.telegramDestinationOrganizationId));
  }
  allowed.delete(organizationId);
  return [...allowed.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "ar")
  );
}

export type OrganizationWriteInput = {
  name: string;
  code: string;
  type: string;
  parentOrganizationId: string | null;
  /** Legacy routing column kept for existing Appwrite rows; not API input. */
  telegramDestinationOrganizationId?: string | null;
};

function validateParentChoice(
  organizationId: string | null,
  parent: OrganizationRecord | null
): void {
  if (!parent) return;
  if (organizationId && parent.id === organizationId) {
    throw new Error("لا يمكن جعل الجهة تابعة لنفسها");
  }
}

export async function createOrganization(
  input: OrganizationWriteInput
): Promise<OrganizationRecord> {
  const code = input.code.trim().toUpperCase();
  const organizations = await listOrganizations(true);
  if (organizations.some(item => item.code.toUpperCase() === code)) {
    throw new Error("رمز الجهة مستخدم مسبقاً");
  }
  const parent = input.parentOrganizationId
    ? await getOrganization(input.parentOrganizationId)
    : null;
  if (input.parentOrganizationId && !parent) {
    throw new Error("الجهة الأم غير موجودة");
  }
  validateParentChoice(null, parent);
  if (
    input.telegramDestinationOrganizationId &&
    !(await getOrganization(input.telegramDestinationOrganizationId))
  ) {
    throw new Error("جهة الإحالة المحددة غير موجودة");
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  const created = await getAppwriteTablesDB().createRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: ORGANIZATIONS_TABLE,
    rowId: randomUUID(),
    data: {
      id,
      name: input.name.trim(),
      code,
      type: input.type,
      parentOrganizationId: input.parentOrganizationId,
      telegramDestinationOrganizationId:
        input.telegramDestinationOrganizationId ?? null,
      logoKey: null,
      isActive: true,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  });
  return mapOrganizationRow(created as AppwriteRow);
}

export async function updateOrganization(
  organizationId: string,
  input: OrganizationWriteInput
): Promise<OrganizationRecord> {
  const row = await getOrganizationRowId(organizationId);
  if (!row) throw new Error("الجهة غير موجودة");
  const current = mapOrganizationRow(row);
  const code = input.code.trim().toUpperCase();
  const organizations = await listOrganizations(true);
  if (
    organizations.some(
      item => item.id !== organizationId && item.code.toUpperCase() === code
    )
  ) {
    throw new Error("رمز الجهة مستخدم مسبقاً");
  }

  const parent = input.parentOrganizationId
    ? await getOrganization(input.parentOrganizationId)
    : null;
  if (input.parentOrganizationId && !parent) {
    throw new Error("الجهة الأم غير موجودة");
  }
  validateParentChoice(organizationId, parent);
  if (parent) {
    const ancestors = await listOrganizationAncestors(parent.id);
    if (ancestors.some(item => item.id === organizationId)) {
      throw new Error("لا يمكن إنشاء حلقة في شجرة الجهات");
    }
  }
  if (
    input.telegramDestinationOrganizationId &&
    !(await getOrganization(input.telegramDestinationOrganizationId))
  ) {
    throw new Error("جهة الإحالة المحددة غير موجودة");
  }

  const updated = await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: ORGANIZATIONS_TABLE,
    rowId: row.$id,
    data: {
      name: input.name.trim(),
      code,
      type: input.type,
      parentOrganizationId: input.parentOrganizationId,
      ...(input.telegramDestinationOrganizationId === undefined
        ? {}
        : {
            telegramDestinationOrganizationId:
              input.telegramDestinationOrganizationId,
          }),
      updatedAt: new Date().toISOString(),
    },
  });
  return { ...current, ...mapOrganizationRow(updated as AppwriteRow) };
}

export async function setOrganizationActive(
  organizationId: string,
  isActive: boolean
): Promise<void> {
  const row = await getOrganizationRowId(organizationId);
  if (!row) throw new Error("الجهة غير موجودة");
  const now = new Date().toISOString();
  await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: ORGANIZATIONS_TABLE,
    rowId: row.$id,
    data: {
      isActive,
      deletedAt: isActive ? null : now,
      updatedAt: now,
    },
  });
}

export type OrganizationLogoSaveStage =
  "organization_lookup" | "storage_upload" | "organization_update";

export async function saveOrganizationLogo(
  organizationId: string,
  bytes: Buffer,
  contentType: "image/png" | "image/jpeg",
  onStage?: (stage: OrganizationLogoSaveStage) => void
): Promise<string> {
  onStage?.("organization_lookup");
  const row = await getOrganizationRowId(organizationId);
  if (!row) throw new Error("الجهة غير موجودة");
  const extension = contentType === "image/png" ? "png" : "jpg";
  const logoKey = `organizations/${organizationId}/logo-${Date.now()}.${extension}`;
  onStage?.("storage_upload");
  await getStorageProvider().upload(logoKey, bytes, {
    contentType,
    cacheControl: "private, max-age=300",
  });
  onStage?.("organization_update");
  await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: ORGANIZATIONS_TABLE,
    rowId: row.$id,
    data: { logoKey, updatedAt: new Date().toISOString() },
  });
  return logoKey;
}

export async function getOrganizationLogoUrl(
  organizationId: string
): Promise<string | null> {
  const organization = await getOrganization(organizationId);
  if (!organization?.logoKey) return null;
  try {
    return await getStorageProvider().createSignedUrl(
      organization.logoKey,
      300
    );
  } catch (error) {
    if (errorCode(error) === 404) return null;
    throw error;
  }
}

export async function getOrganizationLogoDataUrl(
  organizationId: string
): Promise<string | null> {
  const organization = await getOrganization(organizationId);
  if (!organization?.logoKey) return null;
  try {
    const file = await getStorageProvider().download(organization.logoKey);
    const contentType = file.contentType || "image/png";
    return `data:${contentType};base64,${file.body.toString("base64")}`;
  } catch (error) {
    if (errorCode(error) === 404) return null;
    throw error;
  }
}
