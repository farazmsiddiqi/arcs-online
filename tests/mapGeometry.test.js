import test from "node:test";
import assert from "node:assert/strict";
import { CENTERS, slotCoords, areas } from "../src/mapGeometry.js";
// Sample the artwork paths to test containment, including the curved gate ring.
function polygon(path) {
  const tokens = path.match(/[MLHVCZ]|-?\d+(?:\.\d+)?/g),
    points = [];
  let x = 0,
    y = 0,
    cmd;
  const read = () => Number(tokens.shift());
  while (tokens.length) {
    if (/[A-Z]/.test(tokens[0])) cmd = tokens.shift();
    if (cmd === "Z") break;
    if (cmd === "C") {
      const x0 = x,
        y0 = y,
        x1 = read(),
        y1 = read(),
        x2 = read(),
        y2 = read();
      x = read();
      y = read();
      for (let i = 1; i <= 20; i++) {
        const t = i / 20,
          u = 1 - t;
        points.push([
          u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x,
          u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y,
        ]);
      }
      continue;
    }
    if (cmd === "H") x = read();
    else if (cmd === "V") y = read();
    else {
      x = read();
      y = read();
    }
    points.push([x, y]);
  }
  return points.map(([x, y]) => [(x * 2528) / 1867, (y * 1776) / 1312]);
}
function inside([x, y], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = poly[i],
      [d, e] = poly[j];
    if (b > y !== e > y && x < ((d - a) * (y - b)) / (e - b) + a) c = !c;
  }
  return c;
}
const masks = areas.map(polygon);
for (let cluster = 1; cluster <= 6; cluster++)
  test(`cluster ${cluster} mask covers only its own system and building positions`, () => {
    for (const [id, center] of Object.entries(CENTERS))
      assert.equal(
        inside(center, masks[cluster - 1]),
        Number(id[0]) === cluster,
        `${id} fleet must be ${Number(id[0]) === cluster ? "covered" : "clear"}`,
      );
    for (const [id, slots] of Object.entries(slotCoords))
      for (const pt of slots)
        assert.equal(
          inside(pt, masks[cluster - 1]),
          Number(id[0]) === cluster,
          `${id} building must be ${Number(id[0]) === cluster ? "covered" : "clear"}`,
        );
  });
