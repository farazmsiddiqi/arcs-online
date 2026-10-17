import { boundedCamera } from "./cameraFraming.js";

// point is the board coordinate currently under the pointer, read from the
// visible SVG transform. Never anchor a gesture to a pending animation target.
export function wheelCamera(current, point, event) {
  const delta =
    event.deltaY *
    (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 500 : 1);
  if (!Number.isFinite(delta)) return current;
  // Browser trackpad pinches carry ctrlKey and much smaller pixel deltas.
  const sensitivity = event.ctrlKey ? 0.01 : 0.0015;
  const z = Math.max(
    1,
    Math.min(4, current.z * Math.exp(-delta * sensitivity)),
  );
  const ratio = current.z / z;
  return boundedCamera({
    z,
    x: point.x + (current.x - point.x) * ratio,
    y: point.y + (current.y - point.y) * ratio,
  });
}
