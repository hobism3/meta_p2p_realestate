import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { demoGreeting, moveInText, priceText, scenarioFor } from "../lib/demo.ts";


/** VS-4C.2 첫인사 회귀: 날짜 원문 노출 금지, 한국어 표기. */
describe("demo greeting", () => {
  it("ISO 날짜를 한국어 표기로 바꾼다", () => {
    assert.equal(moveInText("2027-01-10"), "2027년 1월 10일");
    assert.equal(moveInText(""), "협의 가능");
  });
  it("s23 첫인사에 2027-01-10 원문이 없다", async () => {
    const { listingForDemo } = await import("../lib/demo.ts");
    const l = await listingForDemo("s23");
    assert.ok(l);
    const g = demoGreeting(l);
    assert.ok(!g.includes("2027-01-10"), g);
    assert.ok(g.includes("2027년 1월 10일"), g);
    assert.ok(g.includes(priceText(l)), g);
  });
  it("시나리오 입주일도 같은 표기를 쓴다", async () => {
    const { listingForDemo } = await import("../lib/demo.ts");
    const l = await listingForDemo("s23");
    assert.ok(l);
    const sc = scenarioFor(l);
    assert.equal(sc.facts["입주일"], "2027년 1월 10일");
  });
});
