import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { CARDS, ACTION_CARDS } from "../game/data.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  readFileSync(resolve(root, "docs/assets-integrity.json"), "utf8"),
);
const files = new Set(manifest.files.map((entry) => entry.file));
for (const id of Object.keys(CARDS))
  assert.ok(files.has(`public/assets/cards/${id}.webp`), `Missing card ${id}`);
for (const id of Object.keys(ACTION_CARDS))
  assert.ok(files.has(`public/assets/${id}.webp`), `Missing action card ${id}`);
for (const entry of manifest.files) {
  assert.ok(
    entry.file.startsWith("public/assets/") &&
      !entry.file.split("/").includes(".."),
    "Invalid asset path",
  );
  const bytes = readFileSync(resolve(root, entry.file));
  assert.equal(bytes.length, entry.bytes, `Incorrect size: ${entry.file}`);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    entry.sha256,
    `Changed asset: ${entry.file}`,
  );
  if (entry.file.endsWith(".webp")) {
    assert.equal(bytes.subarray(0, 4).toString(), "RIFF", entry.file);
    assert.equal(bytes.subarray(8, 12).toString(), "WEBP", entry.file);
  }
}
mkdirSync(resolve(root, "work"), { recursive: true });
console.log(
  `Verified ${manifest.files.length} bundled assets, including ${Object.keys(CARDS).length + Object.keys(ACTION_CARDS).length} card images.`,
);
