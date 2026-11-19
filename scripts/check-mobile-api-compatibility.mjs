import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const requireAll = args.includes("--require-all");
const compareIndex = args.indexOf("--compare");
const allowedArgs = new Set(["--require-all", "--compare"]);

if (
  args.some((arg, index) =>
    index === compareIndex + 1 && compareIndex !== -1
      ? false
      : !allowedArgs.has(arg)
  ) ||
  (compareIndex !== -1 &&
    (!args[compareIndex + 1] || args[compareIndex + 1].startsWith("--")))
) {
  console.error(
    "Usage: node scripts/check-mobile-api-compatibility.mjs [--compare other-repository-root] [--require-all]"
  );
  process.exit(2);
}

function loadContract(root) {
  const path = resolve(root, "shared/mobile-api-contract.json");
  const contract = JSON.parse(readFileSync(path, "utf8"));
  if (
    contract.version !== 1 ||
    !Array.isArray(contract.mobileProcedures) ||
    !Array.isArray(contract.webProcedures) ||
    !contract.mobileProcedures.every(value => typeof value === "string") ||
    !contract.webProcedures.every(value => typeof value === "string")
  ) {
    throw new Error(`Invalid mobile API contract: ${path}`);
  }
  return contract;
}

try {
  const contract = loadContract(repositoryRoot);
  if (compareIndex !== -1) {
    const other = loadContract(resolve(args[compareIndex + 1]));
    if (JSON.stringify(contract) !== JSON.stringify(other)) {
      console.error("The two branch contract snapshots differ.");
      process.exitCode = 1;
    } else {
      console.log("The two branch contract snapshots match.");
    }
  }

  const webProcedures = new Set(contract.webProcedures);
  const missing = contract.mobileProcedures.filter(
    procedure => !webProcedures.has(procedure)
  );
  console.log(
    `Mobile literal procedure names: ${contract.mobileProcedures.length}; missing from the Appwrite router: ${missing.length}.`
  );
  for (const procedure of missing) console.log(`  - ${procedure}`);
  console.log(
    "Name matching alone does not verify request/response schemas, permissions, dynamic calls, direct HTTP routes, or runtime behavior."
  );
  if (requireAll && missing.length > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
