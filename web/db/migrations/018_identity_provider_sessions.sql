-- Trusted external identity-provider adapter state. Pending attempts cannot be
-- promoted by a browser-provided boolean. The callback uses a server-only HMAC.
CREATE TABLE IF NOT EXISTS identity_provider_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider_session_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','verified','rejected','expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT '',
  UNIQUE(provider_session_id)
);
CREATE INDEX IF NOT EXISTS idx_identity_provider_user
 ON identity_provider_sessions(user_id,created_at);
