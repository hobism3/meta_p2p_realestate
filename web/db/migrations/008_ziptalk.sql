-- 008 집톡이 조건 상태. 방별로 관리한다. 매물 기준이 아니다.
-- 과거 행은 보존한다. 확정은 자동이 아니라 사용자 확인으로만 둔다(VS-3B).

CREATE TABLE IF NOT EXISTS room_conditions (
  room_id TEXT NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  proposer TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'proposed',
  source_msg_ids TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (room_id, name)
);

CREATE TABLE IF NOT EXISTS condition_history (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  old_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT '',
  source_msg_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conditions_room ON room_conditions (room_id);
CREATE INDEX IF NOT EXISTS idx_condhist_room ON condition_history (room_id);
