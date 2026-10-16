export function TurnStages({ game, review }) {
  if (["draft", "over"].includes(game.phase))
    return (
      <div className="stage-intro">
        <span className="eyebrow">
          {game.phase === "draft" ? "SETUP · LEADERS & LORE" : "GAME COMPLETE"}
        </span>
        <p>
          {game.phase === "draft"
            ? "Choose your leader and lore. Your first card turn follows the draft."
            : "Review the final standings and chapter results."}
        </p>
      </div>
    );
  const resolving = game.activity?.resolving;
  const step = review
    ? 3
    : game.phase === "card"
      ? 0
      : game.turn?.prelude
        ? 1
        : 2;
  return (
    <section className="stage-guide" aria-label="Guided turn">
      <ol className="turn-steps">
        {["Play card", "Prelude", "Actions", "Review"].map((label, i) => (
          <li
            key={label}
            aria-current={step === i ? "step" : undefined}
            className={i === step ? "current" : i < step ? "done" : ""}
          >
            <span>{i < step ? "✓" : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="stage-intro">
        <span className="eyebrow">
          {resolving ? "RESOLVE BEFORE CONTINUING" : `STAGE ${step + 1} OF 4`}
        </span>
        <p>
          {resolving
            ? `${game.activity.label}. Finish this decision to return to your turn. Required effects are resolved in order before you can advance.`
            : [
                "Choose a card, then confirm how to play it. Your play determines the suit and number of action pips.",
                "Declare or seize if eligible, spend resources, and use Prelude abilities. When ready, continue to your card actions.",
                "Spend your card pips one action at a time. Resolve each action completely, then choose your next action or review your turn.",
                "Check your turn before handing control to the next player. Confirming commits your decisions.",
              ][step]}
        </p>
      </div>
    </section>
  );
}
export function HistoryControls({ history, onHistory, busy }) {
  if (!history) return null;
  return (
    <section className="decision-history" aria-label="Decision history">
      <div>
        <button
          disabled={busy || !history.canUndo}
          title={history.undoLabel ?? history.reason}
          onClick={() => onHistory("undo")}
        >
          ↶ Undo
        </button>
        <button
          disabled={busy || !history.canRedo}
          title={history.redoLabel ?? "Nothing to redo"}
          onClick={() => onHistory("redo")}
        >
          ↷ Redo
        </button>
      </div>
      <small>
        {history.canUndo ? `Undo: ${history.undoLabel}` : history.reason}
      </small>
      {history.steps.length > 0 && (
        <details>
          <summary>
            Decisions in this window (
            {history.steps.filter((s) => s.applied).length})
          </summary>
          <ol>
            {history.steps.map((s, i) => (
              <li key={i} className={s.applied ? "" : "undone"}>
                {s.label}
                {!s.applied ? " · undone" : ""}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
