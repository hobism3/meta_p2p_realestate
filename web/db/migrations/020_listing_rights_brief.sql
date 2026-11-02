-- P14: owner-shared, unverified structured registry facts only.
-- No original certificate PDF/text, names, address, identifiers, free-text notes,
-- legal-safe ranking, creditor details or automatic ownership verification.
CREATE TABLE IF NOT EXISTS listing_rights_briefs (
 listing_id TEXT PRIMARY KEY REFERENCES custom_listings(id) ON DELETE CASCADE,
 source_kind TEXT NOT NULL DEFAULT 'owner_local_review',
 issued_on TEXT NOT NULL DEFAULT '',
 rights_json TEXT NOT NULL DEFAULT '[]',
 shared_by TEXT NOT NULL,
 shared_at TEXT NOT NULL,
 CHECK(source_kind='owner_local_review')
);
