-- 011 양측 합의 제안·승인. room_conditions·history는 그대로 둔다.
-- 제안(proposed, 동의 대기 중) → 양측 동의(agreed) | 거절(refused) | 변경됨(superseded).
-- 과거 동의 재사용 금지: 조건이 바뀌면 새 버전 제안이 생기고 이전 열린 제안은 superseded.

CREATE TABLE IF NOT EXISTS room_proposals (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  source_msg_ids TEXT NOT NULL DEFAULT '[]',
  visit_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'proposed',
  card_msg_id TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_proposals_room ON room_proposals (room_id);
CREATE INDEX IF NOT EXISTS idx_proposals_room_name ON room_proposals (room_id, name);

CREATE TABLE IF NOT EXISTS proposal_approvals (
  proposal_id TEXT NOT NULL REFERENCES room_proposals(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'human',
  decision TEXT NOT NULL DEFAULT 'agree',
  created_at TEXT NOT NULL,
  PRIMARY KEY (proposal_id, actor_id)
);
CREATE INDEX IF NOT EXISTS idx_approvals_proposal ON proposal_approvals (proposal_id);
