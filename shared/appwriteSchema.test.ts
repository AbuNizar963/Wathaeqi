import { describe, expect, it } from "vitest";
import {
  appwriteSchema,
  findSchemaTable,
  REQUIRED_TABLE_IDS,
} from "./appwriteSchema";

describe("Appwrite operational schema", () => {
  it.each([
    "organizations",
    "users",
    "organization_memberships",
    "audit_logs",
    "app_records",
    "auth_login_rate_limits",
    "audit_purge_receipts",
    "user_purge_receipts",
  ])("declares the %s table used by the server", tableId => {
    expect(findSchemaTable(tableId)).toBeDefined();
    expect(REQUIRED_TABLE_IDS).toContain(tableId);
  });

  it("keeps identity and membership lookup keys unique", () => {
    const users = findSchemaTable("users");
    const memberships = findSchemaTable("organization_memberships");

    expect(users?.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "unique",
          columns: ["id"],
        }),
        expect.objectContaining({
          type: "unique",
          columns: ["authUserId"],
        }),
        expect.objectContaining({
          type: "unique",
          columns: ["username"],
        }),
      ])
    );
    expect(memberships?.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "unique",
          columns: ["organizationId", "userId"],
        }),
      ])
    );
  });

  it("contains the profile fields required by Appwrite authentication", () => {
    const users = findSchemaTable("users");
    const keys = users?.columns.map(column => column.key) ?? [];

    expect(keys).toEqual(
      expect.arrayContaining([
        "id",
        "authUserId",
        "sessionVersion",
        "organizationId",
        "username",
        "email",
        "loginMethod",
        "isActive",
        "isPlatformOwner",
        "mustChangePassword",
        "role",
        "lastSignedIn",
      ])
    );
  });

  it("keeps legacy profile fields nullable and preserves large audit payloads", () => {
    const users = findSchemaTable("users");
    const audit = findSchemaTable("audit_logs");
    const records = findSchemaTable("app_records");

    expect(users?.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "username", required: false }),
        expect.objectContaining({ key: "email", required: false }),
        expect.objectContaining({
          key: "passwordHashCiphertext",
          required: false,
          size: 512,
        }),
      ])
    );
    expect(audit?.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "metadata", type: "longtext" }),
        expect.objectContaining({ key: "beforeState", type: "longtext" }),
        expect.objectContaining({ key: "afterState", type: "longtext" }),
      ])
    );
    expect(records?.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "payload", type: "longtext" }),
      ])
    );
  });

  it("stores the audit hash chain and keyed application records", () => {
    const audit = findSchemaTable("audit_logs");
    const records = findSchemaTable("app_records");

    expect(audit?.columns.map(column => column.key)).toEqual(
      expect.arrayContaining([
        "actorUserId",
        "organizationId",
        "previousHash",
        "entryHash",
        "createdAt",
      ])
    );
    expect(records?.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "unique",
          columns: ["recordType", "recordKey"],
        }),
      ])
    );
  });

  it("reuses live index keys and adds only missing uniqueness", () => {
    const users = findSchemaTable("users");
    const memberships = findSchemaTable("organization_memberships");
    const audit = findSchemaTable("audit_logs");
    const records = findSchemaTable("app_records");

    expect(users?.indexes.map(index => index.key)).toEqual(
      expect.arrayContaining([
        "users_id_unique",
        "users_auth_user_unique",
        "users_organization_idx",
        "users_username_unique",
      ])
    );
    expect(memberships?.indexes.map(index => index.key)).toEqual(
      expect.arrayContaining([
        "org_membership_id_unique",
        "org_user_unique",
        "org_memberships_user_idx",
      ])
    );
    expect(audit?.indexes.map(index => index.key)).toEqual(
      expect.arrayContaining([
        "audit_logs_id_unique",
        "audit_logs_entry_hash_unique",
        "audit_actor_created_idx",
        "audit_org_created_idx",
      ])
    );
    expect(records?.indexes.map(index => index.key)).toContain(
      "record_type_key"
    );
  });

  it("preserves rate-limit and purge receipt records", () => {
    const rateLimits = findSchemaTable("auth_login_rate_limits");
    const auditReceipts = findSchemaTable("audit_purge_receipts");
    const userReceipts = findSchemaTable("user_purge_receipts");

    expect(rateLimits?.columns.map(column => column.key)).toEqual(
      expect.arrayContaining([
        "keyHash",
        "windowStartedAt",
        "attempts",
        "blockedUntil",
        "updatedAt",
      ])
    );
    expect(rateLimits?.columns).toContainEqual(
      expect.objectContaining({
        key: "keyHash",
        type: "varchar",
        size: 64,
        required: true,
      })
    );
    expect(rateLimits?.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "unique",
          columns: ["keyHash"],
        }),
        expect.objectContaining({
          type: "key",
          columns: ["updatedAt"],
        }),
      ])
    );

    for (const receipts of [auditReceipts, userReceipts]) {
      expect(receipts?.columns.map(column => column.key)).toEqual(
        expect.arrayContaining([
          "id",
          "ownerUserId",
          "reason",
          "deletedCounts",
          "createdAt",
        ])
      );
      expect(receipts?.indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "unique",
            columns: ["id"],
          }),
        ])
      );
    }
  });

  it("does not duplicate table identifiers in the provisioned schema", () => {
    const ids = appwriteSchema.map(table => table.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
