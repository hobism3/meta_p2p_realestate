import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { SEED_LISTINGS } from "./listings.ts";

let db: DatabaseSync | null = null;
let dbPath = "";

export function dbPathFor(): string {
  return process.env.DB_PATH ?? join(process.cwd(), "data", "directhome.db");
}

function migrationsDir(): string {
  return join(process.cwd(), "db", "migrations");
}

function runMigrations(d: DatabaseSync): void {
  d.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);",
  );
  const applied = new Set(
    (d.prepare("SELECT version FROM schema_migrations").all() as { version: string }[]).map(
      (r) => r.version,
    ),
  );
  const files = readdirSync(migrationsDir())
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const version = f.replace(/\.sql$/, "");
    if (applied.has(version)) continue;
    d.exec(readFileSync(join(migrationsDir(), f), "utf-8"));
    d.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      version,
      now(),
    );
    // 002 재구축 전에 부모 키를 먼저 넣는다. 순서가 바뀌면 외래키 위반.
    if (version === "001_initial") seedKeys(d);
  }
}

function seedKeys(d: DatabaseSync): void {
  const stmt = d.prepare("INSERT OR IGNORE INTO listing_keys (id) VALUES (?)");
  for (const l of SEED_LISTINGS) stmt.run(l.id);
  try {
    const customs = d.prepare("SELECT id FROM custom_listings").all() as { id: string }[];
    for (const c of customs) stmt.run(c.id);
  } catch {
    // 구 DB에 테이블이 없으면 무시
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    dbPath = "";
  }
}

function ensureKeys(d: DatabaseSync): void {
  const stmt = d.prepare("INSERT OR IGNORE INTO listing_keys (id) VALUES (?)");
  for (const l of SEED_LISTINGS) stmt.run(l.id);
  const customs = d.prepare("SELECT id FROM custom_listings").all() as { id: string }[];
  for (const c of customs) stmt.run(c.id);
}

export function ensureListingKey(id: string): void {
  getDb().prepare("INSERT OR IGNORE INTO listing_keys (id) VALUES (?)").run(id);
}

export function getDb(): DatabaseSync {
  const p = dbPathFor();
  if (db && dbPath === p) return db;
  if (db) db.close();
  mkdirSync(dirname(p), { recursive: true });
  db = new DatabaseSync(p);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  // 구 DB(버전관리 이전)도 runMigrations에서 001부터 순서대로 받는다.
  runMigrations(db);
  ensureKeys(db);
  if (process.env.VERCEL && !process.env.DATABASE_URL) {
    console.warn("[directhome] VERCEL 환경에서 SQLite 파일은 유실된다. DATABASE_URL(Supabase)을 설정하라.");
  }
  dbPath = p;
  return db;
}

export function now(): string {
  return new Date().toISOString();
}

export function rowToListing(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: r.id,
    title: r.title,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    tradeType: r.trade_type,
    deposit: r.deposit,
    rent: r.rent,
    fee: r.fee,
    area: r.area,
    moveIn: r.move_in,
    options: JSON.parse(String(r.options_json ?? "[]")),
    description: r.description,
    publisher: r.publisher,
    verification: { identity: false, ownershipDoc: false },
    synthetic: true,
    editable: true,
  };
}
