import { useEffect, useRef, useState } from "react";
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const bounded = (c) => {
  const z = clamp(c.z, 1, 4);
  return {
    z,
    x: clamp(c.x, 1264 / z, 2528 - 1264 / z),
    y: clamp(c.y, 888 / z, 1776 - 888 / z),
  };
};
export default function useMapCamera(system, centers, slots, pieces) {
  const [camera, setCamera] = useState({ x: 1264, y: 888, z: 1 }),
    current = useRef(camera),
    animation = useRef(null),
    svg = useRef(null),
    pan = useRef(null),
    suppress = useRef(false);
  const move = (next, animated = false) => {
    cancelAnimationFrame(animation.current);
    const target = bounded(next),
      from = current.current;
    const begin = performance.now();
    const tick = (now) => {
      const t =
          animated && !matchMedia("(prefers-reduced-motion: reduce)").matches
            ? Math.min(1, (now - begin) / 330)
            : 1,
        k = 1 - Math.pow(1 - t, 3);
      const v = {
        x: from.x + (target.x - from.x) * k,
        y: from.y + (target.y - from.y) * k,
        z: from.z + (target.z - from.z) * k,
      };
      current.current = v;
      setCamera(v);
      if (t < 1) animation.current = requestAnimationFrame(tick);
    };
    animation.current = requestAnimationFrame(tick);
  };
  const focus = (id) => {
    if (!centers[id]) return;
    const [x, y] = centers[id];
    const ships = pieces.filter((p) => p.system === id && p.type === "ship");
    // Buildings can be printed some distance from the system's fleet.
    const points = [
      [x, y],
      [x, y + Math.floor(ships.length / 4) * 35],
      ...(slots[id] ?? []),
    ];
    if (pieces.some((p) => p.system === id && p.cloud))
      points.push([x + 140, y + 80]);
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    const left = Math.min(...xs),
      right = Math.max(...xs),
      top = Math.min(...ys),
      bottom = Math.max(...ys);
    move(
      {
        x: (left + right) / 2,
        y: (top + bottom) / 2,
        z: Math.min(
          3.5,
          2528 / (right - left + 240),
          1776 / (bottom - top + 240),
        ),
      },
      true,
    );
  };
  const frameSystems = (ids) => {
    const points = ids.flatMap((id) =>
      centers[id] ? [centers[id], ...(slots[id] ?? [])] : [],
    );
    if (!points.length) return;
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    const left = Math.min(...xs),
      right = Math.max(...xs),
      top = Math.min(...ys),
      bottom = Math.max(...ys);
    move(
      {
        x: (left + right) / 2,
        y: (top + bottom) / 2,
        z: Math.min(
          3,
          2528 / (right - left + 600),
          1776 / (bottom - top + 500),
        ),
      },
      true,
    );
  };
  const zoom = (factor) =>
    move({ ...current.current, z: current.current.z * factor }, true);
  const reset = () => move({ x: 1264, y: 888, z: 1 }, true);
  const previousSystem = useRef(system);
  useEffect(() => {
    if (system) focus(system);
    else if (previousSystem.current) reset();
    previousSystem.current = system;
  }, [system]);
  useEffect(() => () => cancelAnimationFrame(animation.current), []);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e) => {
      e.preventDefault();
      const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(
          el.getScreenCTM().inverse(),
        ),
        old = current.current,
        z = clamp(old.z * Math.exp(-e.deltaY * 0.0015), 1, 4),
        ratio = old.z / z;
      move({
        z,
        x: point.x + (old.x - point.x) * ratio,
        y: point.y + (old.y - point.y) * ratio,
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const handlers = {
    onPointerDown: (e) => {
      if (e.button !== 1 && e.target.closest("[data-system]")) return;
      if (current.current.z <= 1) return;
      const matrix = svg.current.getScreenCTM().inverse();
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix);
      pan.current = {
        p,
        matrix,
        c: current.current,
        screenX: e.clientX,
        screenY: e.clientY,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    onPointerMove: (e) => {
      if (!pan.current) return;
      const d = pan.current,
        p = new DOMPoint(e.clientX, e.clientY).matrixTransform(d.matrix);
      if (Math.hypot(e.clientX - d.screenX, e.clientY - d.screenY) > 5)
        suppress.current = true;
      move({ ...d.c, x: d.c.x + d.p.x - p.x, y: d.c.y + d.p.y - p.y });
    },
    onPointerUp: () => {
      pan.current = null;
    },
    onPointerCancel: () => {
      pan.current = null;
      suppress.current = false;
    },
    onClickCapture: (e) => {
      if (suppress.current) {
        e.stopPropagation();
        suppress.current = false;
      }
    },
  };
  return {
    camera,
    svg,
    handlers,
    zoom,
    reset,
    focus,
    frameSystems,
    viewBox: `${camera.x - 1264 / camera.z} ${camera.y - 888 / camera.z} ${2528 / camera.z} ${1776 / camera.z}`,
  };
}
