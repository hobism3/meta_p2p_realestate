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
