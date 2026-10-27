-- 002 구 스키마(외래키 없음) → 외래키 재구축. 기존 데이터 보존.
-- 001 적용 후 순서대로 실행. listing_keys는 001이 만들었으므로 여기서는 만들지 않는다.

ALTER TABLE messages RENAME TO messages_legacy_002;
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO messages SELECT * FROM messages_legacy_002;
DROP TABLE messages_legacy_002;
CREATE INDEX IF NOT EXISTS idx_messages_listing ON messages (listing_id);

ALTER TABLE visits RENAME TO visits_legacy_002;
CREATE TABLE visits (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  visit_date TEXT NOT NULL,
  visit_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '제안됨',
  created_at TEXT NOT NULL
);
INSERT INTO visits SELECT * FROM visits_legacy_002;
DROP TABLE visits_legacy_002;
CREATE INDEX IF NOT EXISTS idx_visits_listing ON visits (listing_id);

ALTER TABLE agreements RENAME TO agreements_legacy_002;
CREATE TABLE agreements (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO agreements SELECT * FROM agreements_legacy_002;
DROP TABLE agreements_legacy_002;
CREATE INDEX IF NOT EXISTS idx_agreements_listing ON agreements (listing_id);

ALTER TABLE checklist RENAME TO checklist_legacy_002;
CREATE TABLE checklist (
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (listing_id, item)
);
INSERT INTO checklist SELECT * FROM checklist_legacy_002;
DROP TABLE checklist_legacy_002;

ALTER TABLE condition_drafts RENAME TO condition_drafts_legacy_002;
CREATE TABLE condition_drafts (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  value_text TEXT NOT NULL,
  source_msg_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT '초안',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
INSERT INTO condition_drafts SELECT * FROM condition_drafts_legacy_002;
DROP TABLE condition_drafts_legacy_002;
CREATE INDEX IF NOT EXISTS idx_drafts_listing ON condition_drafts (listing_id);

ALTER TABLE confirmations RENAME TO confirmations_legacy_002;
CREATE TABLE confirmations (
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  condition_id TEXT NOT NULL,
  landlord INTEGER NOT NULL DEFAULT 0,
  tenant INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (listing_id, condition_id)
);
INSERT INTO confirmations SELECT * FROM confirmations_legacy_002;
DROP TABLE confirmations_legacy_002;

ALTER TABLE change_events RENAME TO change_events_legacy_002;
CREATE TABLE change_events (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  condition_id TEXT NOT NULL,
  old_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT '',
  msg_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
INSERT INTO change_events SELECT * FROM change_events_legacy_002;
DROP TABLE change_events_legacy_002;
