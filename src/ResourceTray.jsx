import { useRef, useState } from "react";
import { Check, KeyRound, RotateCcw, ShieldCheck } from "lucide-react";
import RuleHelp from "./RuleHelp.jsx";
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "Empty");
export default function ResourceTray({ game, busy, onAction }) {
  const original = game.players[game.me].resources;
  const [order, setOrder] = useState([...original]);
  const [selected, setSelected] = useState(
    game.resourceArrangement?.selected ?? null,
  );
  const [over, setOver] = useState(null);
  const [notice, setNotice] = useState("");
  const drag = useRef(null),
    suppressClick = useRef(false);
  const keys = game.resourceKeys[game.me];
  const dirty = JSON.stringify(order) !== JSON.stringify(original);
  const swap = (from, to) => {
    if (busy || from === to || !order[from]) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    setOrder(next);
    setSelected(null);
    setNotice(
      `${cap(order[from])} moved to slot ${to + 1}. Changes apply when you press Done.`,
    );
  };
  return (
    <section
      className="resource-arranger"
      aria-label="Arrange resource tokens"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setSelected(null);
        }
      }}
    >
      <div className="resource-tray-intro">
        <div>
          <span className="resource-optional">OPTIONAL</span>
          <p>Keep these positions, or move a token to protect it.</p>
        </div>
        <RuleHelp
          label="How does resource protection work?"
          info={{
            title: "Raid protection",
            summary: "More keys means harder to steal.",
            detail:
              "The number under each slot is how many raid keys a rival must spend to steal its resource. The cost stays with the slot when tokens move. Empty slots can hold any resource.",
            example:
              "A resource in a 3-key slot costs three raid keys to steal. This does not prevent a raid.",
            page: 14,
          }}
        />
      </div>
      <div className="resource-tray" aria-label="Resource slots">
        {order.map((r, i) => (
          <button
            type="button"
            key={i}
            data-resource-slot={i}
            className={`resource-slot ${r ? "occupied" : "empty"} ${selected === i ? "picked" : ""} ${over === i ? "drop-target" : ""}`}
            aria-label={`Slot ${i + 1}: ${cap(r)}, ${keys[i]} raid ${keys[i] === 1 ? "key" : "keys"}`}
            aria-pressed={selected === i}
            disabled={busy}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              if (selected !== null) {
                if (selected === i) setSelected(null);
                else swap(selected, i);
              } else if (r) setSelected(i);
            }}
            onPointerDown={(e) => {
              if (!busy && r && e.button === 0) {
                drag.current = {
                  from: i,
                  x: e.clientX,
                  y: e.clientY,
                  moved: false,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              if (
                Math.hypot(
                  e.clientX - drag.current.x,
                  e.clientY - drag.current.y,
                ) > 6
              ) {
                drag.current.moved = true;
                setSelected(drag.current.from);
                const target = document
                  .elementFromPoint(e.clientX, e.clientY)
                  ?.closest("[data-resource-slot]");
                setOver(target ? Number(target.dataset.resourceSlot) : null);
              }
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              drag.current = null;
              setOver(null);
              if (d?.moved) {
                suppressClick.current = true;
                const target = document
                  .elementFromPoint(e.clientX, e.clientY)
                  ?.closest("[data-resource-slot]");
                if (target) swap(d.from, Number(target.dataset.resourceSlot));
              }
            }}
            onPointerCancel={() => {
              drag.current = null;
              setOver(null);
              setSelected(null);
            }}
          >
            <span className="resource-slot-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="resource-token-well">
              {r ? (
                <img draggable={false} src={`/assets/${r}.webp`} alt="" />
              ) : (
                <span className="empty-resource-mark">+</span>
              )}
            </span>
            <strong>{cap(r)}</strong>
            <span
              className={`resource-protection ${keys[i] === Math.max(...keys) ? "strong-protection" : ""}`}
            >
              <KeyRound size={12} />
              {keys[i]} {keys[i] === 1 ? "key" : "keys"}
            </span>
          </button>
        ))}
      </div>
      <div className="resource-tray-footer">
        <div className="resource-tray-guidance">
          <ShieldCheck size={17} />
          <span>
            {selected !== null
              ? `Choose a slot for your ${order[selected]}.`
              : "Drag to swap · or click a token, then a slot"}
            <small>
              {dirty
                ? "Preview · press Done to save"
                : "No changes needed? Just press Done."}
            </small>
          </span>
        </div>
        <div className="resource-tray-controls">
          {(dirty || selected !== null) && (
            <button
              className="resource-reset"
              disabled={busy}
              onClick={() => {
                setOrder([...original]);
                setSelected(null);
                setNotice("Original positions restored.");
              }}
            >
              <RotateCcw size={14} />
              Reset
            </button>
          )}
          <button
            className="primary resource-done"
            disabled={busy}
            onClick={() => onAction({ resourceArrangement: order })}
          >
            <Check size={17} />
            Done
          </button>
        </div>
      </div>
      <span className="sr-only" role="status">
        {notice}
      </span>
    </section>
  );
}
