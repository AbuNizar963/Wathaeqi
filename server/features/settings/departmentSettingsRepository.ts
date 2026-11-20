import { Query } from "node-appwrite";
import {
  getAppwriteDatabaseId,
  getAppwriteTablesDB,
} from "../../_core/appwrite";
import { DEPARTMENT_SETTINGS_TABLE } from "../../../shared/appwriteSchema";

export type DepartmentSettings = {
  organizationId: string;
  departmentName: string;
  unitName: string;
  unitChiefRank: string;
  unitChiefName: string;
  serialPrefix: string;
  incomingSerialPrefix: string;
  serialStart: number;
  incomingSerialStart: number;
  nextOutgoingSerial: number;
  nextIncomingSerial: number;
  timezone: string;
  dateFormat: string;
  timeFormat: "12" | "24";
  numberSystem: "latin" | "arabic";
  showVerificationQr: boolean;
  logoUrl: string | null;
  updatedByUserId: number | null;
  createdAt: string;
  updatedAt: string;
};

export const DEPARTMENT_SETTINGS_DEFAULTS: Omit<
  DepartmentSettings,
  "organizationId" | "updatedByUserId" | "createdAt" | "updatedAt"
> = {
  departmentName: "إدارة الشرطة",
  unitName: "وحدة العمليات",
  unitChiefRank: "العقيد",
  unitChiefName: "رئيس الوحدة",
  serialPrefix: "POL",
  incomingSerialPrefix: "POL",
  serialStart: 1,
  incomingSerialStart: 1,
  nextOutgoingSerial: 1,
  nextIncomingSerial: 1,
  timezone: "Asia/Damascus",
  dateFormat: "dd/MM/yyyy HH:mm:ss",
  timeFormat: "24",
  numberSystem: "latin",
  showVerificationQr: true,
  logoUrl: null,
};

export const DEPARTMENT_TIMEZONES = [
  "Asia/Damascus",
  "Asia/Riyadh",
  "Asia/Amman",
  "Asia/Baghdad",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Dubai",
  "Asia/Muscat",
  "Africa/Cairo",
  "Africa/Tunis",
  "Africa/Algiers",
  "Africa/Casablanca",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
] as const;

type AppwriteRow = Record<string, unknown> & {
  $id: string;
  $createdAt?: string;
  $updatedAt?: string;
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function errorCode(error: unknown): number {
  return error && typeof error === "object" && "code" in error
    ? Number((error as { code?: unknown }).code)
    : 0;
}

async function findRowByColumn(
  tableId: string,
  column: string,
  value: string | number
): Promise<AppwriteRow | null> {
  const result = await getAppwriteTablesDB().listRows({
    databaseId: getAppwriteDatabaseId(),
    tableId,
    queries: [Query.equal(column, value), Query.limit(2)],
    total: false,
  });
  const rows = result.rows as AppwriteRow[];
  if (rows.length > 1) {
    throw new Error(
      `Appwrite returned duplicate rows for ${tableId}.${column}`
    );
  }
  return rows[0] ?? null;
}

export function mapDepartmentSettingsRow(row: AppwriteRow): DepartmentSettings {
  const timeFormat = asString(row.timeFormat, "24") === "12" ? "12" : "24";
  return {
    organizationId: asString(row.organizationId),
    departmentName: asString(
      row.departmentName,
      DEPARTMENT_SETTINGS_DEFAULTS.departmentName
    ),
    unitName: asString(row.unitName, DEPARTMENT_SETTINGS_DEFAULTS.unitName),
    unitChiefRank: asString(
      row.unitChiefRank,
      DEPARTMENT_SETTINGS_DEFAULTS.unitChiefRank
    ),
    unitChiefName: asString(
      row.unitChiefName,
      DEPARTMENT_SETTINGS_DEFAULTS.unitChiefName
    ),
    serialPrefix: asString(
      row.serialPrefix,
      DEPARTMENT_SETTINGS_DEFAULTS.serialPrefix
    ),
    incomingSerialPrefix: asString(
      row.incomingSerialPrefix,
      DEPARTMENT_SETTINGS_DEFAULTS.incomingSerialPrefix
    ),
    serialStart: asNumber(
      row.serialStart,
      DEPARTMENT_SETTINGS_DEFAULTS.serialStart
    ),
    incomingSerialStart: asNumber(
      row.incomingSerialStart,
      DEPARTMENT_SETTINGS_DEFAULTS.incomingSerialStart
    ),
    nextOutgoingSerial: asNumber(
      row.nextOutgoingSerial,
      DEPARTMENT_SETTINGS_DEFAULTS.nextOutgoingSerial
    ),
    nextIncomingSerial: asNumber(
      row.nextIncomingSerial,
      DEPARTMENT_SETTINGS_DEFAULTS.nextIncomingSerial
    ),
    timezone: asString(row.timezone, DEPARTMENT_SETTINGS_DEFAULTS.timezone),
    dateFormat: asString(
      row.dateFormat,
      DEPARTMENT_SETTINGS_DEFAULTS.dateFormat
    ),
    timeFormat,
    numberSystem:
      asString(row.numberSystem, "latin") === "arabic" ? "arabic" : "latin",
    showVerificationQr: asBoolean(row.showVerificationQr, true),
    logoUrl: asNullableString(row.logoUrl),
    updatedByUserId: asNullableNumber(row.updatedByUserId),
    createdAt: isoOrNull(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: isoOrNull(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

export async function getDepartmentSettings(
  organizationId: string
): Promise<DepartmentSettings | null> {
  const row = await findRowByColumn(
    DEPARTMENT_SETTINGS_TABLE,
    "organizationId",
    organizationId
  );
  return row ? mapDepartmentSettingsRow(row) : null;
}

/** Reads the settings row, creating it with defaults when it does not exist. */
export async function ensureDepartmentSettings(
  organizationId: string
): Promise<DepartmentSettings> {
  const existing = await getDepartmentSettings(organizationId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const data = {
    organizationId,
    ...DEPARTMENT_SETTINGS_DEFAULTS,
    updatedByUserId: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    const created = await getAppwriteTablesDB().createRow({
      databaseId: getAppwriteDatabaseId(),
      tableId: DEPARTMENT_SETTINGS_TABLE,
      rowId: `settings-${organizationId}`,
      data,
    });
    return mapDepartmentSettingsRow(created as AppwriteRow);
  } catch (error) {
    if (errorCode(error) !== 409) throw error;
    const raced = await getDepartmentSettings(organizationId);
    if (!raced) throw error;
    return raced;
  }
}

export async function updateDepartmentSettings(
  organizationId: string,
  input: Omit<
    DepartmentSettings,
    "organizationId" | "createdAt" | "updatedAt" | "updatedByUserId"
  >,
  updatedByUserId: number
): Promise<DepartmentSettings> {
  await ensureDepartmentSettings(organizationId);
  const updated = await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId: DEPARTMENT_SETTINGS_TABLE,
    rowId: `settings-${organizationId}`,
    data: {
      ...input,
      updatedByUserId,
      updatedAt: new Date().toISOString(),
    },
  });
  return mapDepartmentSettingsRow(updated as AppwriteRow);
}
