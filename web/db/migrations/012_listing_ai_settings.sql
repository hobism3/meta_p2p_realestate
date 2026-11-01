-- P1: Owner-managed AI delegate policy, never enabled by default.
CREATE TABLE IF NOT EXISTS listing_ai_settings (
  listing_id TEXT PRIMARY KEY REFERENCES custom_listings(id) ON DELETE CASCADE,
  ai_enabled INTEGER NOT NULL DEFAULT 0 CHECK(ai_enabled IN (0,1)),
  visit_mode TEXT NOT NULL DEFAULT 'approval' CHECK(visit_mode IN ('approval','manual')),
  availability_json TEXT NOT NULL DEFAULT '[]',
  rules_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
