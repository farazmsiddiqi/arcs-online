import { useEffect, useRef } from "react";
// Pointer-driven polish stays out of React's render loop.
export default function useCardTilt() {
  const pending = useRef(null),
    active = useRef(null);
  const reset = () => {
    cancelAnimationFrame(pending.current);
    if (active.current) {
      for (const key of [
        "--card-rx",
        "--card-ry",
        "--card-light-x",
        "--card-light-y",
      ])
        active.current.style.removeProperty(key);
      active.current = null;
    }
  };
  useEffect(() => reset, []);
  return {
    onPointerMove(e) {
      if (
        e.pointerType !== "mouse" ||
        matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        return;
      const el = e.currentTarget,
        x = e.clientX,
        y = e.clientY;
      active.current = el;
      cancelAnimationFrame(pending.current);
      pending.current = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect(),
          px = Math.max(0, Math.min(1, (x - r.x) / r.width)),
          py = Math.max(0, Math.min(1, (y - r.y) / r.height));
        el.style.setProperty("--card-rx", `${(0.5 - py) * 7}deg`);
        el.style.setProperty("--card-ry", `${(px - 0.5) * 7}deg`);
        el.style.setProperty("--card-light-x", `${px * 100}%`);
        el.style.setProperty("--card-light-y", `${py * 100}%`);
      });
    },
    onPointerLeave: reset,
    onBlur: reset,
  };
}
