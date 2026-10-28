-- 004 M1-B 독립 거래방. Listing과 Room 분리.
-- 기존 공용 스레드(room_id IS NULL)는 그대로 두며, 새 개인방에 자동 귀속시키지 않는다.
-- 체크리스트는 방 전용 테이블을 쓴다(기존 PK 충돌 방지).

CREATE TABLE IF NOT EXISTS deal_rooms (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rooms_listing ON deal_rooms (listing_id);

CREATE TABLE IF NOT EXISTS room_members (
  room_id TEXT NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tenant',
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_room ON room_members (room_id);

CREATE TABLE IF NOT EXISTS room_checklist (
  room_id TEXT NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (room_id, item)
);

ALTER TABLE messages ADD COLUMN room_id TEXT DEFAULT NULL;
ALTER TABLE visits ADD COLUMN room_id TEXT DEFAULT NULL;
ALTER TABLE agreements ADD COLUMN room_id TEXT DEFAULT NULL;
