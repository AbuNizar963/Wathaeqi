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

  it("keeps legacy profile fields nullable and application records available", () => {
    const users = findSchemaTable("users");
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
    expect(records?.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "payload", type: "longtext" }),
      ])
    );
  });

  it("stores keyed application records", () => {
    const records = findSchemaTable("app_records");

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
    expect(records?.indexes.map(index => index.key)).toContain(
      "record_type_key"
    );
  });

  it("does not provision removed audit/version history and preserves rate-limit receipts", () => {
    expect(findSchemaTable("audit_logs")).toBeUndefined();
    expect(findSchemaTable("telegram_versions")).toBeUndefined();
    expect(REQUIRED_TABLE_IDS).not.toContain("audit_logs");
    expect(REQUIRED_TABLE_IDS).not.toContain("telegram_versions");
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

  it("declares backward-compatible typography columns for document settings", () => {
    const settings = findSchemaTable("platform_document_settings");
    const columns = settings?.columns ?? [];

    expect(columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "documentFontFamily",
          type: "string",
          required: false,
          default: "Cairo",
        }),
        expect.objectContaining({
          key: "documentFontSizePt",
          type: "integer",
          min: 9,
          max: 24,
          required: false,
          default: 12,
        }),
        expect.objectContaining({
          key: "recipientFontWeight",
          type: "integer",
          required: false,
          default: 600,
        }),
        expect.objectContaining({
          key: "recipientFontColor",
          type: "string",
          required: false,
          default: "#0f172a",
        }),
      ])
    );
  });

  it("does not duplicate table identifiers in the provisioned schema", () => {
    const ids = appwriteSchema.map(table => table.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("allows the 60px logo size and stores compact frame preset ids", () => {
    const settings = findSchemaTable("platform_document_settings");

    expect(settings?.columns).toContainEqual(
      expect.objectContaining({ key: "headerLogoSize", min: 60, max: 240 })
    );
    expect(settings?.columns).toContainEqual(
      expect.objectContaining({ key: "frameStyle", type: "varchar", size: 16, default: "box" })
    );
  });

  it("matches the live document settings column types and constraints", () => {
    const settings = findSchemaTable("platform_document_settings");
    const columns = settings?.columns ?? [];

    expect(columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "watermarkOpacityPercent",
          type: "integer",
          min: 0,
          max: 60,
          default: 12,
        }),
        expect.objectContaining({
          key: "headerDividerStyle",
          type: "varchar",
          size: 32,
        }),
        expect.objectContaining({
          key: "headerDividerWidthPt",
          type: "double",
          min: 0.5,
          max: 6,
          default: 2.25,
        }),
        expect.objectContaining({
          key: "frameColor",
          type: "varchar",
          size: 7,
          default: "#000000",
        }),
        expect.objectContaining({
          key: "frameWidthPt",
          type: "double",
          min: 0.5,
          max: 4,
          default: 1,
        }),
        expect.objectContaining({
          key: "pageHeaderRows",
          type: "text",
          default: undefined,
        }),
        expect.objectContaining({
          key: "pageFooterRows",
          type: "text",
          default: undefined,
        }),
      ])
    );
  });
});
