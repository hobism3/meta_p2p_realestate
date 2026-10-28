-- 003 M1-A 신원·소유권. 기존 데이터 보존(기본값 '').
-- user_metadata.role은 권한 근거로 쓰지 않는다. 소유자·참여자는 서버 DB가 정한다.

ALTER TABLE custom_listings ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN user_id TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS listing_participants (
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tenant',
  PRIMARY KEY (listing_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_participants_listing ON listing_participants (listing_id);
