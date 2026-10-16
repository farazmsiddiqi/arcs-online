import test from "node:test";
import assert from "node:assert/strict";
import {
  clarificationsFor,
  clarificationSearchText,
  hasClarifications,
  linkParts,
} from "../src/clarifications.js";
const sources = {
  errata: [
    {
      card: "Upstart",
      errata: [{ text: "You *cannot* tax $link:Gate Ports$." }],
    },
  ],
  faq: [
    { card: "Admin Union", faq: [{ q: "Stolen once played?", a: "Never." }] },
  ],
};
test("clarifications match by card name or ARCS id", () => {
  assert.equal(
    clarificationsFor({ name: "Upstart" }, "L1", sources).errata.length,
    1,
  );
  assert.equal(
    clarificationsFor({ name: "x" }, "9", {
      errata: [{ card: "ARCS-9", errata: [] }],
      faq: [],
    }).errata.length,
    1,
  );
  assert.ok(hasClarifications({ name: "Admin Union" }, "BC1", sources));
  assert.ok(!hasClarifications({ name: "Other" }, "BC2", sources));
});
test("search text covers errata and FAQ, with markup removed", () => {
  assert.match(
    clarificationSearchText({ name: "Upstart" }, "L1", sources),
    /cannot tax gate ports/,
  );
  assert.match(
    clarificationSearchText({ name: "Admin Union" }, "BC1", sources),
    /stolen once played\? never/,
  );
  assert.equal(clarificationSearchText({ name: "Other" }, "BC2", sources), "");
});
test("link references become card links when the name resolves", () => {
  const ids = { "Gate Ports": "L5" };
  assert.deepEqual(
    linkParts("See $link:Gate Ports$ and $link:Nope$.", (n) => ids[n]),
    [
      { text: "See " },
      { text: "Gate Ports", id: "L5" },
      { text: " and " },
      { text: "Nope" },
      { text: "." },
    ],
  );
  assert.deepEqual(
    linkParts("plain", () => null),
    [{ text: "plain" }],
  );
  assert.deepEqual(
    linkParts(undefined, () => null),
    [],
  );
});
