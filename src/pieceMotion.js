import { CENTERS, slotCoords } from "./mapGeometry.js";
export function piecePoint(game, piece) {
  const [x, y] = CENTERS[piece?.system] ?? [0, 0];
  if (!piece) return [x, y];
  if (piece.type === "ship") {
    const i = game.pieces
      .filter((p) => p.system === piece.system && p.type === "ship")
      .findIndex((p) => p.id === piece.id);
    return [x - 54 + (i % 4) * 45, y - 13.5 + Math.floor(i / 4) * 35];
  }
  if (piece.cloud) return [x + 140, y + 80];
  const i = game.pieces
    .filter((p) => p.system === piece.system && p.type !== "ship" && !p.cloud)
    .findIndex((p) => p.id === piece.id);
  return slotCoords[piece.system]?.[i] ?? [x, y];
}
export function animationEvents(before, after) {
  const reverse = after._replay?.direction < 0;
  const source = reverse ? before : after,
    other = reverse ? after : before;
  const known = new Set((other.log ?? []).map((e) => e.id));
  return (source.log ?? []).filter((e) => !known.has(e.id));
}
