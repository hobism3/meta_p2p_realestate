// rate limit 단위 테스트. 서버 없이 순수 로직만 검증.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allow } from "../lib/ratelimit.ts";

describe("rate limit", () => {
  it("제한 내에서는 통과한다", () => {
    const store = new Map();
    assert.equal(allow(store, "a", 0, 2).ok, true);
    assert.equal(allow(store, "a", 1000, 2).ok, true);
  });
  it("초과하면 차단하고 재시도 시간을 준다", () => {
    const store = new Map();
    allow(store, "a", 0, 1);
    const r = allow(store, "a", 1000, 1);
    assert.equal(r.ok, false);
    assert.ok(r.retryAfter > 0);
  });
  it("윈도우가 지나면 초기화된다", () => {
    const store = new Map();
    allow(store, "a", 0, 1);
    assert.equal(allow(store, "a", 61_000, 1).ok, true);
  });
  it("키별로 따로 센다", () => {
    const store = new Map();
    allow(store, "a", 0, 1);
    assert.equal(allow(store, "b", 0, 1).ok, true);
  });
});
