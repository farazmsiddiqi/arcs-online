import { useRef } from "react";
const playerWidthLimits = () =>
  innerWidth <= 1000
    ? { min: 30, max: 66 }
    : {
        min: (360 / innerWidth) * 100,
        max: Math.min(66, ((innerWidth - 460) / innerWidth) * 100),
      };
// The width the stylesheet gives the player board when nothing is saved. It
// must match the `--player-width` fallbacks in player-table.css (42.5%) and
// laptop-fit.css (60%, under the same media query).
const defaultPlayerWidth = () =>
  matchMedia("(min-width: 1200px) and (max-height: 1000px)").matches
    ? 60
    : 42.5;
export const clampPlayerWidth = (value) => {
  const { min, max } = playerWidthLimits();
  return Math.min(max, Math.max(min, value));
};
export default function PlayerBoardResize({ width, onChange }) {
  const drag = useRef(null),
    current = width ?? defaultPlayerWidth(),
    { min, max } = playerWidthLimits();
  return (
    <div
      className="player-board-resize"
      role="separator"
      aria-label="Resize player board and step panel"
      aria-orientation="vertical"
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(current)}
      aria-valuetext={`Player board ${Math.round(current)} percent`}
      tabIndex={0}
      title="Drag left or right to resize your player board. Arrow keys adjust; Home or double-click resets."
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        drag.current = { x: e.clientX, width: width ?? defaultPlayerWidth() };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current)
          onChange(
            clampPlayerWidth(
              drag.current.width +
                ((e.clientX - drag.current.x) / innerWidth) * 100,
            ),
          );
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={() => onChange(null)}
      onKeyDown={(e) => {
        if (["ArrowLeft", "ArrowRight", "Home"].includes(e.key)) {
          e.preventDefault();
          onChange(
            e.key === "Home"
              ? null
              : clampPlayerWidth(
                  (width ?? defaultPlayerWidth()) +
                    (e.key === "ArrowRight" ? 3 : -3),
                ),
          );
        }
      }}
    >
      <span />
    </div>
  );
}
