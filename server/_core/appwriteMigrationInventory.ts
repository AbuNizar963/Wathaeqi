import { Query } from "node-appwrite";

const PAGE_SIZE = 100;
const SOURCE_TABLES = [
  "users",
  "department_settings",
  "telegrams",
  "audit_logs",
  "organizations",
  "organization_memberships",
  "telegram_routes",
  "telegram_versions",
  "telegram_attachments",
  "telegram_actions",
  "push_subscriptions",
  "notifications",
  "auth_login_rate_limits",
  "mobile_push_tokens",
  "platform_document_settings",
  "audit_purge_receipts",
  "user_purge_receipts",
] as const;

type ReadError = { message: string } | null;

type SupabaseStorageItem = {
  id?: string | null;
  name: string;
  metadata?: { size?: number | string | null } | null;
};

type SupabaseReadClient = {
  from: (table: string) => {
    select: (
      columns: string,
      options: { count: "exact"; head: true }
    ) => Promise<{ count: number | null; error: ReadError }>;
  };
  storage: {
    listBuckets: () => Promise<{
      data: Array<{ name: string }> | null;
      error: ReadError;
    }>;
    from: (bucket: string) => {
      list: (
        path: string,
        options: {
          limit: number;
          offset: number;
          sortBy: { column: "name"; order: "asc" };
        }
      ) => Promise<{ data: SupabaseStorageItem[] | null; error: ReadError }>;
    };
  };
};

type TablesReadClient = {
  getTable: (input: {
    databaseId: string;
    tableId: string;
  }) => Promise<unknown>;
  listRows: (input: {
    databaseId: string;
    tableId: string;
    queries: string[];
    total: true;
  }) => Promise<{ total: number; rows: unknown[] }>;
};

type StorageReadClient = {
  listFiles: (input: {
    bucketId: string;
    queries: string[];
    total: true;
  }) => Promise<{
    total: number;
    files: Array<{ sizeOriginal?: number | null; sizeActual?: number | null }>;
  }>;
};

type UsersReadClient = {
  list: (input: { queries: string[] }) => Promise<{ total: number }>;
};

export type MigrationInventoryDependencies = {
  supabase: SupabaseReadClient;
  tables: TablesReadClient;
  storage: StorageReadClient;
  users: UsersReadClient;
  databaseId: string;
  bucketId: string;
  generatedAt?: string;
};

type TableCount = {
  table: string;
  records: number;
};

type DestinationTableCount = {
  table: string;
  exists: boolean;
  records: number | null;
};

function asCount(value: unknown, label: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Invalid record count returned for ${label}`);
  }
  return count;
}

function asBytes(value: unknown): number {
  const size = Number(value ?? 0);
  return Number.isSafeInteger(size) && size > 0 ? size : 0;
}

function errorCode(error: unknown): number {
  if (!error || typeof error !== "object" || !("code" in error)) return 0;
  return Number((error as { code?: unknown }).code);
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

async function countSupabaseTable(
  supabase: SupabaseReadClient,
  table: string
): Promise<TableCount> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Supabase count failed (${table}): ${error.message}`);
  }

  return { table, records: asCount(count, `Supabase.${table}`) };
}

