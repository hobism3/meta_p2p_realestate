import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SQLInputValue } from "node:sqlite";
import { Pool } from "pg";
import { SEED_LISTINGS } from "./listings.ts";
import { getDb } from "./db.ts";

export interface Tx {
  run(sql: string, params?: SQLInputValue[]): Promise<void>;
  all(sql: string, params?: SQLInputValue[]): Promise<Record<string, unknown>[]>;
  get(sql: string, params?: SQLInputValue[]): Promise<Record<string, unknown> | undefined>;
  upsertKey(id: string): Promise<void>;
}

export interface Dal {
  kind: "sqlite" | "pg";
  all(sql: string, params?: SQLInputValue[]): Promise<Record<string, unknown>[]>;
  get(sql: string, params?: SQLInputValue[]): Promise<Record<string, unknown> | undefined>;
  run(sql: string, params?: SQLInputValue[]): Promise<void>;
  execScript(sql: string): Promise<void>;
  migrate(): Promise<void>;
  withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  ensureKeys(): Promise<void>;
  upsertKey(id: string): Promise<void>;
}

function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${(i += 1)}`);
}

function migrationsDir(): string {
  return join(process.cwd(), "db", "migrations");
}

function migrationFiles(): { version: string; sql: string }[] {
  return readdirSync(migrationsDir())
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ version: f.replace(/\.sql$/, ""), sql: readFileSync(join(migrationsDir(), f), "utf-8") }));
}

class SqliteDal implements Dal {
  kind = "sqlite" as const;

  async all(sql: string, params: SQLInputValue[] = []): Promise<Record<string, unknown>[]> {
    return getDb().prepare(sql).all(...params) as Record<string, unknown>[];
  }

  async get(sql: string, params: SQLInputValue[] = []): Promise<Record<string, unknown> | undefined> {
    return getDb().prepare(sql).get(...params) as Record<string, unknown> | undefined;
  }

  async run(sql: string, params: SQLInputValue[] = []): Promise<void> {
    getDb().prepare(sql).run(...params);
  }

  async execScript(sql: string): Promise<void> {
    getDb().exec(sql);
  }

  async migrate(): Promise<void> {
    getDb();
  }

  async withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const db = getDb();
    const tx: Tx = {
      run: async (sql, params = []) => {
        db.prepare(sql).run(...params);
      },
      all: async (sql, params = []) => {
        return db.prepare(sql).all(...params) as Record<string, unknown>[];
      },
      get: async (sql, params = []) => {
        return db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
      },
      upsertKey: async (id: string) => {
        db.prepare("INSERT OR IGNORE INTO listing_keys (id) VALUES (?)").run(id);
      },
    };
    db.exec("BEGIN;");
    try {
      const r = await fn(tx);
      db.exec("COMMIT;");
      return r;
    } catch (e) {
      db.exec("ROLLBACK;");
      throw e;
    }
  }

  async ensureKeys(): Promise<void> {
    const db = getDb();
    const stmt = db.prepare("INSERT OR IGNORE INTO listing_keys (id) VALUES (?)");
    for (const l of SEED_LISTINGS) stmt.run(l.id);
    const customs = db.prepare("SELECT id FROM custom_listings").all() as { id: string }[];
    for (const c of customs) stmt.run(c.id);
  }

  async upsertKey(id: string): Promise<void> {
    getDb().prepare("INSERT OR IGNORE INTO listing_keys (id) VALUES (?)").run(id);
  }
}

interface PgPool {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  connect(): Promise<PgClient>;
}

interface PgClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}

export class PgDal implements Dal {
  kind = "pg" as const;
  private pool: PgPool;
  private ready: Promise<void> | null = null;

  constructor(pool: PgPool) {
    this.pool = pool;
  }

  private async rawAll(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    const r = await this.pool.query(toPg(sql), params);
    return r.rows;
  }

  private async rawRun(sql: string, params: unknown[] = []): Promise<void> {
    await this.pool.query(toPg(sql), params);
  }

  private async rawExec(sql: string): Promise<void> {
    // pg-mem은 IF NOT EXISTS+제약조건 조합을 지원하지 않는다.
    // 문장 단위로 나눠 already-exists만 넘긴다. 실제 Postgres 동작과 같다.
    for (const part of sql.split(";")) {
      const stmt = part.trim();
      if (!stmt) continue;
      try {
        await this.pool.query(stmt);
      } catch (e) {
        if (!/already exists/i.test(e instanceof Error ? e.message : String(e))) throw e;
      }
    }
  }

  private async rawEnsureKeys(): Promise<void> {
    for (const l of SEED_LISTINGS) {
      await this.rawRun("INSERT INTO listing_keys (id) VALUES (?) ON CONFLICT (id) DO NOTHING", [l.id]);
    }
    const customs = await this.rawAll("SELECT id FROM custom_listings");
    for (const c of customs) {
      await this.rawRun("INSERT INTO listing_keys (id) VALUES (?) ON CONFLICT (id) DO NOTHING", [c.id]);
    }
  }

  private async migrateInner(only?: string[]): Promise<void> {
    let rows: Record<string, unknown>[] = [];
    try {
      rows = await this.rawAll("SELECT version FROM schema_migrations");
    } catch {
      rows = [];
    }
    const applied = new Set(rows.map((r) => String(r.version)));
    for (const m of migrationFiles()) {
      if ((only && !only.includes(m.version)) || applied.has(m.version)) continue;
      await this.rawExec(m.sql);
      await this.rawRun("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", [
        m.version,
        new Date().toISOString(),
      ]);
      if (m.version === "001_initial") await this.rawEnsureKeys();
    }
    await this.rawEnsureKeys();
  }

  private ensureReady(): Promise<void> {
    if (!this.ready) this.ready = this.migrateInner();
    return this.ready;
  }

  async all(sql: string, params: SQLInputValue[] = []): Promise<Record<string, unknown>[]> {
    await this.ensureReady();
    return this.rawAll(sql, params);
  }

  async get(sql: string, params: SQLInputValue[] = []): Promise<Record<string, unknown> | undefined> {
    await this.ensureReady();
    const rows = await this.rawAll(sql, params);
    return rows[0];
  }

  async run(sql: string, params: SQLInputValue[] = []): Promise<void> {
    await this.ensureReady();
    await this.rawRun(sql, params);
  }

  async execScript(sql: string): Promise<void> {
    await this.rawExec(sql);
  }

  async migrate(): Promise<void> {
    await this.ensureReady();
  }

  /** 지정 버전만 적용. 002는 구 SQLite 승격 전용이라 PG 신규 DB 테스트에서 제외한다. */
  async migrateOnly(versions: string[]): Promise<void> {
    let rows: Record<string, unknown>[] = [];
    try {
      rows = await this.rawAll("SELECT version FROM schema_migrations");
    } catch {
      rows = [];
    }
    const applied = new Set(rows.map((r) => String(r.version)));
    for (const m of migrationFiles()) {
      if (!versions.includes(m.version) || applied.has(m.version)) continue;
      await this.rawExec(m.sql);
      await this.rawRun("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", [
        m.version,
        new Date().toISOString(),
      ]);
      if (m.version === "001_initial") await this.rawEnsureKeys();
    }
    await this.rawEnsureKeys();
    // 이후 일반 호출도 마이그레이션 완료로 간주한다.
    if (!this.ready) this.ready = Promise.resolve();
  }

  async withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    await this.ensureReady();
    // 풀에서 커넥션 하나를 잡아야 BEGIN/COMMIT이 같은 세션에서 실행된다.
    const client = await this.pool.connect();
    const tx: Tx = {
      upsertKey: async (id: string) => {
        await client.query("INSERT INTO listing_keys (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [id]);
      },
      run: async (sql, params = []) => {
        await client.query(toPg(sql), params);
      },
      all: async (sql, params = []) => {
        const r = await client.query(toPg(sql), params);
        return r.rows;
      },
      get: async (sql, params = []) => {
        const r = await client.query(toPg(sql), params);
        return r.rows[0];
      },
    };
    try {
      await client.query("BEGIN");
      const r = await fn(tx);
      await client.query("COMMIT");
      return r;
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // 무시
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async ensureKeys(): Promise<void> {
    await this.ensureReady();
    await this.rawEnsureKeys();
  }

  async upsertKey(id: string): Promise<void> {
    await this.ensureReady();
    await this.rawRun("INSERT INTO listing_keys (id) VALUES (?) ON CONFLICT (id) DO NOTHING", [id]);
  }
}

let dal: Dal | null = null;

export function getDal(): Dal {
  if (dal) return dal;
  if (process.env.DATABASE_URL) {
    dal = new PgDal(
      new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }),
    );
  } else {
    dal = new SqliteDal();
  }
  return dal;
}
