import test from "node:test";
import assert from "node:assert/strict";
import { duration } from "../src/duration.js";

test("clock readings: m:ss under an hour, h:mm:ss from an hour, + for overtime", () => {
  assert.equal(duration(0), "0:00");
  assert.equal(duration(4500), "0:05");
  assert.equal(duration(245000), "4:05");
  assert.equal(duration(3599000), "59:59");
  assert.equal(duration(3600000), "1:00:00");
  assert.equal(duration(3725000), "1:02:05");
  assert.equal(duration(86400000), "24:00:00");
  assert.equal(duration(604800000), "168:00:00");
  assert.equal(duration(-30000), "+0:30");
  assert.equal(duration(-3660000), "+1:01:00");
});
