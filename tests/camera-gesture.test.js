import test from "node:test";
import assert from "node:assert/strict";
import { wheelCamera } from "../src/cameraGesture.js";
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const base = { x: 1264, y: 888, z: 2 };
const point = { x: 1450, y: 980 };
test("pinch zoom anchors the visible board point under the pointer", () => {
  const next = wheelCamera(base, point, { deltaY: -12, ctrlKey: true });
  close((point.x - base.x) * base.z, (point.x - next.x) * next.z);
  close((point.y - base.y) * base.z, (point.y - next.y) * next.z);
  assert.ok(next.z > base.z);
});
test("hundreds of tiny trackpad deltas accumulate without drift or dropped input", () => {
  let c = base;
  for (let i = 0; i < 250; i++)
    c = wheelCamera(c, point, { deltaY: -0.1, ctrlKey: true });
  const once = wheelCamera(base, point, { deltaY: -25, ctrlKey: true });
  for (const k of ["x", "y", "z"]) close(c[k], once[k]);
  for (let i = 0; i < 250; i++)
    c = wheelCamera(c, point, { deltaY: 0.1, ctrlKey: true });
  for (const k of ["x", "y", "z"]) close(c[k], base[k]);
});
test("reversing a gesture reverses zoom immediately, including at both limits", () => {
  let c = wheelCamera(base, point, { deltaY: -1000, ctrlKey: true });
  assert.equal(c.z, 4);
  let next = wheelCamera(c, point, { deltaY: 1, ctrlKey: true });
  assert.ok(next.z < c.z);
  c = wheelCamera(next, point, { deltaY: 1000, ctrlKey: true });
  assert.equal(c.z, 1);
  next = wheelCamera(c, point, { deltaY: -1, ctrlKey: true });
  assert.ok(next.z > c.z);
});
test("wheel delta units normalize consistently and pinch has distinct sensitivity", () => {
  const px = wheelCamera(base, point, { deltaY: -16, deltaMode: 0 });
  const line = wheelCamera(base, point, { deltaY: -1, deltaMode: 1 });
  const page = wheelCamera(base, point, { deltaY: -0.032, deltaMode: 2 });
  assert.deepEqual(px, line);
  assert.deepEqual(px, page);
  assert.ok(wheelCamera(base, point, { deltaY: -16, ctrlKey: true }).z > px.z);
  assert.deepEqual(wheelCamera(base, point, { deltaY: NaN }), base);
});
