/**
 * Declarative Appwrite TablesDB schema for the operational telegram workspace.
 *
 * The schema is applied with `pnpm appwrite:schema:apply` (idempotent) and
 * verified with `pnpm appwrite:schema:check`. The provisioner only creates
 * missing tables, columns and indexes: it never drops, renames or rewrites
 * existing data.
 */

export type SchemaColumnType =
  "varchar" | "text" | "integer" | "boolean" | "datetime";

export type SchemaColumn = {
  key: string;
  type: SchemaColumnType;
  required: boolean;
  /** Varchar length; ignored for other types. */
  size?: number;
  /** Default value applied to new rows. */
  default?: string | number | boolean | null;
  description?: string;
};

export type SchemaIndex = {
  key: string;
  type: "key" | "unique" | "fulltext";
  columns: string[];
  orders?: Array<"ASC" | "DESC">;
};

export type SchemaTable = {
  id: string;
  name: string;
  description: string;
  columns: SchemaColumn[];
  indexes: SchemaIndex[];
};

const ID_COLUMN: SchemaColumn = {
  key: "id",
  type: "integer",
  required: true,
  description: "Application identifier mirrored from the numeric legacy model",
};

const CREATED_AT: SchemaColumn = {
  key: "createdAt",
  type: "datetime",
  required: true,
};

const UPDATED_AT: SchemaColumn = {
  key: "updatedAt",
  type: "datetime",
  required: true,
};

export const TELEGRAMS_TABLE = "telegrams";
export const TELEGRAM_VERSIONS_TABLE = "telegram_versions";
export const TELEGRAM_ACTIONS_TABLE = "telegram_actions";
export const TELEGRAM_ATTACHMENTS_TABLE = "telegram_attachments";
export const TELEGRAM_ROUTES_TABLE = "telegram_routes";
export const DEPARTMENT_SETTINGS_TABLE = "department_settings";
export const NOTIFICATIONS_TABLE = "notifications";
export const MOBILE_PUSH_TOKENS_TABLE = "mobile_push_tokens";
export const ORGANIZATIONS_TABLE = "organizations";
export const CONTACTS_TABLE = "contacts";
export const COUNTERS_TABLE = "counters";
export const USERS_TABLE = "users";
export const ORGANIZATION_MEMBERSHIPS_TABLE = "organization_memberships";
export const AUDIT_LOGS_TABLE = "audit_logs";
export const APP_RECORDS_TABLE = "app_records";
export const PUSH_SUBSCRIPTIONS_TABLE = "push_subscriptions";

