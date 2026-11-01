-- P2: durable, listing-scoped owner AI delegate run and owner review inbox.
-- Any owner AI invocation is idempotent by room and human trigger message.
CREATE TABLE IF NOT EXISTS owner_ai_runs (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  trigger_msg_id TEXT NOT NULL,
  reply_msg_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(room_id, trigger_msg_id)
);
CREATE INDEX IF NOT EXISTS idx_owner_ai_runs_room ON owner_ai_runs(room_id);

CREATE TABLE IF NOT EXISTS owner_ai_requests (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES custom_listings(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  trigger_msg_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'unknown',
  question TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','answered')),
  response_msg_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  answered_at TEXT NOT NULL DEFAULT '',
  UNIQUE(room_id, trigger_msg_id)
);
CREATE INDEX IF NOT EXISTS idx_owner_requests_listing_status ON owner_ai_requests(listing_id,status,created_at);
