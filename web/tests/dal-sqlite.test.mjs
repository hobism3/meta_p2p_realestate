// SQLite 외래키·백필 테스트. 실제 파일 DB로 증명.
// 실행: web/에서 `node --test tests/dal-sqlite.test.mjs`
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { rmSync } from "node:fs";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const dbA = join(DIR, `sqlite-fk-${process.pid}.db`);
const dbB = join(DIR, `sqlite-legacy-${process.pid}.db`);

let mod = null;
async function freshDb(path) {
  process.env.DB_PATH = path;
  mod = await import(`../lib/db.ts?x=${path}`);
  return mod.getDb();
}
function shut() {
  try { mod?.closeDb(); } catch { /* 무시 */ }
}

describe("SQLite 외래키", () => {
  it("고아 메시지를 거부한다", async () => {
    const db = await freshDb(dbA);
    assert.throws(() => {
      db.prepare(
        "INSERT INTO messages (id,listing_id,author,role,text,created_at) VALUES (?,?,?,?,?,?)",
      ).run("m1", "없음", "A", "landlord", "hi", "2026-10-27T00:00:00.000Z");
    });
    shut();
    rmSync(dbA, { force: true });
  });
});

describe("트랜잭션", () => {
  it("실패하면 롤백된다", async () => {
    const db = await freshDb(join(DIR, `sqlite-tx-${process.pid}.db`));
    db.exec("BEGIN;");
    db.prepare(
      "INSERT INTO agreements (id,listing_id,text,created_at) VALUES (?,?,?,?)",
    ).run("a1", "s01", "합의", "2026-10-27T00:00:00.000Z");
    db.exec("ROLLBACK;");
    assert.equal(db.prepare("SELECT * FROM agreements WHERE id = ?").get("a1"), undefined);
    shut();
    rmSync(join(DIR, `sqlite-tx-${process.pid}.db`), { force: true });
  });
});

describe("002 백필", () => {
  it("구 스키마 데이터를 보존하고 외래키를 붙인다", async () => {
    const legacy = new DatabaseSync(dbB);
    legacy.exec(
      "CREATE TABLE messages (id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, author TEXT NOT NULL, role TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, created_at TEXT NOT NULL);",
    );
    legacy.prepare(
      "INSERT INTO messages (id,listing_id,author,role,text,created_at) VALUES (?,?,?,?,?,?)",
    ).run("m9", "s01", "A", "landlord", "보존", "2026-10-27T00:00:00.000Z");
    legacy.close();
    const db = await freshDb(dbB);
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get("m9");
    assert.equal(row.text, "보존");
    assert.throws(() => {
      db.prepare(
        "INSERT INTO messages (id,listing_id,author,role,text,created_at) VALUES (?,?,?,?,?,?)",
      ).run("m10", "없음", "A", "landlord", "hi", "2026-10-27T00:00:00.000Z");
    });
    const vers = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
    assert.deepEqual(vers.map((v) => v.version), ["001_initial", "002_fk_backfill"]);
    shut();
    rmSync(dbB, { force: true });
  });
});
