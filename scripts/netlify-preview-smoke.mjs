import assert from "node:assert/strict";

const previewUrl = process.env.NETLIFY_PREVIEW_URL;
if (!previewUrl) {
  console.log(
    "Netlify Deploy Preview smoke test skipped: no preview URL was supplied."
  );
  process.exit(0);
}

const healthUrl = new URL("/api/health", previewUrl);
const trpcUrl = new URL("/api/trpc/auth.me", previewUrl);
trpcUrl.searchParams.set("batch", "1");
trpcUrl.searchParams.set(
  "input",
  JSON.stringify({
    0: { json: null, meta: { values: ["undefined"] } },
  })
);

let healthResponse;
let lastError;
for (let attempt = 1; attempt <= 60; attempt += 1) {
  try {
    healthResponse = await fetch(healthUrl, {
      headers: { accept: "application/json", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(15_000),
    });
    if (healthResponse.ok) break;
    lastError = new Error(
      `Health endpoint returned HTTP ${healthResponse.status}`
    );
  } catch (error) {
    lastError = error;
  }
  await new Promise(resolve => setTimeout(resolve, 5_000));
}

assert.ok(
  healthResponse?.ok,
  `Netlify Deploy Preview health check did not become ready: ${
    lastError?.message ?? "no response"
  }`
);
const health = await healthResponse.json();
assert.equal(health.ok, true, "Netlify health endpoint did not report ok.");
assert.equal(
  health.service,
  "wathaeqi-api",
  "Health request missed the Netlify API function."
);

const trpcResponse = await fetch(trpcUrl, {
  headers: { accept: "application/json", "cache-control": "no-cache" },
  signal: AbortSignal.timeout(30_000),
});
const trpcBody = await trpcResponse.text();
assert.equal(
  trpcResponse.status,
  200,
  `Netlify tRPC route returned HTTP ${trpcResponse.status}: ${trpcBody.slice(0, 500)}`
);
assert.doesNotThrow(
  () => JSON.parse(trpcBody),
  "Netlify tRPC route did not return JSON."
);

console.log("Netlify Deploy Preview API smoke test passed.");
console.log(
  JSON.stringify(
    {
      previewUrl,
      health: health.capabilities,
      trpcStatus: trpcResponse.status,
    },
    null,
    2
  )
);
