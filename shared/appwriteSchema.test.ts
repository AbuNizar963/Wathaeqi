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

  it("does not duplicate table identifiers in the provisioned schema", () => {
    const ids = appwriteSchema.map(table => table.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
