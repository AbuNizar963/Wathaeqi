import type { SchemaTable } from "../shared/appwriteSchema";

/** Restrict schema checks/applies to one known table when requested. */
export function selectAppwriteSchemaTables(
  args: string[],
  schema: readonly SchemaTable[]
): SchemaTable[] {
  if (args.length === 0) return [...schema];
  if (args.length !== 2 || args[0] !== "--table" || !args[1]?.trim()) {
    throw new Error("Usage: [--table <known-table-id>]");
  }

  const tableId = args[1].trim();
  const table = schema.find(candidate => candidate.id === tableId);
  if (!table) {
    throw new Error(`Unknown Appwrite schema table: ${tableId}`);
  }
  return [table];
}
