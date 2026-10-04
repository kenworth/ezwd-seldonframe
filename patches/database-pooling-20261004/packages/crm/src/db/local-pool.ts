import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Keep one bounded pool across development reloads and separately bundled routes.
// The key includes the URL so privileged and restricted database roles never share
// connections. Credentials stay in process memory and are never logged.
const processState = globalThis as typeof globalThis & {
  __seldonLocalDatabasePools?: Map<string, Pool>;
};

export function getLocalDatabasePool(
  databaseUrl: string,
  host: string,
  port = "4444",
): Pool {
  neonConfig.webSocketConstructor = ws;
  neonConfig.wsProxy = () => `${host}:${port}/v1`;
  neonConfig.useSecureWebSocket = false;
  // Standalone neon() calls still need the local HTTP endpoint. Pool queries must
  // use persistent WebSockets instead of silently falling back to HTTP.
  neonConfig.fetchEndpoint = `http://${host}:${port}/sql`;
  neonConfig.poolQueryViaFetch = false;

  const pools = processState.__seldonLocalDatabasePools ??= new Map();
  const key = JSON.stringify([databaseUrl, host, port]);
  let pool = pools.get(key);
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 10000,
    });
    pool.on("error", (error: Error & { code?: string }) => {
      console.error("[database] idle local connection error", error.code ?? "unknown");
    });
    pools.set(key, pool);
  }
  return pool;
}
