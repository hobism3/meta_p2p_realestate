-- P3: real-property visitor booking requests with owner approval, no external notifications.
-- A booking reserves two adjacent half-hour inventory cells for exactly 60 minutes.
-- This lock table prevents overlaps (13:00 vs 13:30), not merely identical starts.
CREATE TABLE IF NOT EXISTS owner_visit_bookings (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES custom_listings(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  requester_id TEXT NOT NULL,
  visit_date TEXT NOT NULL,
  visit_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK(status IN ('requested','confirmed','declined','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  decided_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_owner_visit_listing_status
  ON owner_visit_bookings(listing_id,status,visit_date,visit_time);
CREATE INDEX IF NOT EXISTS idx_owner_visit_room
  ON owner_visit_bookings(room_id,created_at);

CREATE TABLE IF NOT EXISTS owner_visit_slot_locks (
  listing_id TEXT NOT NULL REFERENCES custom_listings(id) ON DELETE CASCADE,
  visit_date TEXT NOT NULL,
  slot_time TEXT NOT NULL,
  booking_id TEXT NOT NULL REFERENCES owner_visit_bookings(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id,visit_date,slot_time)
);
CREATE INDEX IF NOT EXISTS idx_owner_visit_slot_booking
  ON owner_visit_slot_locks(booking_id);
