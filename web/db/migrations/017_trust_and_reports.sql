-- P6 compliance foundations. Do not confuse account IDs or self-declarations with
-- government identity confirmation or registered ownership verification.
CREATE TABLE IF NOT EXISTS user_identity_status (
  user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (status IN ('unverified','pending','provider_verified','rejected','expired')),
  provider TEXT NOT NULL DEFAULT '',
  receipt_ref TEXT NOT NULL DEFAULT '',
  verified_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listing_authority_claims (
  listing_id TEXT PRIMARY KEY REFERENCES custom_listings(id) ON DELETE CASCADE,
  claimant_user_id TEXT NOT NULL,
  relation TEXT NOT NULL CHECK(relation IN
    ('registered_owner','co_owner','landlord_non_owner','delegated_agent','other')),
  self_attested INTEGER NOT NULL DEFAULT 1,
  attested_at TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK(verification_status IN ('unverified','pending','provider_verified','rejected','expired')),
  reviewer_ref TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_authority_claims_user
  ON listing_authority_claims(claimant_user_id,attested_at);

CREATE TABLE IF NOT EXISTS listing_reports (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN
    ('misleading_listing','suspected_impersonation','incorrect_information','personal_information','other')),
  status TEXT NOT NULL DEFAULT 'received'
    CHECK(status IN ('received','triaged','closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_by TEXT NOT NULL DEFAULT '',
  UNIQUE(listing_id,reporter_user_id,category)
);
CREATE INDEX IF NOT EXISTS idx_listing_reports_status
  ON listing_reports(status,created_at);
