-- Real-room Jiptok notes: immutable trigger ledger and inline proposal references.
-- A note is not an agreement. Only room_proposals/proposal_approvals or real
-- owner_visit_bookings can change confirmed transaction status.
CREATE TABLE IF NOT EXISTS real_jiptok_events (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL,
  event_key TEXT NOT NULL,
  note_msg_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(room_id,event_kind,event_key)
);
CREATE INDEX IF NOT EXISTS idx_real_jiptok_room ON real_jiptok_events(room_id,created_at);
