export function shortcutFor(event, { replay = false } = {}) {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return null;
  const target = event.target;
  if (
    target?.isContentEditable ||
    target?.closest?.(
      'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="slider"], [role="separator"]',
    )
  )
    return null;
  const key = event.key.toLowerCase();
  if (replay) {
    const controls = {
      arrowleft: "replay-back",
      arrowright: "replay-next",
      home: "replay-first",
      end: "replay-last",
    };
    if (controls[key]) return controls[key];
    if (key === " " && !target?.closest?.('button, a, [role="button"]'))
      return "replay-play";
    if (key === "r") return "live";
  }
  return (
    {
      c: "chat",
      r: "replay",
      h: "history",
      t: "timers",
      m: "mute",
      "?": "help",
      "+": "zoom-in",
      "=": "zoom-in",
      "-": "zoom-out",
      0: "overview",
    }[key] ?? null
  );
}
export const SHORTCUTS = [
  ["C", "Open or close table chat"],
  ["Esc", "Close chat, inspection or dialog"],
  ["R", "Open replay / return to live"],
  ["H", "Table history"],
  ["T", "Turn timers"],
  ["M", "Mute or unmute game sound"],
  ["+ / −", "Zoom map in / out"],
  ["0", "Show the whole map"],
  ["← / →", "Previous / next action in replay"],
  ["Home / End", "First / latest replay position"],
  ["Space", "Play / pause replay (when not focused on a control)"],
  ["?", "This shortcut guide"],
];
