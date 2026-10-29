-- 010 방문 제안 출처·결정 기록. AI 시연 제안을 실제 예약과 구분한다.

ALTER TABLE visits ADD COLUMN proposed_by TEXT NOT NULL DEFAULT '';
ALTER TABLE visits ADD COLUMN source_msg_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE visits ADD COLUMN decided_by TEXT NOT NULL DEFAULT '';
ALTER TABLE visits ADD COLUMN decided_at TEXT NOT NULL DEFAULT '';
