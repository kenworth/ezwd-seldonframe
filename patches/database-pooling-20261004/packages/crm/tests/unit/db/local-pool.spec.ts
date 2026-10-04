import test from "node:test";
import assert from "node:assert/strict";
import { neonConfig } from "@neondatabase/serverless";
import { getLocalDatabasePool } from "../../../src/db/local-pool";

test("local queries reuse a bounded pool and never use HTTP per query", async () => {
  const url = "postgresql://pool_test:unused@postgres/pool_test";
  const first = getLocalDatabasePool(url, "neon-proxy");
  const same = getLocalDatabasePool(url, "neon-proxy");
  const restricted = getLocalDatabasePool(
    "postgresql://restricted:unused@postgres/pool_test", "neon-proxy",
  );
  try {
    assert.equal(first, same);
    assert.notEqual(first, restricted);
    assert.equal(first.options.max, 10);
    assert.equal(first.options.connectionTimeoutMillis, 10000);
    assert.equal(first.options.idleTimeoutMillis, 60000);
    assert.equal(neonConfig.poolQueryViaFetch, false);
    assert.equal(neonConfig.fetchEndpoint, "http://neon-proxy:4444/sql");
    assert.equal(typeof neonConfig.wsProxy, "function");
    assert.equal(first.totalCount, 0, "import/build must not open database connections");
    assert.equal(restricted.totalCount, 0);
  } finally {
    await Promise.all([first.end(), restricted.end()]);
  }
});
