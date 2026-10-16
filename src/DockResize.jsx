import { useRef } from "react";
export default function DockResize({ height, onChange, onReset }) {
  const drag = useRef(null);
  const clamp = (n) =>
    Math.round(Math.max(180, Math.min(innerHeight - 400, n)));
  const current = height ?? (innerHeight <= 800 ? 250 : 300);
  return (
    <>
      <div
        className="dock-resize"
        title="Drag up for more room, or use the Up and Down arrow keys"
        role="separator"
        aria-label="Resize action area"
        aria-orientation="horizontal"
        aria-valuemin={180}
        aria-valuemax={Math.max(180, innerHeight - 400)}
        aria-valuenow={current}
        tabIndex={0}
        onPointerDown={(e) => {
          drag.current = { y: e.clientY, height: current };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current)
            onChange(clamp(drag.current.height + drag.current.y - e.clientY));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={(e) => {
          if (["ArrowUp", "ArrowDown", "Home"].includes(e.key)) {
            e.preventDefault();
            onChange(
              e.key === "Home"
                ? null
                : clamp(current + (e.key === "ArrowUp" ? 30 : -30)),
            );
          }
        }}
      />
      <div className="dock-tools">
        <button onClick={() => onChange(clamp(innerHeight * 0.53))}>
          Expand actions
        </button>
        <button onClick={() => (onReset ? onReset() : onChange(null))}>
          Reset
        </button>
      </div>
    </>
  );
}
