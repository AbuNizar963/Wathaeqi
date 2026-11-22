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
import { runAppwriteMigrationInventory } from "../server/_core/appwriteMigrationInventory.ts";

try {
  const report = await runAppwriteMigrationInventory({
    supabase: getSupabaseAdmin(),
    tables: getAppwriteTablesDB(),
    storage: getAppwriteStorage(),
    users: getAppwriteUsers(),
    databaseId: getAppwriteDatabaseId(),
    bucketId: getAppwriteBucketId(),
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Unknown migration inventory error";
  process.stderr.write(`Migration inventory failed: ${message}\n`);
  process.exitCode = 1;
}
