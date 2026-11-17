import { Operator } from "node-appwrite";
import { getAppwriteDatabaseId, getAppwriteTablesDB } from "./appwrite";

export type AppwriteCounterInput = {
  tableId: string;
  rowId: string;
  column: string;
  by?: number;
};

/**
 * Atomically increments one integer column and returns the value written by
 * Appwrite. This is a low-level server-only primitive, not a complete serial
 * reservation workflow: callers must authorize the actor and scope before
 * invoking it, and must separately handle idempotency and related writes.
 *
 * Appwrite's server SDK uses an API key, which bypasses Appwrite table and row
 * permissions. Authorization must therefore be enforced by the application
 * before this function is called.
 */
export async function incrementAppwriteCounter(
  input: AppwriteCounterInput
): Promise<number> {
  const tableId = input.tableId.trim();
  const rowId = input.rowId.trim();
  const column = input.column.trim();
  const by = input.by ?? 1;

  if (!tableId || !rowId) {
    throw new Error("An Appwrite table ID and row ID are required");
  }

  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(column)) {
    throw new Error("A valid Appwrite counter column is required");
  }

  if (!Number.isSafeInteger(by) || by <= 0) {
    throw new Error("The counter increment must be a positive safe integer");
  }

  const updatedRow = await getAppwriteTablesDB().updateRow({
    databaseId: getAppwriteDatabaseId(),
    tableId,
    rowId,
    data: {
      [column]: Operator.increment(by),
    },
  });

  const nextValue = updatedRow[column];
  if (typeof nextValue !== "number" || !Number.isSafeInteger(nextValue)) {
    throw new Error(
      `Appwrite did not return a valid integer for counter "${column}"`
    );
  }

  return nextValue;
}
