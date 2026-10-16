import { Check, Minus } from "lucide-react";
import { ChoiceArt } from "./DecisionObjects.jsx";
import { DiceSymbol } from "./BattleGuide.jsx";
export default function SelectionObjects({
  game,
  values,
  setValues,
  busy,
  onSubmit,
  onBack,
}) {
  const f = game.decision.form;
  const blocked = (o) =>
    !values.includes(o.id) &&
    (values.length >= f.max ||
      (o.system &&
        f.maxPerSystem &&
        f.options.filter((v) => v.system === o.system && values.includes(v.id))
          .length >= f.maxPerSystem));
  const allLegal =
    f.options.length <= f.max &&
    !f.options.some(
      (o) =>
        o.system &&
        f.maxPerSystem &&
        f.options.filter((v) => v.system === o.system).length > f.maxPerSystem,
    );
  return (
    <div className={`selection-objects selection-${f.kind}`}>
      <div className="selection-progress">
        <strong>{values.length} selected</strong>
        <span>
          {f.min === f.max
            ? `Choose ${f.min}`
            : f.min === 0
              ? `Optional · up to ${f.max}`
              : `Choose ${f.min}–${f.max}`}
          {f.maxPerSystem && f.maxPerSystem < f.max
            ? ` · at most ${f.maxPerSystem} per origin`
            : ""}
        </span>
      </div>
      <div className="selection-gallery">
        {f.options.map((o) => {
          const piece = [
              ...game.pieces,
              ...game.players.flatMap((p) => [...p.captives, ...p.trophies]),
            ].find((p) => p.id === o.id),
            die = game.decision.dice?.[Number(o.id)];
          const object =
            f.kind === "cards"
              ? { kind: "card", id: o.id }
              : f.kind === "resources"
                ? {
                    kind: "resource",
                    resource: game.players[game.me].resources[Number(o.id)],
                  }
                : piece
                  ? { kind: "piece", piece }
                  : null;
          return (
            <button
              type="button"
              key={o.id}
              className={`selection-object ${values.includes(o.id) ? "chosen" : ""}`}
              role="checkbox"
              aria-checked={values.includes(o.id)}
              aria-label={o.label}
              disabled={busy || blocked(o)}
              onClick={() =>
                setValues(
                  values.includes(o.id)
                    ? values.filter((id) => id !== o.id)
                    : [...values, o.id],
                )
              }
            >
              {object ? (
                <ChoiceArt object={object} />
              ) : f.kind === "diceSelect" ? (
                <span className={`selectable-die ${o.type ?? die?.type ?? ""}`}>
                  {die?.faces?.length ? (
                    die.faces.map((face, i) => (
                      <DiceSymbol key={i} symbol={face} />
                    ))
                  ) : (
                    <span>
                      {o.label.includes("blank") || o.label === "Blank"
                        ? "—"
                        : o.label}
                    </span>
                  )}
                </span>
              ) : (
                <span className="selection-abstract">◇</span>
              )}
              <span>{o.label}</span>
              <span className="selection-check">
                {values.includes(o.id) ? (
                  <Check size={15} />
                ) : (
                  <Minus size={12} />
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="selection-footer">
        <div className="selection-shortcuts">
          {game.decision.canCancel && onBack && (
            <button disabled={busy} onClick={onBack}>
              ← Back
            </button>
          )}
          {f.options.length > 1 && (
            <button
              disabled={busy || !allLegal}
              onClick={() => setValues(f.options.map((o) => o.id))}
            >
              Select all
            </button>
          )}
          <button
            disabled={busy || !values.length}
            onClick={() => setValues([])}
          >
            Clear
          </button>
        </div>
        <button
          className="primary"
          disabled={busy || values.length < f.min || values.length > f.max}
          onClick={() => onSubmit(values)}
        >
          <Check size={15} />
          {!values.length && f.min === 0
            ? "Continue without selecting"
            : `Confirm selection`}
        </button>
      </div>
    </div>
  );
}
