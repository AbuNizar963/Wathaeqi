import { describe, expect, it } from "vitest";
import { runAppwriteMigrationInventory } from "./appwriteMigrationInventory";

describe("Appwrite migration inventory", () => {
  it("compares counts and storage metadata without exposing row or file values", async () => {
    const sourceCounts: Record<string, number> = {
      users: 21,
      organizations: 159,
      audit_logs: 600,
    };
    const supabase = {
      from: (table: string) => ({
        select: async () => ({
          count: sourceCounts[table] ?? 0,
          error: null,
        }),
      }),
      storage: {
        listBuckets: async () => ({
          data: [{ name: "telegram-files" }],
          error: null,
        }),
        from: () => ({
          list: async (path: string) => ({
            data:
              path === ""
                ? [
                    { id: null, name: "logos", metadata: null },
                    {
                      id: "source-file",
                      name: "root-image.png",
                      metadata: { size: 1024 },
                    },
                  ]
                : [
                    {
                      id: "nested-file",
                      name: "logo.png",
                      metadata: { size: "2048" },
                    },
                  ],
            error: null,
          }),
        }),
      },
    };

    const tables = {
      getTable: async ({ tableId }: { tableId: string }) => {
        if (tableId === "auth_login_rate_limits") {
          throw Object.assign(new Error("not found"), { code: 404 });
        }
        return { $id: tableId };
      },
      listRows: async ({ tableId }: { tableId: string }) => ({
        total: tableId === "users" ? 1 : 0,
        rows: [{ data: { privateValue: "must-not-leak" } }],
      }),
    };

    const storage = {
      listFiles: async () => ({
        total: 1,
        files: [
          {
            name: "private-document.docx",
            sizeOriginal: 4096,
          },
        ],
      }),
    };

    const users = {
      list: async () => ({ total: 1 }),
    };

    const report = await runAppwriteMigrationInventory({
      supabase: supabase as never,
      tables: tables as never,
      storage: storage as never,
      users: users as never,
      databaseId: "database",
      bucketId: "attachments",
      generatedAt: "2026-11-23T00:00:00.000Z",
    });

    expect(report.mode).toBe("read-only");
    expect(report.source.tables).toHaveLength(17);
    expect(
      report.source.tables.find(item => item.table === "users")?.records
    ).toBe(21);
    expect(report.source.storage).toEqual([
      { bucket: "telegram-files", objects: 2, bytes: 3072 },
    ]);
    expect(
      report.destination.tables.find(item => item.table === "users")
    ).toMatchObject({ exists: true, records: 1 });
    expect(
      report.destination.tables.find(
        item => item.table === "auth_login_rate_limits"
      )
    ).toMatchObject({ exists: false, records: null });
    expect(report.destination.authUsers).toBe(1);
    expect(report.destination.storage).toEqual({
      bucket: "attachments",
      objects: 1,
      bytes: 4096,
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("private-document.docx");
    expect(serialized).not.toContain("root-image.png");
  });

  it("fails closed when Supabase cannot provide an exact count", async () => {
    const supabase = {
      from: () => ({
        select: async () => ({ count: null, error: null }),
      }),
      storage: {
        listBuckets: async () => ({ data: [], error: null }),
      },
    };

    await expect(
      runAppwriteMigrationInventory({
        supabase: supabase as never,
        tables: {} as never,
        storage: {} as never,
        users: {} as never,
        databaseId: "database",
        bucketId: "attachments",
      })
    ).rejects.toThrow("Invalid record count returned for Supabase.users");
  });

  it("fails closed when Supabase bucket listing returns null without an error", async () => {
    const supabase = {
      from: () => ({
        select: async () => ({ count: 0, error: null }),
      }),
      storage: {
        listBuckets: async () => ({ data: null, error: null }),
      },
    };

    await expect(
      runAppwriteMigrationInventory({
        supabase: supabase as never,
        tables: {} as never,
        storage: {} as never,
        users: {} as never,
        databaseId: "database",
        bucketId: "attachments",
      })
    ).rejects.toThrow("Supabase bucket listing returned no bucket data");
  });

  it("counts more than one Supabase Storage page without dropping objects", async () => {
    const sourceEntries = Array.from({ length: 103 }, (_, index) => ({
      id: `file-${index}`,
      name: `file-${String(index).padStart(3, "0")}.png`,
      metadata: { size: 1 },
    }));
    const supabase = {
      from: () => ({
        select: async () => ({ count: 0, error: null }),
      }),
      storage: {
        listBuckets: async () => ({
          data: [{ name: "documents" }],
          error: null,
        }),
        from: () => ({
          list: async (_path: string, options: { offset: number }) => ({
            data: sourceEntries.slice(options.offset, options.offset + 100),
            error: null,
          }),
        }),
      },
    };
    const tables = {
      getTable: async () => ({}),
      listRows: async () => ({ total: 0, rows: [] }),
    };
    const storage = {
      listFiles: async () => ({ total: 0, files: [] }),
    };
    const users = { list: async () => ({ total: 0 }) };

    const report = await runAppwriteMigrationInventory({
      supabase: supabase as never,
      tables: tables as never,
      storage: storage as never,
      users: users as never,
      databaseId: "database",
      bucketId: "attachments",
    });

    expect(report.source.storage).toEqual([
      { bucket: "documents", objects: 103, bytes: 103 },
    ]);
  });

  it("fails closed when a listed file has an invalid size", async () => {
    const supabase = {
      from: () => ({
        select: async () => ({ count: 0, error: null }),
      }),
      storage: {
        listBuckets: async () => ({
          data: [{ name: "documents" }],
          error: null,
        }),
        from: () => ({
          list: async () => ({
            data: [
              {
                id: "file-1",
                name: "file.png",
                metadata: { size: "unknown" },
              },
            ],
            error: null,
          }),
        }),
      },
    };

    await expect(
      runAppwriteMigrationInventory({
        supabase: supabase as never,
        tables: {} as never,
        storage: {} as never,
        users: {} as never,
        databaseId: "database",
        bucketId: "attachments",
      })
    ).rejects.toThrow(
      "Invalid byte size returned for Supabase Storage.documents"
    );
  });
});
