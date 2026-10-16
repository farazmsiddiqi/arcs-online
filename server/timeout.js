import { timeoutInput } from "../game/timeout-policy.js";
import { log } from "../game/engine.js";
import { applyDecision } from "./history.js";
import { addNotice, clockView, settleClock, followClock } from "./clock.js";

// One decision per tick lets every client see the result, and rechecks the
// actor, host pause/extension and turn boundary before doing anything else.
export function resolveTimeout(room, now = Date.now()) {
  const clock = clockView(room, now);
  if (
    !room.game ||
    clock.complete ||
    clock.paused ||
    clock.actor === null ||
    clock.config.mode === "off" ||
    clock.config.expiry !== "auto" ||
    clock.remainingMs === null ||
    clock.remainingMs > 0
  )
    return null;
  const copy = structuredClone(room),
    p = clock.actor;
  settleClock(copy, now);
  const marker = `${clock.key}:${p}`;
  if (!copy.clock.takeovers?.includes(marker)) {
    const text = `${copy.seats[p].name}'s timer expired. AI is completing their remaining decisions.`;
    log(copy.game, text);
    addNotice(copy, text, p, now);
    copy.clock.takeovers = [...(copy.clock.takeovers ?? []), marker].slice(-16);
  }
  const input = timeoutInput(copy.game);
  const firstLog = copy.game.log.length;
  applyDecision(copy, p, input);
  // Annotate the ordinary rules log, without exposing hidden card choices.
  for (const entry of copy.game.log.slice(firstLog)) entry.automatic = true;
  copy.history = {
    owner: null,
    steps: [],
    cursor: 0,
    reason: "Timer expired. Automatic decisions are committed.",
  };
  followClock(copy, now);
  Object.assign(room, copy);
  return { actor: p, input: { ...input, automatic: "timer" } };
}