export const appwriteSchema: SchemaTable[] = [
  {
    id: TELEGRAMS_TABLE,
    name: "Telegrams",
    description: "Official telegrams with their workflow state and numbering.",
    columns: [
      ID_COLUMN,
      { key: "serialNumber", type: "integer", required: true },
      { key: "serialCode", type: "varchar", size: 48, required: true },
      { key: "organizationSerialNumber", type: "integer", required: false },
      {
        key: "organizationSerialCode",
        type: "varchar",
        size: 48,
        required: false,
      },
      { key: "originalSerial", type: "varchar", size: 120, required: false },
      { key: "verificationToken", type: "varchar", size: 64, required: true },
      { key: "telegramDate", type: "datetime", required: false },
      { key: "createdByUserId", type: "integer", required: true },
      { key: "organizationId", type: "varchar", size: 36, required: true },
      {
        key: "currentOrganizationId",
        type: "varchar",
        size: 36,
        required: true,
      },
      { key: "subject", type: "varchar", size: 255, required: true },
      { key: "recipient", type: "varchar", size: 255, required: true },
      { key: "body", type: "text", required: true },
      { key: "classification", type: "varchar", size: 16, required: true },
      { key: "priority", type: "varchar", size: 16, required: true },
      { key: "category", type: "varchar", size: 32, required: true },
      { key: "status", type: "varchar", size: 24, required: true },
      { key: "workflowReason", type: "text", required: false },
      { key: "importNotes", type: "text", required: false },
      { key: "importDirection", type: "varchar", size: 8, required: false },
      { key: "attachmentManifest", type: "text", required: false },
      { key: "gpsLatitude", type: "varchar", size: 40, required: false },
      { key: "gpsLongitude", type: "varchar", size: 40, required: false },
      { key: "creatorName", type: "varchar", size: 255, required: true },
      { key: "creatorEmail", type: "varchar", size: 320, required: false },
      { key: "creatorBadgeId", type: "varchar", size: 80, required: false },
      { key: "creatorIp", type: "varchar", size: 80, required: false },
      {
        key: "creatorFingerprint",
        type: "varchar",
        size: 128,
        required: false,
      },
      { key: "idempotencyKey", type: "varchar", size: 120, required: false },
      { key: "revision", type: "integer", required: true, default: 1 },
      { key: "archivedAt", type: "datetime", required: false },
      { key: "closedAt", type: "datetime", required: false },
      CREATED_AT,
      UPDATED_AT,
    ],
    indexes: [
      { key: "telegrams_id_unique", type: "unique", columns: ["id"] },
      {
        key: "telegrams_serial_code_unique",
        type: "unique",
        columns: ["serialCode"],
      },
      {
        key: "telegrams_verification_unique",
        type: "unique",
        columns: ["verificationToken"],
      },
      {
        key: "telegrams_org_created",
        type: "key",
        columns: ["organizationId", "createdAt"],
        orders: ["ASC", "DESC"],
      },
      {
        key: "telegrams_current_org_created",
        type: "key",
        columns: ["currentOrganizationId", "createdAt"],
        orders: ["ASC", "DESC"],
      },
      {
        key: "telegrams_status_created",
        type: "key",
        columns: ["status", "createdAt"],
        orders: ["ASC", "DESC"],
      },
      {
        key: "telegrams_idempotency",
        type: "key",
        columns: ["idempotencyKey"],
      },
      {
        key: "telegrams_subject_search",
        type: "fulltext",
        columns: ["subject"],
      },
    ],
  },
  {
    id: TELEGRAM_VERSIONS_TABLE,
    name: "Telegram versions",
    description: "Immutable snapshots for every content revision.",
    columns: [
      ID_COLUMN,
      { key: "telegramId", type: "integer", required: true },
      { key: "versionNumber", type: "integer", required: true },
      { key: "changedByUserId", type: "integer", required: true },
      { key: "changeReason", type: "text", required: true },
      { key: "snapshot", type: "text", required: true },
      CREATED_AT,
    ],
    indexes: [
      {
        key: "telegram_versions_unique",
        type: "unique",
        columns: ["telegramId", "versionNumber"],
      },
      {
        key: "telegram_versions_telegram",
        type: "key",
        columns: ["telegramId", "createdAt"],
        orders: ["ASC", "DESC"],
      },
    ],
  },
  {
    id: TELEGRAM_ACTIONS_TABLE,
    name: "Telegram actions",
    description: "Workflow audit trail scoped to a single telegram.",
    columns: [
      ID_COLUMN,
      { key: "telegramId", type: "integer", required: true },
      { key: "actorUserId", type: "integer", required: true },
      { key: "action", type: "varchar", size: 80, required: true },
      { key: "fromStatus", type: "varchar", size: 24, required: false },
      { key: "toStatus", type: "varchar", size: 24, required: false },
      { key: "reason", type: "text", required: false },
      { key: "metadata", type: "text", required: false },
      CREATED_AT,
    ],
    indexes: [
      {
        key: "telegram_actions_telegram",
        type: "key",
        columns: ["telegramId", "createdAt"],
        orders: ["ASC", "DESC"],
      },
      {
        key: "telegram_actions_actor",
        type: "key",
        columns: ["actorUserId", "createdAt"],
        orders: ["ASC", "DESC"],
      },
    ],
  },
  {
    id: TELEGRAM_ATTACHMENTS_TABLE,
    name: "Telegram attachments",
    description: "Metadata for files stored in the private Appwrite bucket.",
    columns: [
      ID_COLUMN,
      { key: "telegramId", type: "integer", required: true },
      { key: "storageKey", type: "varchar", size: 255, required: true },
      {
        key: "storageOrganizationId",
        type: "varchar",
        size: 36,
        required: false,
      },
      { key: "originalName", type: "varchar", size: 180, required: true },
      { key: "mimeType", type: "varchar", size: 120, required: true },
      { key: "sizeBytes", type: "integer", required: true },
      { key: "sha256", type: "varchar", size: 64, required: true },
      { key: "uploadedByUserId", type: "integer", required: true },
      { key: "scanStatus", type: "varchar", size: 32, required: true },
      CREATED_AT,
    ],
    indexes: [
      {
        key: "telegram_attachments_telegram",
        type: "key",
        columns: ["telegramId", "createdAt"],
        orders: ["ASC", "DESC"],
      },
      {
        key: "telegram_attachments_storage_unique",
        type: "unique",
        columns: ["storageKey"],
      },
    ],
  },
  {
    id: TELEGRAM_ROUTES_TABLE,
    name: "Telegram routes",
    description: "Inter-organization routing and receiver decisions.",
    columns: [
      ID_COLUMN,
      { key: "telegramId", type: "integer", required: true },
      { key: "fromOrganizationId", type: "varchar", size: 36, required: true },
      { key: "toOrganizationId", type: "varchar", size: 36, required: true },
      { key: "forwardedByUserId", type: "integer", required: true },
      { key: "status", type: "varchar", size: 24, required: true },
      { key: "approvalStatus", type: "varchar", size: 24, required: true },
      { key: "approvedByUserId", type: "integer", required: false },
      { key: "approvedAt", type: "datetime", required: false },
      { key: "approvalReason", type: "text", required: false },
      {
        key: "receiverDecisionStatus",
        type: "varchar",
        size: 24,
        required: true,
      },
      { key: "receiverDecisionByUserId", type: "integer", required: false },
      { key: "receiverDecisionAt", type: "datetime", required: false },
      { key: "receiverDecisionReason", type: "text", required: false },
      { key: "routeSerialNumber", type: "integer", required: false },
      { key: "routeSerialCode", type: "varchar", size: 48, required: false },
      { key: "incomingSerialNumber", type: "integer", required: false },
      { key: "incomingSerialCode", type: "varchar", size: 48, required: false },
      { key: "note", type: "text", required: false },
      CREATED_AT,
      { key: "receivedAt", type: "datetime", required: false },
      { key: "completedAt", type: "datetime", required: false },
    ],
    indexes: [
      {
        key: "telegram_routes_telegram",
        type: "key",
        columns: ["telegramId", "createdAt"],
        orders: ["ASC", "DESC"],
      },
      {
        key: "telegram_routes_destination",
        type: "key",
        columns: ["toOrganizationId", "status"],
      },
      {
        key: "telegram_routes_source",
        type: "key",
        columns: ["fromOrganizationId", "createdAt"],
        orders: ["ASC", "DESC"],
      },
    ],
  },
  {
    id: DEPARTMENT_SETTINGS_TABLE,
    name: "Department settings",
    description: "Per-organization numbering, letterhead and localization.",
    columns: [
      { key: "organizationId", type: "varchar", size: 36, required: true },
      { key: "departmentName", type: "varchar", size: 255, required: true },
      { key: "unitName", type: "varchar", size: 255, required: true },
      { key: "unitChiefRank", type: "varchar", size: 120, required: true },
      { key: "unitChiefName", type: "varchar", size: 255, required: true },
      { key: "serialPrefix", type: "varchar", size: 24, required: true },
      {
        key: "incomingSerialPrefix",
        type: "varchar",
        size: 24,
        required: true,
      },
      { key: "serialStart", type: "integer", required: true, default: 1 },
      {
        key: "incomingSerialStart",
        type: "integer",
        required: true,
        default: 1,
      },
      {
        key: "nextOutgoingSerial",
        type: "integer",
        required: true,
        default: 1,
      },
      {
        key: "nextIncomingSerial",
        type: "integer",
        required: true,
        default: 1,
      },
      { key: "timezone", type: "varchar", size: 64, required: true },
      { key: "dateFormat", type: "varchar", size: 32, required: true },
      { key: "timeFormat", type: "varchar", size: 2, required: true },
      { key: "numberSystem", type: "varchar", size: 16, required: true },
      {
        key: "showVerificationQr",
        type: "boolean",
        required: true,
        default: true,
      },
      { key: "logoUrl", type: "varchar", size: 1024, required: false },
      { key: "updatedByUserId", type: "integer", required: false },
      CREATED_AT,
      UPDATED_AT,
    ],
    indexes: [
      {
        key: "department_settings_org_unique",
        type: "unique",
        columns: ["organizationId"],
      },
    ],
  },
  {
    id: NOTIFICATIONS_TABLE,
    name: "Notifications",
    description: "In-app notification inbox for operational events.",
    columns: [
      ID_COLUMN,
      { key: "userId", type: "integer", required: true },
      { key: "organizationId", type: "varchar", size: 36, required: true },
      { key: "type", type: "varchar", size: 64, required: true },
      { key: "title", type: "varchar", size: 255, required: true },
      { key: "body", type: "text", required: true },
      { key: "telegramId", type: "integer", required: false },
      { key: "routeId", type: "integer", required: false },
      { key: "readAt", type: "datetime", required: false },
      CREATED_AT,
    ],
    indexes: [
      {
        key: "notifications_user_created",
        type: "key",
        columns: ["userId", "createdAt"],
        orders: ["ASC", "DESC"],
      },
      {
        key: "notifications_org_created",
        type: "key",
        columns: ["organizationId", "createdAt"],
        orders: ["ASC", "DESC"],
      },
    ],
  },
  {
    id: MOBILE_PUSH_TOKENS_TABLE,
    name: "Mobile push tokens",
    description: "Firebase Cloud Messaging tokens per signed-in device.",
    columns: [
      ID_COLUMN,
      { key: "userId", type: "integer", required: true },
      { key: "organizationId", type: "varchar", size: 36, required: true },
      { key: "token", type: "varchar", size: 512, required: true },
      { key: "platform", type: "varchar", size: 16, required: true },
      { key: "lastUsedAt", type: "datetime", required: true },
      CREATED_AT,
      UPDATED_AT,
    ],
    indexes: [
      { key: "mobile_push_tokens_token", type: "unique", columns: ["token"] },
      {
        key: "mobile_push_tokens_user",
        type: "key",
        columns: ["userId", "lastUsedAt"],
        orders: ["ASC", "DESC"],
      },
    ],
  },
  {
    id: ORGANIZATIONS_TABLE,
    name: "Organizations",
    description:
      "Organization hierarchy. Columns are additive: existing rows keep working.",
    columns: [
      { key: "id", type: "varchar", size: 36, required: true },
      { key: "name", type: "varchar", size: 255, required: true },
      { key: "code", type: "varchar", size: 32, required: false },
      { key: "type", type: "varchar", size: 32, required: false },
      {
        key: "parentOrganizationId",
        type: "varchar",
        size: 36,
        required: false,
      },
      {
        key: "telegramDestinationOrganizationId",
        type: "varchar",
        size: 36,
        required: false,
      },
      { key: "logoKey", type: "varchar", size: 255, required: false },
      { key: "isActive", type: "boolean", required: true, default: true },
      { key: "deletedAt", type: "datetime", required: false },
      CREATED_AT,
      UPDATED_AT,
    ],
    indexes: [
      { key: "organizations_id_unique", type: "unique", columns: ["id"] },
      {
        key: "organizations_parent",
        type: "key",
        columns: ["parentOrganizationId"],
      },
    ],
  },
  {
    id: USERS_TABLE,
    name: "User profiles",
    description:
      "Application profile rows linked to native Appwrite Auth identities.",
    columns: [
      ID_COLUMN,
      { key: "authUserId", type: "varchar", size: 36, required: true },
      { key: "sessionVersion", type: "varchar", size: 36, required: true },
      { key: "organizationId", type: "varchar", size: 36, required: true },
      { key: "name", type: "varchar", size: 255, required: false },
      { key: "username", type: "varchar", size: 120, required: false },
      { key: "badgeNumber", type: "varchar", size: 80, required: false },
      { key: "bio", type: "text", required: false },
      { key: "phone", type: "varchar", size: 32, required: false },
      { key: "rank", type: "varchar", size: 120, required: false },
      { key: "unit", type: "varchar", size: 255, required: false },
      { key: "avatarKey", type: "text", required: false },
      { key: "email", type: "varchar", size: 320, required: false },
      { key: "loginMethod", type: "varchar", size: 64, required: false },
      { key: "isActive", type: "boolean", required: true, default: true },
      {
        key: "isPlatformOwner",
        type: "boolean",
        required: true,
        default: false,
      },
      {
        key: "mustChangePassword",
        type: "boolean",
        required: true,
        default: false,
      },
      {
        key: "role",
        type: "varchar",
        size: 16,
        required: true,
        default: "user",
      },
      CREATED_AT,
      UPDATED_AT,
      { key: "lastSignedIn", type: "datetime", required: true },
    ],
    indexes: [
      { key: "users_id_unique", type: "unique", columns: ["id"] },
      {
        key: "users_auth_user_unique",
        type: "unique",
        columns: ["authUserId"],
      },
      {
        key: "users_username_unique",
        type: "unique",
        columns: ["username"],
      },
      {
        key: "users_organization",
        type: "key",
        columns: ["organizationId"],
      },
    ],
  },
  {
    id: ORGANIZATION_MEMBERSHIPS_TABLE,
    name: "Organization memberships",
    description: "Organization-scoped user roles and active membership state.",
    columns: [
      ID_COLUMN,
      { key: "organizationId", type: "varchar", size: 36, required: true },
      { key: "userId", type: "integer", required: true },
      { key: "role", type: "varchar", size: 32, required: true },
      { key: "isActive", type: "boolean", required: true, default: true },
      CREATED_AT,
      UPDATED_AT,
    ],
    indexes: [
      {
        key: "organization_memberships_org_user_unique",
        type: "unique",
        columns: ["organizationId", "userId"],
      },
      {
        key: "organization_memberships_user",
        type: "key",
        columns: ["userId"],
      },
      {
        key: "organization_memberships_org_active",
        type: "key",
        columns: ["organizationId", "isActive"],
      },
    ],
  },
  {
    id: AUDIT_LOGS_TABLE,
    name: "Audit logs",
    description:
      "Append-only operational audit entries with a verifiable hash chain.",
    columns: [
      ID_COLUMN,
      { key: "actorUserId", type: "integer", required: true },
      { key: "actorName", type: "varchar", size: 255, required: true },
      { key: "action", type: "varchar", size: 80, required: true },
      { key: "entityType", type: "varchar", size: 80, required: true },
      { key: "entityId", type: "varchar", size: 80, required: false },
      { key: "metadata", type: "text", required: false },
      { key: "ipAddress", type: "varchar", size: 80, required: false },
      { key: "userAgent", type: "text", required: false },
      {
        key: "deviceType",
        type: "varchar",
        size: 16,
        required: true,
        default: "unknown",
      },
      { key: "actorRank", type: "varchar", size: 120, required: false },
      { key: "actorRole", type: "varchar", size: 80, required: false },
      { key: "organizationId", type: "varchar", size: 36, required: false },
      { key: "reason", type: "text", required: false },
      { key: "beforeState", type: "text", required: false },
      { key: "afterState", type: "text", required: false },
      { key: "previousHash", type: "varchar", size: 64, required: false },
      { key: "entryHash", type: "varchar", size: 64, required: false },
      CREATED_AT,
    ],
    indexes: [
      {
        key: "audit_logs_entry_hash_unique",
        type: "unique",
        columns: ["entryHash"],
      },
      {
        key: "audit_logs_actor_created",
        type: "key",
        columns: ["actorUserId", "createdAt"],
        orders: ["ASC", "DESC"],
      },
      {
        key: "audit_logs_org_created",
        type: "key",
        columns: ["organizationId", "createdAt"],
        orders: ["ASC", "DESC"],
      },
    ],
  },
  {
    id: APP_RECORDS_TABLE,
    name: "Application records",
    description: "Keyed records for one-time setup and audit-chain metadata.",
    columns: [
      { key: "recordType", type: "varchar", size: 80, required: true },
      { key: "recordKey", type: "varchar", size: 128, required: true },
      { key: "ownerId", type: "varchar", size: 36, required: false },
      { key: "organizationId", type: "varchar", size: 36, required: false },
      CREATED_AT,
      UPDATED_AT,
      { key: "payload", type: "text", required: true },
    ],
    indexes: [
      {
        key: "app_records_type_key_unique",
        type: "unique",
        columns: ["recordType", "recordKey"],
      },
    ],
  },
  {
    id: PUSH_SUBSCRIPTIONS_TABLE,
    name: "Web push subscriptions",
    description:
      "Browser push endpoints scoped to users and organizations for migration.",
    columns: [
      ID_COLUMN,
      { key: "userId", type: "integer", required: true },
      { key: "organizationId", type: "varchar", size: 36, required: true },
      { key: "endpoint", type: "varchar", size: 768, required: true },
      { key: "p256dh", type: "varchar", size: 255, required: true },
      { key: "auth", type: "varchar", size: 255, required: true },
      { key: "userAgent", type: "varchar", size: 512, required: false },
      { key: "lastUsedAt", type: "datetime", required: true },
      CREATED_AT,
      UPDATED_AT,
    ],
    indexes: [
      {
        key: "push_subscriptions_endpoint_unique",
        type: "unique",
        columns: ["endpoint"],
      },
      {
        key: "push_subscriptions_user_endpoint_unique",
        type: "unique",
        columns: ["userId", "endpoint"],
      },
      {
        key: "push_subscriptions_org_last_used",
        type: "key",
        columns: ["organizationId", "lastUsedAt"],
        orders: ["ASC", "DESC"],
      },
      {
        key: "push_subscriptions_user_last_used",
        type: "key",
        columns: ["userId", "lastUsedAt"],
        orders: ["ASC", "DESC"],
      },
    ],
  },
  {
    id: CONTACTS_TABLE,
    name: "Contacts",
    description: "Simple address book entries owned by a user.",
    columns: [
      { key: "ownerId", type: "varchar", size: 36, required: true },
      { key: "name", type: "varchar", size: 256, required: true },
      { key: "email", type: "varchar", size: 254, required: false },
      { key: "phone", type: "varchar", size: 32, required: false },
      { key: "organization", type: "varchar", size: 256, required: false },
    ],
    indexes: [{ key: "contacts_owner", type: "key", columns: ["ownerId"] }],
  },
  {
    id: COUNTERS_TABLE,
    name: "Counters",
    description:
      "Atomic sequences used for numeric identifiers and telegram serials.",
    columns: [
      { key: "key", type: "varchar", size: 64, required: true },
      { key: "value", type: "integer", required: true },
      { key: "updatedAt", type: "datetime", required: true },
    ],
    indexes: [{ key: "counters_key_unique", type: "unique", columns: ["key"] }],
  },
  {
    id: "platform_document_settings",
    name: "Platform document settings",
    description:
      "Singleton document watermark and official letterhead configuration.",
    columns: [
      { key: "id", type: "integer", required: true },
      {
        key: "showMinistryWatermarkText",
        type: "boolean",
        required: false,
        default: true,
      },
      {
        key: "watermarkOpacityPercent",
        type: "integer",
        required: false,
        default: 12,
      },
      {
        key: "headerDividerColor",
        type: "varchar",
        size: 7,
        required: false,
        default: "#b49a55",
      },
      {
        key: "headerDividerStyle",
        type: "varchar",
        size: 7,
        required: false,
        default: "double",
      },
      {
        key: "headerDividerWidthPt",
        type: "varchar",
        size: 8,
        required: false,
        default: "2.25",
      },
      {
        key: "showVerificationQr",
        type: "boolean",
        required: false,
        default: true,
      },
      { key: "updatedByUserId", type: "integer", required: false },
      { key: "updatedAt", type: "datetime", required: true },
      {
        key: "watermarkText",
        type: "varchar",
        size: 255,
        required: false,
        default: "وزارة الداخلية",
      },
      {
        key: "headerTitle",
        type: "varchar",
        size: 255,
        required: false,
        default: "",
      },
      {
        key: "headerSubtitle",
        type: "varchar",
        size: 255,
        required: false,
        default: "",
      },
      {
        key: "headerChiefRank",
        type: "varchar",
        size: 120,
        required: false,
        default: "",
      },
      {
        key: "headerChiefName",
        type: "varchar",
        size: 255,
        required: false,
        default: "",
      },
      {
        key: "headerShowLogo",
        type: "boolean",
        required: false,
        default: true,
      },
      {
        key: "headerLogoSize",
        type: "integer",
        required: false,
        default: 120,
      },
      {
        key: "headerTopPaddingMm",
        type: "integer",
        required: false,
        default: 0,
      },
      {
        key: "headerHorizontalPaddingMm",
        type: "integer",
        required: false,
        default: 0,
      },
      {
        key: "headerBottomPaddingMm",
        type: "integer",
        required: false,
        default: 6,
      },
      { key: "pageMarginTopMm", type: "integer", required: false, default: 10 },
      {
        key: "pageMarginRightMm",
        type: "integer",
        required: false,
        default: 10,
      },
      {
        key: "pageMarginBottomMm",
        type: "integer",
        required: false,
        default: 10,
      },
      {
        key: "pageMarginLeftMm",
        type: "integer",
        required: false,
        default: 10,
      },
      {
        key: "frameStyle",
        type: "varchar",
        size: 7,
        required: false,
        default: "single",
      },
      {
        key: "frameColor",
        type: "varchar",
        size: 7,
        required: false,
        default: "#b49a55",
      },
      {
        key: "frameWidthPt",
        type: "varchar",
        size: 8,
        required: false,
        default: "1",
      },
      {
        key: "headerAlignment",
        type: "varchar",
        size: 16,
        required: false,
        default: "spread",
      },
    ],
    indexes: [
      {
        key: "platform_doc_settings_id_unique",
        type: "unique",
        columns: ["id"],
      },
    ],
  },
];

export function findSchemaTable(tableId: string): SchemaTable | undefined {
  return appwriteSchema.find(table => table.id === tableId);
}

/** Tables required by the telegram workspace, in provisioning order. */
export const REQUIRED_TABLE_IDS = [
  TELEGRAMS_TABLE,
  TELEGRAM_VERSIONS_TABLE,
  TELEGRAM_ACTIONS_TABLE,
  TELEGRAM_ATTACHMENTS_TABLE,
  TELEGRAM_ROUTES_TABLE,
  DEPARTMENT_SETTINGS_TABLE,
  "platform_document_settings",
  NOTIFICATIONS_TABLE,
  MOBILE_PUSH_TOKENS_TABLE,
  COUNTERS_TABLE,
  ORGANIZATIONS_TABLE,
  USERS_TABLE,
  ORGANIZATION_MEMBERSHIPS_TABLE,
  AUDIT_LOGS_TABLE,
  APP_RECORDS_TABLE,
  PUSH_SUBSCRIPTIONS_TABLE,
] as const;
