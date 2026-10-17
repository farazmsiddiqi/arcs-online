import { MAP } from "../game/data.js";
import { CENTERS, slotCoords } from "./mapGeometry.js";

export const WORLD_PALETTES = {
  material: "#e3ba81",
  fuel: "#a4d5c0",
  weapon: "#dc8a78",
  relic: "#dec28b",
  psionic: "#a9bce7",
  gate: "#9fcbd1",
};
export function worldScenery(clusters, overrides = {}) {
  return Object.values(MAP)
    .filter((s) => clusters.includes(s.cluster))
    .map((s) => {
      const [x, y] = CENTERS[s.id],
        slots = slotCoords[s.id] ?? [];
      const anchor = slots.length
        ? [
            slots.reduce((n, p) => n + p[0], 0) / slots.length,
            slots.reduce((n, p) => n + p[1], 0) / slots.length,
          ]
        : [x, y];
      const kind = overrides[s.id] ?? s.resource ?? "gate";
      return {
        id: s.id,
        cluster: s.cluster,
        x: anchor[0],
        y: anchor[1],
        kind,
        color: WORLD_PALETTES[kind],
        phase: -(s.cluster * 2 + Object.keys(MAP).indexOf(s.id)),
      };
    });
}
export function quietEncounter(worlds, sequence) {
  if (!worlds.length) return null;
  const world = worlds[(sequence * 7 + 3) % worlds.length];
  return {
    world,
    kind: ["wanderer", "comet", "courier"][sequence % 3],
    sequence,
  };
}
export const REACH_STARS = Array.from({ length: 32 }, (_, i) => ({
  x: 70 + ((i * 479 + 31) % 2380),
  y: 55 + ((i * 313 + 71) % 1640),
  radius: i % 5 === 0 ? 2.8 : 1.4,
  delay: -(i % 13),
}));
