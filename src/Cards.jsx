import useCardTilt from "./useCardTilt.js";
import { CARDS, ACTION_CARDS, SUITS } from "../game/data.js";
export const cardImage = (id) =>
  ACTION_CARDS[id] ? `/assets/${id}.webp` : `/assets/cards/${id}.webp`;
export function Card({ id, onClick, badge = null }) {
  const tilt = useCardTilt();
  const c = CARDS[id];
  if (!c) return null;
  return (
    <button
      {...tilt}
      className={`court-card ${c.imageClass === "rotated" ? "landscape" : ""}`}
      onClick={onClick}
      title={c.name}
    >
      <img src={cardImage(id)} alt={c.name} loading="lazy" />
      <span>{c.name}</span>
      {badge && (
        <b className="card-badge" title="Has publisher FAQ or errata">
          {badge}
        </b>
      )}
    </button>
  );
}
export function ActionCard({
  id,
  onClick,
  onInspect,
  selected,
  draggable = false,
  onDragStart,
  onDragEnd,
}) {
  const tilt = useCardTilt();
  const c = ACTION_CARDS[id];
  return (
    <div className={`action-wrapper ${selected ? "chosen" : ""}`}>
      <button
        {...tilt}
        className={`action-card original ${c.suit} ${selected ? "chosen" : ""}`}
        aria-label={`${c.suit} ${c.rank}, ${c.pips} action pips`}
        onClick={onClick}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-arcs-card", id);
          e.dataTransfer.effectAllowed = "copy";
          onDragStart?.();
        }}
        onDragEnd={onDragEnd}
      >
        <img
          draggable={false}
          src={cardImage(id)}
          alt={`${c.suit} ${c.rank} · ${c.pips} pips · ${SUITS[c.suit].join(", ")}`}
        />
      </button>
      <button
        className="card-zoom"
        onClick={onInspect}
        aria-label={`Enlarge ${c.suit} ${c.rank}`}
      >
        Inspect
      </button>
    </div>
  );
}
