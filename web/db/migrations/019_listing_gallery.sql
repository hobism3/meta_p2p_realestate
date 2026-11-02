-- P13: published-only, redacted, client-reencoded JPEG derivatives.
-- Explicitly NO original photographs, AI-generated empty-room images, OCR,
-- user full names or raw GPS EXIF retained here.  Small PoC implementation;
-- migrate binaries to a private, controlled object store before large scale.
CREATE TABLE IF NOT EXISTS listing_gallery_photos (
 id TEXT PRIMARY KEY,
 listing_id TEXT NOT NULL REFERENCES custom_listings(id) ON DELETE CASCADE,
 image_base64 TEXT NOT NULL,
 image_sha256 TEXT NOT NULL,
 room TEXT NOT NULL DEFAULT 'unknown'
   CHECK(room IN ('living_room','bedroom','kitchen','bathroom','entrance','balcony','other','unknown')),
 masked INTEGER NOT NULL DEFAULT 0 CHECK(masked IN (0,1)),
 display_order INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 UNIQUE(listing_id,image_sha256)
);
CREATE INDEX IF NOT EXISTS idx_listing_gallery_public
 ON listing_gallery_photos(listing_id,display_order,created_at);
