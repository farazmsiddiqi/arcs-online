import { useEffect, useRef, useState } from "react";
import { boundedCamera, frameCamera } from "./cameraFraming.js";
export default function useMapCamera(system, centers, slots, pieces) {
  const [camera, setCamera] = useState({ x: 1264, y: 888, z: 1 });
  const current = useRef(camera),
    goal = useRef(camera),
    animation = useRef(null),
    svg = useRef(null),
    pan = useRef(null),
    suppress = useRef(false),
    tour = useRef(null);
  const cancelTour = () => {
    clearTimeout(tour.current);
    tour.current = null;
  };
  const move = (next, duration = 0) => {
    cancelAnimationFrame(animation.current);
    const target = boundedCamera(next),
      from = current.current,
      begin = performance.now();
    goal.current = target;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (now) => {
      const t =
          duration && !reduced ? Math.min(1, (now - begin) / duration) : 1,
        k = 1 - Math.pow(1 - t, 3);
      const v = {
        x: from.x + (target.x - from.x) * k,
        y: from.y + (target.y - from.y) * k,
        z: from.z + (target.z - from.z) * k,
      };
      current.current = v;
      svg.current?.setAttribute(
        "viewBox",
        `${v.x - 1264 / v.z} ${v.y - 888 / v.z} ${2528 / v.z} ${1776 / v.z}`,
      );
      if (t < 1) animation.current = requestAnimationFrame(tick);
      else setCamera(v);
    };
    animation.current = requestAnimationFrame(tick);
  };
  const frame = (ids, close = false, duration = 650) => {
    const next = frameCamera(ids, centers, slots, pieces, close);
    if (next) move(next, duration);
  };
  const focus = (id) => {
    cancelTour();
    frame([id], true, 650);
  };
  const frameSystems = (ids) => {
    cancelTour();
    frame(ids);
  };
  const follow = (effects) => {
    cancelTour();
    const ids = [
      ...new Set(effects.flatMap((e) => [e.from, e.system]).filter(Boolean)),
    ];
    frame(ids, false, 650);
    const destination = effects.find((e) => e.kind === "move")?.system;
    if (destination && ids.length > 1)
      tour.current = setTimeout(() => frame([destination], true, 900), 850);
  };
  const zoom = (factor) => {
    cancelTour();
    move({ ...current.current, z: goal.current.z * factor }, 280);
  };
  const reset = () => {
    cancelTour();
    move({ x: 1264, y: 888, z: 1 }, 650);
  };
  useEffect(() => {
    if (system) frame([system], true, 750);
  }, [system]);
  useEffect(
    () => () => {
      cancelAnimationFrame(animation.current);
      cancelTour();
    },
    [],
  );
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e) => {
      e.preventDefault();
      cancelTour();
      const matrix = el.getScreenCTM();
      if (!matrix) return;
      const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(
          matrix.inverse(),
        ),
        old = current.current;
      const delta =
          e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 500 : 1),
        z = Math.max(
          1,
          Math.min(4, goal.current.z * Math.exp(-delta * 0.0015)),
        ),
        ratio = old.z / z;
      move(
        {
          z,
          x: point.x + (old.x - point.x) * ratio,
          y: point.y + (old.y - point.y) * ratio,
        },
        150,
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const handlers = {
    onPointerDown: (e) => {
      if (e.button !== 1 && e.target.closest("[data-system]")) return;
      if (current.current.z <= 1) return;
      cancelTour();
      cancelAnimationFrame(animation.current);
      const matrix = svg.current.getScreenCTM().inverse(),
        p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix);
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
    follow,
    cancelTour,
    viewBox: `${camera.x - 1264 / camera.z} ${camera.y - 888 / camera.z} ${2528 / camera.z} ${1776 / camera.z}`,
  };
}
