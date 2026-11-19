import { Query } from "node-appwrite";
import type {
  Organization,
  OrganizationMembership,
} from "../../../drizzle/schema";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";
import { getAppwriteProfileById } from "../../_core/appwriteAuth";

type AppwriteOrganizationRow = Record<string, unknown> & {
  $id: string;
  data?: Record<string, unknown>;
};

function rowData(row: AppwriteOrganizationRow): Record<string, unknown> {
  return row.data ?? row;
}

function mapOrganization(row: Record<string, unknown>): Organization {
  return {
    ...(row as unknown as Organization),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
    deletedAt: row.deletedAt ? new Date(String(row.deletedAt)) : null,
  };
}

function mapMembership(row: Record<string, unknown>): OrganizationMembership {
  return {
    ...(row as unknown as OrganizationMembership),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  };
}

async function listOrganizationRows(
  tableId: string,
  queries: string[]
): Promise<AppwriteOrganizationRow[]> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId,
    queries: [...queries, Query.limit(100)],
    total: false,
  });
  return result.rows as AppwriteOrganizationRow[];
}

/**
 * Minimal Appwrite-only organization reads used by the owner API.
 * This module deliberately has no dependency on the retired organization
 * service or the general database facade.
 */
export async function getOrganizationById(
  organizationId: string
): Promise<Organization | null> {
  const rows = await listOrganizationRows("organizations", [
    Query.equal("id", organizationId),
    Query.equal("isActive", true),
  ]);
  if (rows.length > 1) {
    throw new Error("Appwrite returned duplicate organization IDs");
  }
  return rows[0] ? mapOrganization(rowData(rows[0])) : null;
}

export async function getUserOrganizationMembership(
  userId: number
): Promise<OrganizationMembership | null> {
  const profile = await getAppwriteProfileById(userId);
  if (!profile) return null;

  const rows = await listOrganizationRows("organization_memberships", [
    Query.equal("userId", userId),
    Query.equal("isActive", true),
    Query.orderAsc("createdAt"),
  ]);
  const memberships = rows.map(rowData);
  const homeOrganizationId = profile.user.organizationId;
  const membership = homeOrganizationId
    ? memberships.find(row => row.organizationId === homeOrganizationId)
    : memberships[0];

  if (!membership || typeof membership.organizationId !== "string") {
    return null;
  }

  const organization = await getOrganizationById(membership.organizationId);
  if (!organization) return null;

  const {
    organization: _organization,
    user: _user,
    ...membershipData
  } = membership;
  return mapMembership(membershipData);
}
