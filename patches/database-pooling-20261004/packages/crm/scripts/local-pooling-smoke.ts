import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { getLocalDatabasePool } from "../src/db/local-pool";
async function main() {
  assert.equal(Reflect.get(globalThis, Symbol.for("ezwd.localPooledDatabase.v1")), undefined,
    "The old compiled-code pooling patch must not be active");
  const r = await db.execute(sql.raw("SELECT 42::integer AS n, ARRAY[1,2]::integer[] AS nums, '{\"ok\":true}'::jsonb AS data"));
  assert.equal(r.rows[0].n,42); assert.deepEqual(r.rows[0].nums,[1,2]); assert.deepEqual(r.rows[0].data,{ok:true});
  try {
    await db.transaction(async tx => {
      await tx.execute(sql.raw("CREATE TEMP TABLE ezwd_source_pool_rollback (id integer)"));
      throw new Error("expected-rollback");
    });
  } catch(e) { assert.equal((e as Error).message,"expected-rollback"); }
  const rolled=await db.execute(sql.raw("SELECT to_regclass('pg_temp.ezwd_source_pool_rollback') AS test"));
  assert.equal(rolled.rows[0].test,null);
  const times:number[]=[];
  for(let i=0;i<5;i++){const t=performance.now(); await db.execute(sql.raw("SELECT 1"));times.push(Math.round(performance.now()-t));}
  console.log(JSON.stringify({sourceAdapter:true,runtimePoolingPatch:false,types:true,rollback:true,queryMs:times}));
  await getLocalDatabasePool(process.env.DATABASE_URL!,process.env.NEON_LOCAL_HOST!,process.env.NEON_LOCAL_PORT??"4444").end();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
