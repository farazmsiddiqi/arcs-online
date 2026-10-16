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

// The 660 Hz two-tenths-of-a-second chime for "it is your turn".
export function chime() {
  try {
    const ctx = new AudioContext(),
      o = ctx.createOscillator(),
      g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.04, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    o.start();
    o.stop(ctx.currentTime + 0.25);
    o.onended = () => ctx.close();
  } catch {}
}

// The chime is on unless the player muted it. "yes" is the old opt-in value.
export const readSound = () => {
  try {
    return localStorage.getItem("arcs-sound") !== "no";
  } catch {
    return true;
  }
};
export const writeSound = (on) => {
  try {
    localStorage.setItem("arcs-sound", on ? "yes" : "no");
  } catch {}
};
