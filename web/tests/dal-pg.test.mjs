// Postgres DAL 테스트. pg-mem 인메모리 Postgres로 실제 SQL을 검증.
// 실행: web/에서 `node --test tests/dal-pg.test.mjs`
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { newDb } from "pg-mem";
import { PgDal } from "../lib/dal.ts";

let dal;

before(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  dal = new PgDal(new Pool());
  await dal.migrateOnly(["001_initial"]);
});

describe("PG 마이그레이션", () => {
  it("버전이 기록된다", async () => {
    const rows = await dal.all("SELECT version FROM schema_migrations ORDER BY version");
    assert.deepEqual(rows.map((r) => r.version), ["001_initial"]);
  });
  it("시드 키가 들어간다", async () => {
    const rows = await dal.all("SELECT COUNT(*) AS n FROM listing_keys");
    assert.ok(Number(rows[0].n) >= 20);
  });
});

describe("PG 조건 마이그레이션", () => {
  it("008·009가 PG에서도 적용된다", async () => {
    await dal.run("CREATE TABLE deal_rooms (id TEXT PRIMARY KEY, listing_id TEXT)");
    await dal.migrateOnly(["008_ziptalk", "009_confirm"]);
    await dal.run("INSERT INTO deal_rooms (id,listing_id) VALUES (?,?)", ["r1", "s01"]);
    await dal.run(
      "INSERT INTO room_conditions (room_id,name,value,proposer,status,source_msg_ids,version,updated_at,confirmed_by,confirmed_at,confirmed_version) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(room_id,name) DO NOTHING",
      ["r1", "매수 희망가", "44,000만원", "human", "proposed", '["m1"]', 1, "2026-10-29T00:00:00.000Z", "", "", 0],
    );
    await dal.run(
      "UPDATE room_conditions SET confirmed_by = ?, confirmed_at = ?, confirmed_version = version WHERE room_id = ? AND name = ?",
      ["u1", "2026-10-29T00:00:00.000Z", "r1", "매수 희망가"],
    );
    const r = await dal.get("SELECT value, confirmed_by, confirmed_version FROM room_conditions WHERE room_id = ? AND name = ?", [
      "r1", "매수 희망가",
    ]);
    assert.equal(r.value, "44,000만원");
    assert.equal(r.confirmed_by, "u1");
    assert.equal(r.confirmed_version, 1);
  });
});

describe("PG CRUD", () => {
  it("매물을 넣고 읽는다", async () => {
    await dal.run(
      "INSERT INTO custom_listings (id,title,address,trade_type,deposit,rent,fee,area,move_in,options_json,description,publisher,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["t1", "T", "A", "월세", 100, 10, 1, 20, "2026-12-01", "[]", "", "P", "2026-10-27T00:00:00.000Z"],
    );
    await dal.upsertKey("t1");
    const r = await dal.get("SELECT * FROM custom_listings WHERE id = ?", ["t1"]);
    assert.equal(r.title, "T");
  });
  it("고아 메시지를 거부한다", async () => {
    await assert.rejects(
      dal.run("INSERT INTO messages (id,listing_id,author,role,text,created_at) VALUES (?,?,?,?,?,?)", [
        "m1", "없음", "A", "landlord", "hi", "2026-10-27T00:00:00.000Z",
      ]),
    );
  });
  it("트랜잭션 커밋이 된다", async () => {
    await dal.withTransaction(async (tx) => {
      await tx.run("INSERT INTO agreements (id,listing_id,text,created_at) VALUES (?,?,?,?)", [
        "a2", "s01", "합의2", "2026-10-27T00:00:00.000Z",
      ]);
    });
    const r = await dal.get("SELECT * FROM agreements WHERE id = ?", ["a2"]);
    assert.equal(r.text, "합의2");
  });
  // pg-mem은 ROLLBACK을 에뮬레이션하지 못한다. 롤백은 dal-sqlite 테스트에서 증명.
  it("upsert 체크리스트가 된다", async () => {
    await dal.run(
      "INSERT INTO checklist (listing_id,item,state) VALUES (?,?,?) ON CONFLICT(listing_id,item) DO UPDATE SET state=excluded.state",
      ["s01", "신분 확인", "done"],
    );
    await dal.run(
      "INSERT INTO checklist (listing_id,item,state) VALUES (?,?,?) ON CONFLICT(listing_id,item) DO UPDATE SET state=excluded.state",
      ["s01", "신분 확인", ""],
    );
    const r = await dal.get("SELECT state FROM checklist WHERE listing_id = ? AND item = ?", ["s01", "신분 확인"]);
    assert.equal(r.state, "");
  });
});

describe("PG owner AI outbox migration 016", () => {
  it("새 테이블을 만들고 중복 작업을 막으며 atomic claim RETURNING을 지원한다", async () => {
    const mem = newDb();
    const { Pool } = mem.adapters.createPg();
    const q = new PgDal(new Pool());
    await q.migrateOnly(["001_initial"]);
    await q.run("CREATE TABLE deal_rooms (id TEXT PRIMARY KEY, listing_id TEXT)");
    await q.migrateOnly(["016_owner_ai_jobs"]);
    const versions=await q.all("SELECT version FROM schema_migrations WHERE version=?",["016_owner_ai_jobs"]);
    assert.equal(versions.length,1);
    const at="2026-11-01T08:00:00.000Z";
    await q.run(
      "INSERT INTO custom_listings (id,title,address,trade_type,deposit,rent,fee,area,move_in,options_json,description,publisher,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["p3-test","Test","A","월세",1000,50,0,33,"2026-12-01","[]","","owner",at],
    );
    await q.upsertKey("p3-test");
    await q.run("INSERT INTO deal_rooms (id,listing_id) VALUES (?,?)",["p3-room","p3-test"]);
    await q.run("INSERT INTO messages (id,listing_id,author,role,text,created_at) VALUES (?,?,?,?,?,?)",
      ["p3-msg","p3-test","visitor","human","안녕하세요",at]);
    const sql="INSERT INTO owner_ai_jobs (id,room_id,listing_id,trigger_msg_id,caller_id,policy_updated_at,available_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(room_id,trigger_msg_id) DO NOTHING";
    await q.run(sql,["p3-job","p3-room","p3-test","p3-msg","visitor","v1",at,at,at]);
    await q.run(sql,["p3-job-duplicate","p3-room","p3-test","p3-msg","visitor","v1",at,at,at]);
    assert.equal((await q.all("SELECT id FROM owner_ai_jobs WHERE room_id=?",["p3-room"])).length,1);
    const claimed=await q.withTransaction(tx=>tx.get(
      "UPDATE owner_ai_jobs SET status='processing',attempts=attempts+1,lease_until=? WHERE id=? AND status='pending' RETURNING id,status,attempts",
      ["2026-11-01T09:00:00.000Z","p3-job"],
    ));
    assert.equal(claimed?.id,"p3-job");
    assert.equal(claimed?.status,"processing");
    assert.equal(Number(claimed?.attempts),1);
  });
});
