// Regression: two serverless PgDal instances share one database and migrate concurrently.
// This fake pool models PostgreSQL's transaction-scoped advisory lock and version rows.
// Real Postgres serialization is separately required for production acceptance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PgDal } from "../lib/dal.ts";

function fakePool({ failOnce = false } = {}) {
  const applied = new Set();
  const insertCounts = new Map();
  let lockQueue = Promise.resolve();
  let fail = failOnce;
  let releaseLocks = 0;
  return {
    applied, insertCounts, get releaseLocks() { return releaseLocks; },
    async connect() {
      const pending = new Set();
      let unlock = null;
      return {
        async query(sql, params = []) {
          if (sql === "BEGIN") return { rows: [] };
          if (sql.startsWith("SELECT pg_advisory_xact_lock(")) {
            const previous = lockQueue;
            lockQueue = new Promise((resolve) => { unlock = resolve; });
            await previous;
            return { rows: [] };
          }
          if (sql === "COMMIT") {
            for (const version of pending) applied.add(version);
            unlock?.(); releaseLocks++;
            return { rows: [] };
          }
          if (sql === "ROLLBACK") {
            pending.clear(); unlock?.(); releaseLocks++;
            return { rows: [] };
          }
          if (sql.startsWith("SELECT version FROM schema_migrations"))
            return { rows: [...applied].map((version) => ({ version })) };
          if (sql.startsWith("SELECT id FROM custom_listings")) return { rows: [] };
          if (sql.startsWith("INSERT INTO schema_migrations")) {
            const version = params[0];
            if (applied.has(version) || pending.has(version)) throw Error("duplicate version");
            if (fail && version === "003_authn") {
              fail = false;
              throw Error("transient migration failure");
            }
            pending.add(version);
            insertCounts.set(version, (insertCounts.get(version) ?? 0) + 1);
          }
          return { rows: [] };
        },
        release() {},
      };
    },
    async query(sql) {
      if (sql.startsWith("SELECT version FROM schema_migrations"))
        return { rows: [...applied].map((version) => ({ version })) };
      return { rows: [] };
    },
  };
}

test("concurrent PgDal startups only apply each migration once", async () => {
  const pool = fakePool();
  const first = new PgDal(pool), second = new PgDal(pool);
  await Promise.all([first.migrate(), second.migrate()]);
  assert.equal(pool.applied.size, 20);
  assert.ok([...pool.insertCounts.values()].every((n) => n === 1));
  assert.equal(pool.releaseLocks, 2);
});

test("failed migration rolls back, unlocks, and can retry", async () => {
  const pool = fakePool({ failOnce: true });
  const dal = new PgDal(pool);
  await assert.rejects(dal.migrate(), /transient migration failure/);
  assert.equal(pool.applied.size, 0);
  await dal.migrate();
  assert.equal(pool.applied.size, 20);
  assert.equal(pool.releaseLocks, 2);
});
