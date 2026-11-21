import { describe, expect, it } from "vitest";
import type { SchemaTable } from "../shared/appwriteSchema";
import { selectAppwriteSchemaTables } from "./appwrite-schema-selection";

const schema = [
  { id: "organizations" },
  { id: "platform_document_settings" },
] as SchemaTable[];

describe("selectAppwriteSchemaTables", () => {
  it("keeps the existing all-tables default", () => {
    expect(selectAppwriteSchemaTables([], schema)).toEqual(schema);
  });

  it("selects only the requested known table", () => {
    expect(
      selectAppwriteSchemaTables(
        ["--table", "platform_document_settings"],
        schema
      )
    ).toEqual([schema[1]]);
  });

  it.each([
    [["--table", "missing_table"]],
    [["--table"]],
    [["--table", "organizations", "extra"]],
    [["--unknown"]],
  ])("rejects invalid selector arguments %j", args => {
    expect(() => selectAppwriteSchemaTables(args, schema)).toThrow();
  });
});
