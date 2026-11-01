-- P3 durable owner-AI work. A committed human message owns exactly one job.
-- Crash recovery: processing has an expiring lease. Execution is safe to replay
-- because owner_ai_runs uses UNIQUE(room_id, trigger_msg_id).
-- status=failed is terminal but visible to the owner; never silently discard.
CREATE TABLE IF NOT EXISTS owner_ai_jobs (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES custom_listings(id) ON DELETE CASCADE,
  trigger_msg_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  caller_id TEXT NOT NULL,
  policy_updated_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','processing','completed','disabled','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  lease_until TEXT NOT NULL DEFAULT '',
  reply_msg_id TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT '',
  UNIQUE(room_id,trigger_msg_id)
);
CREATE INDEX IF NOT EXISTS idx_owner_jobs_queue ON owner_ai_jobs(status,available_at,created_at);
CREATE INDEX IF NOT EXISTS idx_owner_jobs_room ON owner_ai_jobs(room_id,created_at);
CREATE INDEX IF NOT EXISTS idx_owner_jobs_listing ON owner_ai_jobs(listing_id,status,updated_at);
