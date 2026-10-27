-- 001 초기 스키마. 신규 DB용. 표준 문법만 사용.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listing_keys (
  id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS custom_listings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  address TEXT NOT NULL,
  lat REAL NOT NULL DEFAULT 37.4835,
  lng REAL NOT NULL DEFAULT 126.9285,
  trade_type TEXT NOT NULL,
  deposit INTEGER NOT NULL DEFAULT 0,
  rent INTEGER NOT NULL DEFAULT 0,
  fee INTEGER NOT NULL DEFAULT 0,
  area REAL NOT NULL,
  move_in TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  publisher TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_listing ON messages (listing_id);

CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  visit_date TEXT NOT NULL,
  visit_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '제안됨',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visits_listing ON visits (listing_id);

CREATE TABLE IF NOT EXISTS agreements (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agreements_listing ON agreements (listing_id);

CREATE TABLE IF NOT EXISTS checklist (
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (listing_id, item)
);

CREATE TABLE IF NOT EXISTS condition_drafts (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  value_text TEXT NOT NULL,
  source_msg_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT '초안',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drafts_listing ON condition_drafts (listing_id);

CREATE TABLE IF NOT EXISTS confirmations (
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  condition_id TEXT NOT NULL,
  landlord INTEGER NOT NULL DEFAULT 0,
  tenant INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (listing_id, condition_id)
);

CREATE TABLE IF NOT EXISTS change_events (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  condition_id TEXT NOT NULL,
  old_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT '',
  msg_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
