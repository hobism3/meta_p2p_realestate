import { test } from "node:test";
import assert from "node:assert/strict";
import { safeAuthDestination } from "../lib/auth-return.ts";

test("authentication return path is restricted to this site", () => {
  assert.equal(safeAuthDestination("/register"), "/register");
  assert.equal(safeAuthDestination("/register?edit=synthetic-id"), "/register?edit=synthetic-id");
  assert.equal(safeAuthDestination("/owner"), "/owner");
  assert.equal(safeAuthDestination(""), "/");
  assert.equal(safeAuthDestination("//attacker.invalid/path"), "/");
  assert.equal(safeAuthDestination("https://attacker.invalid/register"), "/");
  assert.equal(safeAuthDestination("/%2f%2fattacker.invalid"), "/");
  assert.equal(safeAuthDestination("/%5cattacker.invalid"), "/");
  assert.equal(safeAuthDestination("/\\attacker.invalid"), "/");
  assert.equal(safeAuthDestination("/register\nLocation:https://evil.invalid"), "/");
  assert.equal(safeAuthDestination("/" + "x".repeat(1200)), "/");
});
