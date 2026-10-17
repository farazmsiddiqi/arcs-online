import { useEffect, useRef, useState } from "react";
import { wheelCamera } from "./cameraGesture.js";
import { boundedCamera, frameCamera } from "./cameraFraming.js";
export default function useMapCamera(system, centers, slots, pieces) {
  const [camera, setCamera] = useState({ x: 1264, y: 888, z: 1 });
  const current = useRef(camera),
    goal = useRef(camera),
    animation = useRef(null),
    svg = useRef(null),
    pan = useRef(null),
    suppress = useRef(false),
    tour = useRef(null),
    settled = useRef(null),
    manualUntil = useRef(0);
  const cancelTour = () => {
    clearTimeout(tour.current);
    tour.current = null;
  };
  const draw = (v) => {
    current.current = v;
    svg.current?.setAttribute(
      "viewBox",
      `${v.x - 1264 / v.z} ${v.y - 888 / v.z} ${2528 / v.z} ${1776 / v.z}`,
    );
  };
  const takeControl = () => {
    cancelTour();
    clearTimeout(settled.current);
    cancelAnimationFrame(animation.current);
    goal.current = current.current;
    manualUntil.current = performance.now() + 1500;
  };
  const direct = (next) => {
    const target = boundedCamera(next);
    goal.current = target;
    // Gesture input is already interpolated by the OS. Applying another easing
    // loop makes reversals fight an old target and causes the pointer to drift.
    draw(target);
    clearTimeout(settled.current);
    settled.current = setTimeout(() => setCamera(current.current), 120);
  };
  const move = (next, duration = 0) => {
    clearTimeout(settled.current);
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
      draw(v);
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
    takeControl();
    frame([id], true, 650);
  };
  const frameSystems = (ids) => {
    takeControl();
    frame(ids);
  };
  const follow = (effects) => {
    cancelTour();
    if (performance.now() < manualUntil.current) return;
    const ids = [
      ...new Set(effects.flatMap((e) => [e.from, e.system]).filter(Boolean)),
    ];
    frame(ids, false, 650);
    const destination = effects.find((e) => e.kind === "move")?.system;
    if (destination && ids.length > 1)
      tour.current = setTimeout(() => frame([destination], true, 900), 850);
  };
  const zoom = (factor) => {
    const z = goal.current.z * factor;
    takeControl();
    move({ ...current.current, z }, 280);
  };
  const reset = () => {
    takeControl();
    move({ x: 1264, y: 888, z: 1 }, 650);
  };
  useEffect(() => {
    if (system && performance.now() >= manualUntil.current)
      frame([system], true, 750);
  }, [system]);
  useEffect(
    () => () => {
      cancelAnimationFrame(animation.current);
      cancelTour();
      clearTimeout(settled.current);
    },
    [],
  );
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e) => {
      if (!Number.isFinite(e.deltaY) || !e.deltaY) return;
      e.preventDefault();
      const matrix = el.getScreenCTM();
      if (!matrix) return;
      const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(
        matrix.inverse(),
      );
      takeControl();
      direct(wheelCamera(current.current, point, e));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const handlers = {
    onPointerDown: (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      if (e.button !== 1 && e.target.closest("[data-system]")) return;
      if (current.current.z <= 1) return;
      takeControl();
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
      takeControl();
      direct({ ...d.c, x: d.c.x + d.p.x - p.x, y: d.c.y + d.p.y - p.y });
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
