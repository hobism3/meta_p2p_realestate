-- 005 AI 시연·집톡이 기반. 작성자 유형은 서버가 확정한다.
-- user_metadata.role·클라이언트 입력은 권한·유형 근거로 쓰지 않는다.

ALTER TABLE messages ADD COLUMN author_type TEXT NOT NULL DEFAULT 'human';

CREATE TABLE IF NOT EXISTS demo_scenarios (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listing_keys(id) ON DELETE CASCADE,
  persona TEXT NOT NULL DEFAULT '',
  facts_json TEXT NOT NULL DEFAULT '{}',
  negotiable_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenarios_listing ON demo_scenarios (listing_id);

CREATE TABLE IF NOT EXISTS room_agents (
  room_id TEXT NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  side TEXT NOT NULL,
  scenario_id TEXT NOT NULL REFERENCES demo_scenarios(id) ON DELETE CASCADE,
  disclosure_label TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (room_id, side)
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  trigger_msg_id TEXT NOT NULL DEFAULT '',
  prompt_version TEXT NOT NULL DEFAULT 'mock-v1',
  provider TEXT NOT NULL DEFAULT 'mock',
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_room ON agent_runs (room_id);
