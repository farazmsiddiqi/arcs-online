import { SETUPS } from "../game/data.js";
// "3SETUP04" -> /assets/setup-3p-04.webp (art for every official setup card).
export const setupImage = (id) => {
  const match = /^(\d)SETUP(\d\d)$/.exec(id);
  return match ? `/assets/setup-${match[1]}p-${match[2]}.webp` : null;
};
// Official setups for a player count, as [id, setup] in card order.
export const setupsFor = (players) =>
  Object.entries(SETUPS)
    .filter(([, s]) => s.players === players)
    .sort(([a], [b]) => a.localeCompare(b));
