import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ownerApiRouter } from "./ownerApiRouter";

type MobileApiContract = {
  version: number;
  mobileProcedures: string[];
  webProcedures: string[];
};

const contract = JSON.parse(
  readFileSync(
    new URL("../shared/mobile-api-contract.json", import.meta.url),
    "utf8"
  )
) as MobileApiContract;

describe("mobile and Appwrite API contract snapshot", () => {
  it("tracks actual registered Appwrite procedure names", () => {
    expect(contract.version).toBe(1);
    expect(contract.webProcedures).toEqual(
      Object.keys(ownerApiRouter._def.procedures).sort()
    );
  });

  it("uses unique sorted mobile names without claiming behavioral compatibility", () => {
    expect(contract.mobileProcedures).toEqual(
      [...new Set(contract.mobileProcedures)].sort()
    );
  });
});
