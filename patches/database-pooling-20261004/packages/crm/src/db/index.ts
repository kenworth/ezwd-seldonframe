import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzlePooled } from "drizzle-orm/neon-serverless";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { getLocalDatabasePool } from "./local-pool";
import * as schema from "./schema";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://user:pass@localhost:5432/seldon_frame?sslmode=require";

// Match the driver-agnostic RlsDb contract: erase only the driver's result HKT.
// A union of adapter classes breaks Drizzle's fielded returning() overloads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = PgDatabase<any, typeof schema>;

export const db: DbClient = process.env.NEON_LOCAL_HOST
  ? drizzlePooled(
      getLocalDatabasePool(
        databaseUrl,
        process.env.NEON_LOCAL_HOST,
        process.env.NEON_LOCAL_PORT ?? "4444",
      ),
      { schema, casing: "snake_case" },
    )
  : drizzleHttp(neon(databaseUrl), { schema, casing: "snake_case" });
