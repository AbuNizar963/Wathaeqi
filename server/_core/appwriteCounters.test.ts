import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updateRowMock } = vi.hoisted(() => ({
  updateRowMock: vi.fn(),
}));

vi.mock("./appwrite", () => ({
  getAppwriteDatabaseId: vi.fn(() => "test-database"),
  getAppwriteTablesDB: vi.fn(() => ({
    updateRow: updateRowMock,
  })),
}));

import { incrementAppwriteCounter } from "./appwriteCounters";

beforeEach(() => {
  updateRowMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("incrementAppwriteCounter", () => {
  it("uses Appwrite's atomic increment operator and returns the persisted value", async () => {
    updateRowMock.mockResolvedValue({ nextSerial: 42 });

    const result = await incrementAppwriteCounter({
      tableId: "department_settings",
      rowId: "department-1",
      column: "nextSerial",
    });

    expect(result).toBe(42);
    expect(updateRowMock).toHaveBeenCalledTimes(1);

    const [request] = updateRowMock.mock.calls[0] as [
      {
        databaseId: string;
        tableId: string;
        rowId: string;
        data: Record<string, unknown>;
      },
    ];

    expect(request.databaseId).toBe("test-database");
    expect(request.tableId).toBe("department_settings");
    expect(request.rowId).toBe("department-1");
    expect(request.data.nextSerial).toBeDefined();
    expect(typeof request.data.nextSerial).toBe("object");
  });

  it("rejects invalid increments before contacting Appwrite", async () => {
    await expect(
      incrementAppwriteCounter({
        tableId: "department_settings",
        rowId: "department-1",
        column: "nextSerial",
        by: 0,
      })
    ).rejects.toThrow("positive safe integer");

    expect(updateRowMock).not.toHaveBeenCalled();
  });

  it("rejects invalid column names before contacting Appwrite", async () => {
    await expect(
      incrementAppwriteCounter({
        tableId: "department_settings",
        rowId: "department-1",
        column: "$id",
      })
    ).rejects.toThrow("valid Appwrite counter column");

    expect(updateRowMock).not.toHaveBeenCalled();
  });

  it("rejects a response that does not contain a safe integer", async () => {
    updateRowMock.mockResolvedValue({ nextSerial: "42" });

    await expect(
      incrementAppwriteCounter({
        tableId: "department_settings",
        rowId: "department-1",
        column: "nextSerial",
      })
    ).rejects.toThrow(
      'did not return a valid integer for counter "nextSerial"'
    );
  });
});
