import {
  ArrowRight,
  ChevronLeft,
  Check,
  Flag,
  KeyRound,
  Layers,
  Shuffle,
  SkipForward,
  Users,
  Sparkles,
  Info,
  Shield,
} from "lucide-react";
import { CARDS, ACTION_CARDS } from "../game/data.js";
import { cardImage } from "./Cards.jsx";
import { sprite } from "./Board.jsx";
import { choiceObject, guideFor } from "./decisionGuide.js";
import { choiceHint, rulesText } from "./tableContext.js";
const symbols = {
  cancel: ChevronLeft,
  skip: SkipForward,
  resolve: Check,
  endPrelude: ArrowRight,
  endTurn: Check,
  pass: ArrowRight,
  mulligan: Shuffle,
  ruthless: Shield,
  effect: Layers,
};
export function ChoiceArt({ object }) {
  if (object.kind === "card")
    return (
      <img className="decision-card-art" src={cardImage(object.id)} alt="" />
    );
  if (object.kind === "piece")
    return (
      <img
        className="decision-piece-art"
        src={sprite(
          object.piece.owner,
          object.piece.type,
          object.piece.damaged,
        )}
        alt=""
      />
    );
  if (object.kind === "resource")
    return (
      <img
        className="decision-token-art"
        src={`/assets/${object.resource}.webp`}
        alt=""
      />
    );
  if (object.kind === "player")
    return (
      <span
        className="decision-player-art"
        style={{ color: object.player?.color }}
      >
        <Users size={30} />
      </span>
    );
  if (object.kind === "ambition")
    return (
      <span className={`decision-ambition-art ambition-${object.ambition}`}>
        <Flag size={28} />
        <small>{object.ambition}</small>
      </span>
    );
  if (["sequence", "sector", "count"].includes(object.kind))
    return (
      <span className="decision-number-art">{object.n ?? object.cluster}</span>
    );
  const Icon = symbols[object.op] ?? Sparkles;
  return <Icon className="decision-symbol-art" size={24} />;
}
const navigation = (c) =>
  ["skip", "cancel", "resolve", "endPrelude", "endTurn", "pass"].includes(c.op);
export function DecisionChoices({ choices, game, busy, onAction, onInspect }) {
  if (!choices.length) return null;
  const objects = choices.filter((c) => !navigation(c)),
    nav = choices.filter(navigation);
  const render = (c) => {
    const object = choiceObject(c, game),
      hint = choiceHint(c, game);
    const label =
      c.op === "endTurn"
        ? "Review & end turn"
        : c.op === "endPrelude"
          ? "Finish Prelude →"
          : c.label;
    return (
      <div
        className={`decision-object kind-${object.kind}`}
        key={`${game.revision}-${c.id}`}
      >
        <button
          className={`command-choice object-choice ${c.op === "endTurn" ? "end-turn" : ""}`}
          aria-label={c.label}
          title={navigation(c) ? hint : undefined}
          disabled={busy}
          onClick={() => onAction(c)}
        >
          <ChoiceArt object={object} />
          <span>
            <strong>{label}</strong>
            {hint && <small>{hint}</small>}
            {object.keys != null && (
              <small className="object-cost">
                <KeyRound size={12} />
                {object.keys} raid keys
              </small>
            )}
            {object.kind === "piece" && (
              <small>
                {game.players[object.piece.owner]?.name} ·{" "}
                {object.piece.damaged ? "Damaged" : "Fresh"}
              </small>
            )}
          </span>
        </button>
        {object.kind === "card" && (
          <button
            className="object-inspect"
            onClick={() => onInspect(object.id)}
            aria-label={`Inspect ${CARDS[object.id]?.name ?? `${ACTION_CARDS[object.id].suit} ${ACTION_CARDS[object.id].rank}`}`}
          >
            <Info size={15} />
          </button>
        )}
      </div>
    );
  };
  return (
    <>
      <div className="decision-objects">{objects.map(render)}</div>
      {nav.length > 0 && (
        <div className="decision-navigation">{nav.map(render)}</div>
      )}
    </>
  );
}
export function DecisionGuide({ game, teaching, setTeaching, onInspect }) {
  const [instruction, next] = guideFor(game),
    source = game.decision.context?.source;
  return (
    <section className="decision-guide" aria-label="Step guidance">
      <div className="decision-guide-controls">
        {source && (
          <button className="effect-source" onClick={() => onInspect(source)}>
            <img src={cardImage(source)} alt="" />
            {CARDS[source].name}
            <Info size={13} />
          </button>
        )}
        <button
          className="teaching-toggle"
          aria-pressed={teaching}
          onClick={() => setTeaching(!teaching)}
        >
          {teaching ? "Guidance on" : "Guidance off"}
        </button>
      </div>
      {teaching && (
        <div className="decision-instruction">
          <p>
            {source && game.decision.description
              ? rulesText(game.decision.description)
              : instruction}
          </p>
          {!source &&
            ["raid", "ruthless"].includes(game.decision.context?.kind) &&
            game.decision.description && (
              <p>{rulesText(game.decision.description)}</p>
            )}
          <details className="next-step-help">
            <summary>What happens next?</summary>
            <small>{next}</small>
          </details>
        </div>
      )}
      {teaching && game.phase === "card" && (
        <details className="turn-primer">
          <summary>How a turn works</summary>
          <p>
            <b>Play a card</b> to set your actions. <b>Prelude</b> is optional
            resource spending and abilities. <b>Actions</b> spend card pips,
            resolving each effect completely. <b>Review</b> lets you check your
            turn before handing control over. Undo works until new information
            or another player’s decision commits the earlier choices.
          </p>
        </details>
      )}
    </section>
  );
}