async function countSupabaseBucket(
  supabase: SupabaseReadClient,
  bucket: string
): Promise<{ bucket: string; objects: number; bytes: number }> {
  const pendingPaths = [""];
  const visitedPaths = new Set<string>();
  let objects = 0;
  let bytes = 0;

  while (pendingPaths.length > 0) {
    const path = pendingPaths.shift() ?? "";
    if (visitedPaths.has(path)) continue;
    visitedPaths.add(path);

    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(path, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        throw new Error(
          `Supabase Storage listing failed (${bucket}): ${error.message}`
        );
      }

      const entries = data ?? [];
      for (const entry of entries) {
        if (!entry.name) continue;

        if (entry.id == null) {
          pendingPaths.push(path ? `${path}/${entry.name}` : entry.name);
          continue;
        }

        objects += 1;
        bytes += asBytes(entry.metadata?.size);
      }

      if (entries.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return { bucket, objects, bytes };
}

async function countAppwriteTable(
  tables: TablesReadClient,
  databaseId: string,
  table: string
): Promise<DestinationTableCount> {
  try {
    await tables.getTable({ databaseId, tableId: table });
  } catch (error) {
    if (errorCode(error) === 404) {
      return { table, exists: false, records: null };
    }
    const details = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Appwrite table check failed (${table}): ${details}`);
  }

  const result = await tables.listRows({
    databaseId,
    tableId: table,
    queries: [Query.limit(1)],
    total: true,
  });

  return {
    table,
    exists: true,
    records: asCount(result.total, `Appwrite.${table}`),
  };
}

async function countAppwriteBucket(
  storage: StorageReadClient,
  bucketId: string
): Promise<{ bucket: string; objects: number; bytes: number }> {
  let offset = 0;
  let objects = 0;
  let bytes = 0;

  while (true) {
    const result = await storage.listFiles({
      bucketId,
      queries: [Query.limit(PAGE_SIZE), Query.offset(offset)],
      total: true,
    });

    const files = result.files ?? [];
    objects += files.length;
    for (const file of files) {
      bytes += asBytes(file.sizeOriginal ?? file.sizeActual);
    }

    if (files.length < PAGE_SIZE) break;
    offset += files.length;
  }

  return {
    bucket: bucketId,
    objects: asCount(objects, `Appwrite Storage.${bucketId}`),
    bytes,
  };
}

/**
 * Produces a metadata-only inventory. It never reads row contents or file
 * contents and never invokes create, update, upload, or delete operations.
 */
export async function runAppwriteMigrationInventory(
  dependencies: MigrationInventoryDependencies
) {
  const {
    supabase,
    tables,
    storage,
    users,
    databaseId,
    bucketId,
    generatedAt = new Date().toISOString(),
  } = dependencies;

  if (!databaseId.trim() || !bucketId.trim()) {
    throw new Error("Appwrite database and bucket IDs are required");
  }

  const [sourceTables, sourceBucketResult] = await Promise.all([
    mapWithConcurrency(SOURCE_TABLES, 4, table =>
      countSupabaseTable(supabase, table)
    ),
    supabase.storage.listBuckets(),
  ]);

  if (sourceBucketResult.error) {
    throw new Error(
      `Supabase bucket listing failed: ${sourceBucketResult.error.message}`
    );
  }

  const sourceBuckets = await mapWithConcurrency(
    (sourceBucketResult.data ?? []).map(bucket => bucket.name),
    2,
    bucket => countSupabaseBucket(supabase, bucket)
  );

  const [destinationTables, destinationAuthUsers, destinationBucket] =
    await Promise.all([
      mapWithConcurrency(SOURCE_TABLES, 4, table =>
        countAppwriteTable(tables, databaseId, table)
      ),
      users.list({ queries: [Query.limit(1)] }),
      countAppwriteBucket(storage, bucketId),
    ]);

  const destinationByTable = new Map(
    destinationTables.map(table => [table.table, table])
  );
  const comparisons = sourceTables.map(source => {
    const destination = destinationByTable.get(source.table);
    return {
      table: source.table,
      sourceRecords: source.records,
      destinationExists: destination?.exists === true,
      destinationRecords: destination?.records ?? null,
      countDifference:
        destination?.exists === true && destination.records !== null
          ? source.records - destination.records
          : null,
    };
  });

  const warnings = comparisons.flatMap(item => {
    if (!item.destinationExists) {
      return [`Missing Appwrite table: ${item.table}`];
    }
    if (item.countDifference !== 0) {
      return [
        `${item.table} count mismatch: ${item.sourceRecords} vs ${item.destinationRecords}`,
      ];
    }
    return [];
  });

  return {
    mode: "read-only",
    generatedAt,
    source: {
      tables: sourceTables,
      storage: sourceBuckets,
    },
    destination: {
      authUsers: asCount(destinationAuthUsers.total, "Appwrite Auth users"),
      tables: destinationTables,
      storage: destinationBucket,
    },
    comparisons,
    warnings,
    limitations: [
      "Counts and storage sizes only; no row values, credentials, or file contents are read into the report.",
      "Matching counts do not prove matching IDs, relationships, permissions, indexes, or file checksums.",
      "This inventory does not migrate, update, or delete data.",
    ],
  };
}
