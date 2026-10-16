import test from "node:test";
import assert from "node:assert/strict";
import {
  affectsSeat,
  freshNotices,
  MAX_TOASTS,
  newestNotice,
} from "../src/notices.js";

// C-5: the browser shows a notice once, keyed on its `at`, not on list length.
const n = (at, p) => ({ text: `notice ${at}`, at, p });

test("a first visit shows no history and remembers where it ends", () => {
  const list = [n(10), n(20), n(30)];
  assert.deepEqual(freshNotices(list, null), []);
  assert.equal(newestNotice(list), 30);
  assert.equal(newestNotice([]), 0);
  assert.equal(newestNotice(undefined), 0);
});

test("only notices newer than the last one seen come back, oldest first", () => {
  const list = [n(30), n(10), n(20), n(40)];
  assert.deepEqual(
    freshNotices(list, 20).map((x) => x.at),
    [30, 40],
  );
  assert.deepEqual(freshNotices(list, 40), []);
  assert.deepEqual(
    freshNotices(list, 0).map((x) => x.at),
    [10, 20, 30, 40],
  );
});

test("a full list of 20 still yields the new notice: length never changes but `at` does", () => {
  const before = Array.from({ length: 20 }, (_, i) => n(100 + i));
  const after = [...before.slice(1), n(200)];
  assert.equal(before.length, after.length);
  assert.deepEqual(
    freshNotices(after, newestNotice(before)).map((x) => x.at),
    [200],
  );
});

test("after a reconnect only the notices missed in between are new", () => {
  const seen = 120;
  const list = Array.from({ length: 20 }, (_, i) => n(110 + i));
  assert.deepEqual(
    freshNotices(list, seen).map((x) => x.at),
    [121, 122, 123, 124, 125, 126, 127, 128, 129],
  );
  assert.ok(MAX_TOASTS >= 1);
});

test("malformed entries are ignored; only notices about this seat flash its tab", () => {
  assert.deepEqual(freshNotices([{ text: "x" }, n(5)], 0), [n(5)]);
  assert.deepEqual(freshNotices(undefined, 0), []);
  const fresh = [n(1, 0), n(2, 1), n(3), n(4, null), n(5, 1)];
  assert.deepEqual(
    affectsSeat(fresh, 1).map((x) => x.at),
    [2, 5],
  );
  assert.deepEqual(affectsSeat(fresh, 2), []);
});
