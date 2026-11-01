import {test} from "node:test";
import assert from "node:assert/strict";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {rmSync} from "node:fs";

test("SQLite 순차 트랜잭션: 동시에 호출돼도 BEGIN 중첩 없이 완전히 직렬화",async()=>{
 const root=join(dirname(fileURLToPath(import.meta.url)),"..");
 const path=join(root,"data",`sqlite-tx-fifo-${process.pid}.db`);
 process.env.DB_PATH=path;
 const {getDal}=await import("../lib/dal.ts");
 const {closeDb}=await import("../lib/db.ts");
 const dal=getDal();
 const events=[];
 try{
  const a=dal.withTransaction(async tx=>{
   events.push("A-start");
   await tx.run("INSERT OR IGNORE INTO listing_keys (id) VALUES (?)",["fifo-a"]);
   await new Promise(resolve=>setTimeout(resolve,30));
   events.push("A-end");
  });
  const b=dal.withTransaction(async tx=>{
   events.push("B-start");
   await tx.run("INSERT OR IGNORE INTO listing_keys (id) VALUES (?)",["fifo-b"]);
   events.push("B-end");
  });
  await Promise.all([a,b]);
  assert.deepEqual(events,["A-start","A-end","B-start","B-end"]);
  assert.ok(await dal.get("SELECT id FROM listing_keys WHERE id=?",["fifo-a"]));
  assert.ok(await dal.get("SELECT id FROM listing_keys WHERE id=?",["fifo-b"]));
 }finally{
  closeDb();
  for(const ext of ["","-wal","-shm"])rmSync(path+ext,{force:true});
 }
});
