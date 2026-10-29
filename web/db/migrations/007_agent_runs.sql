-- 007 agent_runs 실행 상태·모델·중복 방지. 과거 행은 보존한다.
-- 중복 키: 같은 방·같은 트리거·같은 에이전트는 1행만 둔다.

ALTER TABLE agent_runs ADD COLUMN model TEXT NOT NULL DEFAULT '';
ALTER TABLE agent_runs ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE agent_runs ADD COLUMN latency_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_runs ADD COLUMN error TEXT NOT NULL DEFAULT '';
ALTER TABLE agent_runs ADD COLUMN usage_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE agent_runs ADD COLUMN message_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_dedupe ON agent_runs (room_id, trigger_msg_id, agent_type);
