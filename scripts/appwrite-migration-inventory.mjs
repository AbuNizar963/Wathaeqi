#!/usr/bin/env node
// Run with: pnpm exec tsx scripts/appwrite-migration-inventory.mjs
import {
  getAppwriteBucketId,
  getAppwriteDatabaseId,
  getAppwriteStorage,
  getAppwriteTablesDB,
  getAppwriteUsers,
} from "../server/_core/appwrite.ts";
import { getSupabaseAdmin } from "../server/_core/supabase.ts";
import {
  runAppwriteMigrationInventory,
  type MigrationInventoryDependencies,
} from "../server/_core/appwriteMigrationInventory.ts";

try {
  const dependencies: MigrationInventoryDependencies = {
    supabase: getSupabaseAdmin() as unknown as MigrationInventoryDependencies["supabase"],
    tables: getAppwriteTablesDB() as unknown as MigrationInventoryDependencies["tables"],
    storage: getAppwriteStorage() as unknown as MigrationInventoryDependencies["storage"],
    users: getAppwriteUsers() as unknown as MigrationInventoryDependencies["users"],
    databaseId: getAppwriteDatabaseId(),
    bucketId: getAppwriteBucketId(),
  };
  const report = await runAppwriteMigrationInventory(dependencies);

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Unknown migration inventory error";
  process.stderr.write(`Migration inventory failed: ${message}\n`);
  process.exitCode = 1;
}
