export function boundedCamera(c) {
  const z = Math.max(1, Math.min(4, c.z));
  return {
    z,
    x: Math.max(1264 / z, Math.min(2528 - 1264 / z, c.x)),
    y: Math.max(888 / z, Math.min(1776 - 888 / z, c.y)),
  };
}
export function frameCamera(ids, centers, slots, pieces = [], close = false) {
  const unique = [...new Set(ids)];
  const points = unique.flatMap((id) => {
    if (!centers[id]) return [];
    const [x, y] = centers[id],
      count = pieces.filter((p) => p.system === id && p.type === "ship").length;
    return [
      [x - 90, y - 45],
      [x + 90, y + Math.max(0, Math.ceil(count / 4) - 1) * 35 + 45],
      ...(slots[id] ?? []),
      ...(pieces.some((p) => p.system === id && p.cloud)
        ? [[x + 140, y + 80]]
        : []),
    ];
  });
  if (!points.length) return null;
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]),
    left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys);
  return boundedCamera({
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    z: Math.min(
      close ? 3.8 : 3.2,
      2528 / (right - left + (unique.length > 1 ? 430 : 250)),
      1776 / (bottom - top + (unique.length > 1 ? 370 : 230)),
    ),
  });
}
