// Locally synthesized effects: no downloads, API calls, or licensed audio assets.
// One context/master bus, unlocked by a gesture, with bounded simultaneous cues.
export const readSound = () => {
  try {
    return localStorage.getItem("arcs-sound") !== "no";
  } catch {
    return true;
  }
};
export const readVolume = () => {
  try {
    const value = localStorage.getItem("arcs-volume");
    return value === null ? 0.45 : Math.max(0, Math.min(1, Number(value) || 0));
  } catch {
    return 0.45;
  }
};
let context, master, noiseBuffer;
const voices = new Set();
export function writeSound(on) {
  try {
    localStorage.setItem("arcs-sound", on ? "yes" : "no");
  } catch {}
  updateGain();
}
export function writeVolume(value) {
  try {
    localStorage.setItem(
      "arcs-volume",
      String(Math.max(0, Math.min(1, value))),
    );
  } catch {}
  updateGain();
}
function updateGain() {
  if (master)
    master.gain.setTargetAtTime(
      readSound() ? readVolume() * 0.55 : 0,
      context.currentTime,
      0.025,
    );
}
export function unlockAudio() {
  if (!readSound()) return;
  try {
    if (!context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      context = new Audio();
      master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.ratio.value = 6;
      master.connect(compressor);
      compressor.connect(context.destination);
      noiseBuffer = context.createBuffer(
        1,
        context.sampleRate * 2,
        context.sampleRate,
      );
      const samples = noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++)
        samples[i] = Math.random() * 2 - 1;
      updateGain();
    }
    if (context.state === "suspended") context.resume().catch(() => {});
  } catch {
    /* Audio is optional; never prevent a move. */
  }
}
export function installAudioUnlock() {
  document.addEventListener("pointerdown", unlockAudio, { passive: true });
  document.addEventListener("keydown", unlockAudio);
  return () => {
    document.removeEventListener("pointerdown", unlockAudio);
    document.removeEventListener("keydown", unlockAudio);
  };
}
// One coherent cue per update. Battles dominate bookkeeping changes caused by
// their hits; card play dominates the accompanying change of turn stage.
export function actionSound(changes, events = []) {
  if (events.some((e) => e.effect?.type === "destroy")) return "destroy";
  if (changes.some((c) => c.kind === "damage" || c.kind === "battle"))
    return "battle";
  if (events.some((e) => e.effect?.type === "loot")) return "raid";
  if (changes.some((c) => c.kind === "move")) return "move";
  if (changes.some((c) => c.kind === "build")) return "build";
  if (changes.some((c) => c.kind === "repair")) return "repair";
  if (changes.some((c) => c.kind === "tax")) return "tax";
  if (changes.some((c) => c.kind === "power")) return "score";
  if (changes.some((c) => c.kind === "ambition")) return "ambition";
  if (events.some((e) => e.animation?.kind === "secure")) return "secure";
  if (changes.some((c) => ["play", "cards", "hand"].includes(c.kind)))
    return "card";
  if (
    changes.some((c) =>
      ["court", "influence", "captives", "trophies"].includes(c.kind),
    )
  )
    return "agent";
  if (changes.some((c) => c.kind === "resource")) return "resource";
  if (changes.some((c) => c.kind === "reshape")) return "repair";
  return changes.length || events.length ? "step" : null;
}
export function playCue(kind, { reverse = false } = {}) {
  if (
    !kind ||
    !readSound() ||
    !context ||
    context.state !== "running" ||
    document.hidden
  )
    return;
  if (voices.size > 32) return;
  const now = context.currentTime;
  function voice(type, from, to, duration, gain = 0.15, delay = 0) {
    const source =
      type === "noise"
        ? context.createBufferSource()
        : context.createOscillator();
    const filter = context.createBiquadFilter(),
      envelope = context.createGain();
    if (type === "noise") {
      source.buffer = noiseBuffer;
      filter.type = "bandpass";
      filter.Q.value = 0.7;
    } else {
      source.type = type;
      filter.type = "lowpass";
      filter.frequency.value = 3000;
    }
    const frequency = type === "noise" ? filter.frequency : source.frequency;
    const start = now + delay;
    frequency.setValueAtTime(reverse ? to : from, start);
    frequency.exponentialRampToValueAtTime(
      Math.max(20, reverse ? from : to),
      start + duration,
    );
    envelope.gain.setValueAtTime(0.001, start);
    envelope.gain.exponentialRampToValueAtTime(
      gain,
      start + Math.min(0.06, duration / 4),
    );
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    voices.add(source);
    source.onended = () => {
      voices.delete(source);
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
    source.start(start);
    source.stop(start + duration + 0.02);
  }
  try {
    if (kind === "move") {
      voice("sawtooth", 55, 160, 1.35, 0.12);
      voice("noise", 140, 2400, 1.45, 0.3);
      voice("sine", 180, 55, 0.5, 0.15, 0.85);
    } else if (kind === "battle" || kind === "destroy") {
      for (let i = 0; i < 3; i++)
        voice("sawtooth", 1200 - i * 130, 90, 0.22, 0.13, i * 0.14);
      voice("noise", 1700, 55, kind === "destroy" ? 1.35 : 0.7, 0.5, 0.3);
      voice("sine", 130, 32, 0.85, 0.35, 0.32);
    } else if (kind === "build") {
      [0, 0.18, 0.36].forEach((t) => voice("noise", 2400, 360, 0.15, 0.2, t));
      voice("triangle", 90, 440, 1, 0.18, 0.2);
      voice("sine", 660, 660, 0.4, 0.15, 0.95);
    } else if (["repair", "secure", "ambition", "score"].includes(kind)) {
      const notes =
        kind === "score" || kind === "ambition"
          ? [220, 330, 440, 660]
          : [440, 554, 660];
      notes.forEach((n, i) => voice("triangle", n, n, 0.55, 0.16, i * 0.13));
      if (kind === "repair") voice("noise", 300, 2400, 0.8, 0.09);
    } else if (["tax", "resource", "raid"].includes(kind)) {
      [660, 880, 1320].forEach((n, i) =>
        voice("sine", n, n * 0.85, 0.23, 0.16, i * 0.11),
      );
      if (kind === "raid") voice("noise", 900, 140, 0.45, 0.2);
    } else if (kind === "card") {
      voice("noise", 2800, 700, 0.18, 0.13);
      voice("sine", 150, 65, 0.1, 0.12, 0.12);
    } else if (kind === "turn") {
      voice("sine", 523, 523, 0.28, 0.12);
      voice("sine", 784, 784, 0.4, 0.12, 0.15);
    } else voice("triangle", kind === "agent" ? 320 : 240, 100, 0.13, 0.1);
  } catch {
    /* Never interrupt gameplay for unavailable browser audio. */
  }
}
