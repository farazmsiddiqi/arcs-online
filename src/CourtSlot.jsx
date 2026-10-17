import { UserPlus, Undo2, Check, Hand } from "lucide-react";
import { Card } from "./Cards.jsx";
import { CARDS } from "../game/data.js";
import { courtActions } from "./courtActions.js";
import "./court-actions.css";

export default function CourtSlot({
  game,
  card,
  index,
  busy,
  blocked,
  history,
  onInspect,
  onAction,
  onUndo,
}) {
  const actions = courtActions(game, card.id);
  const reviewing = actions.some((c) => c.op === "confirmInfluence");
  return (
    <div
      className={`court-slot ${actions.length ? "court-can-act" : ""} ${reviewing ? "court-reviewing" : ""}`}
      data-court-slot={index}
    >
      {card.id ? (
        <>
          <Card id={card.id} onClick={() => onInspect(card.id)} />
          {actions.length > 0 && (
            <div className="court-card-controls">
              {actions.map((c) => (
                <button
                  key={c.id}
                  className={`court-action ${reviewing ? "court-confirm" : ""}`}
                  disabled={busy || blocked}
                  onClick={() => onAction({ choice: c.id })}
                  aria-label={`${c.actionLabel} ${CARDS[card.id]?.name}`}
                  title={c.label}
                >
                  {reviewing ? (
                    <Check size={15} />
                  ) : c.op === "influenceTarget" || c.op === "bold" ? (
                    <UserPlus size={15} />
                  ) : (
                    <Hand size={15} />
                  )}
                  <span>{c.actionLabel}</span>
                </button>
              ))}
            </div>
          )}
          {reviewing && (
            <div className="court-placement-review">
              <span>Agent placed · not yet confirmed</span>
              <button
                disabled={busy || blocked || !history?.canUndo}
                onClick={onUndo}
              >
                <Undo2 size={13} />
                Undo placement
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="empty-court">Court deck empty</div>
      )}
      <div className="influence-dots">
        {game.players.map((p, i) => (
          <span
            key={i}
            style={{ color: p.color }}
            title={`${p.name}: ${card.agents[i]} agents`}
          >
            ● <b>{card.agents[i]}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
