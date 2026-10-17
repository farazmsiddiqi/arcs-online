// C-5: ways to get a player's attention when the tab is in the background.
//
// Only the title flash and the chime. No Notification API (out of scope).

const tabUnfocused = () => document.hidden || !document.hasFocus();

let flashing = null;

function stopFlash() {
  if (!flashing) return;
  clearInterval(flashing.timer);
  window.removeEventListener("focus", stopFlash);
  document.removeEventListener("visibilitychange", onVisible);
  document.title = flashing.base;
  flashing = null;
}
function onVisible() {
  if (!tabUnfocused()) stopFlash();
}

// Alternate the tab title with `label` until the player comes back to the
// tab. Does nothing while the tab is focused, since the player can see the
// table. A newer label replaces the one showing.
export function flashTitle(label) {
  if (!tabUnfocused()) return;
  if (flashing) {
    flashing.label = label;
    return;
  }
  const base = document.title;
  let on = true;
  flashing = { base, label };
  document.title = `${label} · ${base}`;
  flashing.timer = setInterval(() => {
    on = !on;
    document.title = on ? `${flashing.label} · ${base}` : base;
  }, 1000);
  window.addEventListener("focus", stopFlash);
  document.addEventListener("visibilitychange", onVisible);
}

export { readSound, writeSound } from "./gameAudio.js";
import { playCue } from "./gameAudio.js";
export const chime = () => playCue("turn");
