-- 009 조건 사용자 확인. 확정은 사람만 한다. 집톡이·AI는 confirmed를 만들지 않는다.
-- 값이 바뀌면 version이 올라가서 이전 확인(confirmed_version)은 자동으로 무효가 된다.

ALTER TABLE room_conditions ADD COLUMN confirmed_by TEXT NOT NULL DEFAULT '';
ALTER TABLE room_conditions ADD COLUMN confirmed_at TEXT NOT NULL DEFAULT '';
ALTER TABLE room_conditions ADD COLUMN confirmed_version INTEGER NOT NULL DEFAULT 0;
