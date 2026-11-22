#!/usr/bin/env tsx
/**
 * Idempotent Appwrite TablesDB provisioner for the Wathaeqi application.
 *
 * Usage:
 *   pnpm appwrite:schema:check   # report drift; exits 1 when work is needed
 *   pnpm appwrite:schema:apply   # create missing tables, columns and indexes
 *
 * Required environment (server-side only):
 *   APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID
 *
 * Safety: the provisioner never deletes, renames or rewrites existing columns,
 * indexes, tables or rows. It only adds what is missing.
 */
import { Client, OrderBy, TablesDB, TablesDBIndexType } from "node-appwrite";
import {
  appwriteSchema,
  type SchemaColumn,
  type SchemaIndex,
  type SchemaTable,
} from "../shared/appwriteSchema";
import { selectAppwriteSchemaTables } from "./appwrite-schema-selection";

type Mode = "check" | "apply";

type Drift = {
  table: string;
  missingColumns: string[];
  missingIndexes: string[];
  missingTable: boolean;
};

function readMode(): Mode {
  const argument = process.argv[2];
  if (argument === "--check") return "check";
  if (argument === "--apply") return "apply";
  throw new Error("Pass --check or --apply");
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    Number((error as { code?: unknown }).code) === 404
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function listColumnKeys(
  tables: TablesDB,
  databaseId: string,
  tableId: string
): Promise<Map<string, string>> {
  const result = await tables.listColumns({
    databaseId,
    tableId,
    queries: [],
    total: false,
  });
  const columns = result.columns as Array<{ key: string; status?: string }>;
  return new Map(columns.map(column => [column.key, column.status ?? ""]));
}

async function waitForColumns(
  tables: TablesDB,
  databaseId: string,
  tableId: string,
  expectedKeys: string[],
  timeoutMs = 90_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let pending = expectedKeys;
  while (pending.length > 0 && Date.now() < deadline) {
    const statuses = await listColumnKeys(tables, databaseId, tableId);
    pending = expectedKeys.filter(
      key => statuses.get(key) !== "available" && statuses.has(key)
    );
    const missing = expectedKeys.filter(key => !statuses.has(key));
    if (missing.length === 0 && pending.length === 0) return;
    await sleep(1_500);
  }
  if (pending.length > 0) {
    console.warn(
      `  ! columns still processing in ${tableId}: ${pending.join(", ")}`
    );
  }
}

async function createColumn(
  tables: TablesDB,
  databaseId: string,
  tableId: string,
  column: SchemaColumn
): Promise<void> {
  const base = {
    databaseId,
    tableId,
    key: column.key,
    required: column.required,
    ...(column.description ? { description: column.description } : {}),
  };
  switch (column.type) {
    case "varchar":
      await tables.createVarcharColumn({
        ...base,
        size: column.size ?? 255,
        xdefault:
          typeof column.default === "string" ? column.default : undefined,
      });
      return;
    case "text":
      await tables.createTextColumn({
        ...base,
        xdefault:
          typeof column.default === "string" ? column.default : undefined,
      });
      return;
    case "longtext":
      await tables.createLongtextColumn({
        ...base,
        xdefault:
          typeof column.default === "string" ? column.default : undefined,
      });
      return;
    case "integer":
      await tables.createIntegerColumn({
        ...base,
        xdefault:
          typeof column.default === "number" ? column.default : undefined,
      });
      return;
    case "boolean":
      await tables.createBooleanColumn({
        ...base,
        xdefault:
          typeof column.default === "boolean" ? column.default : undefined,
      });
      return;
    case "datetime":
      await tables.createDatetimeColumn({
        ...base,
        xdefault:
          typeof column.default === "string" ? column.default : undefined,
      });
      return;
  }
}

async function createIndex(
  tables: TablesDB,
  databaseId: string,
  tableId: string,
  index: SchemaIndex
): Promise<void> {
  await tables.createIndex({
    databaseId,
    tableId,
    key: index.key,
    type: index.type as TablesDBIndexType,
    columns: index.columns,
    ...(index.orders
      ? {
          orders: index.orders.map(order =>
            order === "ASC" ? OrderBy.Asc : OrderBy.Desc
          ),
        }
      : {}),
  });
}

async function inspectTable(
  tables: TablesDB,
  databaseId: string,
  table: SchemaTable
): Promise<Drift> {
  try {
    const existing = await tables.getTable({ databaseId, tableId: table.id });
    const columnKeys = new Set(
      (existing.columns as Array<{ key: string }>).map(column => column.key)
    );
    const indexKeys = new Set(
      (existing.indexes as Array<{ key: string }>).map(index => index.key)
    );
    return {
      table: table.id,
      missingTable: false,
      missingColumns: table.columns
        .map(column => column.key)
        .filter(key => !columnKeys.has(key)),
      missingIndexes: table.indexes
        .map(index => index.key)
        .filter(key => !indexKeys.has(key)),
    };
  } catch (error) {
    if (!isNotFound(error)) throw error;
    return {
      table: table.id,
      missingTable: true,
      missingColumns: table.columns.map(column => column.key),
      missingIndexes: table.indexes.map(index => index.key),
    };
  }
}

async function applyTable(
  tables: TablesDB,
  databaseId: string,
  table: SchemaTable
): Promise<void> {
  let drift = await inspectTable(tables, databaseId, table);
  if (drift.missingTable) {
    console.log(`+ creating table ${table.id}`);
    try {
      await tables.createTable({
        databaseId,
        tableId: table.id,
        name: table.name,
        description: table.description,
        permissions: [],
        rowSecurity: false,
        enabled: true,
        columns: table.columns.map(column => {
          const base = {
            key: column.key,
            type: column.type,
            required: column.required,
            ...(column.type === "varchar" ? { size: column.size ?? 255 } : {}),
            ...(column.default !== undefined
              ? { default: column.default }
              : {}),
          };
          return base;
        }),
      });
    } catch (error) {
      if (!errorMessage(error).toLowerCase().includes("already exists")) {
        throw error;
      }
    }
    await waitForColumns(
      tables,
      databaseId,
      table.id,
      table.columns.map(column => column.key)
    );
    drift = await inspectTable(tables, databaseId, table);
  }

  for (const key of drift.missingColumns) {
    const column = table.columns.find(item => item.key === key);
    if (!column) continue;
    console.log(`+ ${table.id}: column ${key}`);
    try {
      await createColumn(tables, databaseId, table.id, column);
    } catch (error) {
      if (!errorMessage(error).toLowerCase().includes("already exists")) {
        throw error;
      }
    }
  }

  if (drift.missingColumns.length > 0) {
    await waitForColumns(tables, databaseId, table.id, drift.missingColumns);
  }

  for (const key of drift.missingIndexes) {
    const index = table.indexes.find(item => item.key === key);
    if (!index) continue;
    console.log(`+ ${table.id}: index ${key}`);
    try {
      await createIndex(tables, databaseId, table.id, index);
    } catch (error) {
      const message = errorMessage(error).toLowerCase();
      if (
        !message.includes("already exists") &&
        !message.includes("processing")
      ) {
        throw error;
      }
    }
  }
}

async function main(): Promise<void> {
  const mode = readMode();
  const tablesToProcess = selectAppwriteSchemaTables(
    process.argv.slice(3),
    appwriteSchema
  );
  const endpoint = requireEnv("APPWRITE_ENDPOINT");
  const projectId = requireEnv("APPWRITE_PROJECT_ID");
  const databaseId = requireEnv("APPWRITE_DATABASE_ID");
  const apiKey = requireEnv("APPWRITE_API_KEY");

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);
  const tables = new TablesDB(client);

  if (mode === "check") {
    const drifts: Drift[] = [];
    for (const table of tablesToProcess) {
      drifts.push(await inspectTable(tables, databaseId, table));
    }
    const pending = drifts.filter(
      drift =>
        drift.missingTable ||
        drift.missingColumns.length > 0 ||
        drift.missingIndexes.length > 0
    );
    if (pending.length === 0) {
      console.log("Appwrite schema is up to date.");
      return;
    }
    for (const drift of pending) {
      if (drift.missingTable) {
        console.log(`- ${drift.table}: table missing`);
        continue;
      }
      if (drift.missingColumns.length > 0) {
        console.log(
          `- ${drift.table}: missing columns ${drift.missingColumns.join(", ")}`
        );
      }
      if (drift.missingIndexes.length > 0) {
        console.log(
          `- ${drift.table}: missing indexes ${drift.missingIndexes.join(", ")}`
        );
      }
    }
    process.exitCode = 1;
    return;
  }

  for (const table of tablesToProcess) {
    await applyTable(tables, databaseId, table);
  }
  console.log("Appwrite schema applied.");
}

main().catch(error => {
  console.error(`Appwrite schema provisioning failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
