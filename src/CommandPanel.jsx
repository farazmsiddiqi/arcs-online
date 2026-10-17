import { DecisionChoices, DecisionGuide } from "./DecisionObjects.jsx";
import SelectionObjects from "./SelectionObjects.jsx";
import { dicePreset } from "./decisionGuide.js";
import ActionChoices from "./ActionChoices.jsx";
import { MapPin } from "lucide-react";
import PlayChoices from "./PlayChoices.jsx";
import { PoolOdds, DiceSymbol } from "./BattleGuide.jsx";
import { TurnStages, HistoryControls } from "./TurnFlow.jsx";
import { useClock } from "./TurnTimers.jsx";
import { useState, useEffect, useRef } from "react";
import { Swords } from "lucide-react";
import { cardImage } from "./Cards.jsx";
import { ACTION_CARDS, MAP, CARDS } from "../game/data.js";
import { cap } from "./tableContext.js";
import { confirmFor } from "./confirmStep.js";
// Item 16: declaring and seizing stay open after actions until the turn
// reveals something new. Worded like the undo-history boundaries.
const REVEALED = {
  dice: "Dice were rolled or a deck was shuffled",
  deck: "A deck changed or a card was revealed",
  hand: "New hand information was revealed",
  rival: "Another player responded",
};
function timingClosed(game) {
  const t = game.turn;
  if (!t?.acted || !t.revealed) return null;
  const closed = [
    t.mode === "lead" &&
      !t.leadDeclared &&
      game.markers.some((m) => !m.ambition) &&
      "declaring",
    !game.seized &&
      game.initiative !== game.me &&
      !t.seizeDecision &&
      game.players[game.me].hand.length > 0 &&
      "seizing",
  ].filter(Boolean);
  if (!closed.length) return null;
  return `${REVEALED[t.revealed] ?? "New information was revealed"}; ${closed.join(" and ")} ${closed.length > 1 ? "are" : "is"} closed for this turn.`;
}
export default function CommandPanel({
  game,
  room,
  resourceFocus,
  onAction,
  onBattleGuide,
  values,
  setValues,
  onHistory,
  onTimers,
  picked,
  selected,
  busy: networkBusy,
  error,
  onInspect,
  onClearCard,
  onClearSystem,
  confirming = null,
  onConfirm,
  onCancelConfirm,
}) {
  const [teaching, setTeachingState] = useState(
    localStorage.getItem("arcs-guidance") !== "off",
  );
  const setTeaching = (value) => {
    setTeachingState(value);
    localStorage.setItem("arcs-guidance", value ? "on" : "off");
  };
  const clock = useClock(room.clock);
  const busy = networkBusy || clock?.blocked;
  const d = game.decision,
    [dice, setDice] = useState({ skirmish: 0, assault: 0, raid: 0 }),
    [filter, setFilter] = useState(""),
    [confirmEnd, setConfirmEnd] = useState(null),
    confirmRef = useRef(null);
  useEffect(() => {
    setDice(
      d?.form?.kind === "dice"
        ? dicePreset(d.form)
        : { skirmish: 0, assault: 0, raid: 0 },
    );
    setConfirmEnd(
      d?.choices?.length === 1 && d.choices[0].op === "endTurn"
        ? d.choices[0].id
        : null,
    );
  }, [game.revision]);
  useEffect(() => {
    if (resourceFocus && resourceFocus.revision === game.revision)
      setFilter(`Prelude · slot ${resourceFocus.index + 1}`);
  }, [resourceFocus, game.revision]);
  // C-6: a one-click choice (pass, a face-up play, a Court or map click to
  // secure or battle) is waiting here for the player to confirm it.
  const confirmStep =
      confirming === null
        ? null
        : confirmFor(
            d?.choices?.find((c) => c.id === confirming),
            game,
          ),
    waiting = confirmStep !== null;
  useEffect(() => {
    if (!waiting) return;
    confirmRef.current?.focus({ preventScroll: true });
    confirmRef.current?.scrollIntoView({ block: "nearest" });
  }, [waiting]);
  if (!d) return null;
  const myTurn = d.actor === game.me,
    myCardTurn = game.current === game.me;
  const arranging = myTurn && !!game.resourceArrangement;
  const closedNote =
    myTurn && myCardTurn && !game.activity?.resolving
      ? timingClosed(game)
      : null;
  const choices = d.choices ?? [];
  const hasSelectedTargets =
    selected && choices.some((c) => c.system === selected);
  const stagedChoices =
    game.turn?.prelude && !game.activity?.resolving
      ? choices.filter((c) => c.group !== "Card actions" && c.op !== "endTurn")
      : choices;
  const groups = [
    ...new Set(
      stagedChoices.map((c) => c.group).filter((g) => g && g !== "Turn"),
    ),
  ];
  const activeFilter =
    game.turn?.prelude && !game.activity?.resolving
      ? groups.includes(filter)
        ? filter
        : (groups[0] ?? "")
      : "";
  const display = stagedChoices.filter(
    (c) =>
      confirmEnd === null &&
      !waiting &&
      (game.phase !== "card" ||
        c.op !== "play" ||
        (picked && c.card === picked)) &&
      (!activeFilter ||
        c.group === activeFilter ||
        ["endPrelude", "endTurn", "cancel"].includes(c.op)) &&
      (!hasSelectedTargets || !c.system || c.system === selected),
  );
  const submit = (value) => onAction({ value });
  const totalDice = Object.values(dice).reduce((a, b) => a + b, 0);
  const act = (c) => {
    if (c.op === "endTurn") setConfirmEnd(c.id);
    else onAction({ choice: c.id });
  };
  const targetChoices = display.filter(
    (c) =>
      c.system ||
      ["influenceTarget", "secureTarget", "bold", "ransack"].includes(c.op),
  );
  const renderChoices = (list) => (
    <DecisionChoices
      choices={list}
      game={game}
      busy={busy}
      onAction={act}
      onInspect={onInspect}
    />
  );
  return (
    <div className={`command-live phase-${game.phase}`}>
      <span className="eyebrow">
        {myTurn ? "YOUR COMMAND" : "TABLE STATUS"}
      </span>
      <h2>{arranging ? "Store your resources" : d.title}</h2>
      {myCardTurn && <TurnStages game={game} review={confirmEnd !== null} />}
      {myTurn && (
        <HistoryControls
          history={room.history}
          onHistory={onHistory}
          busy={busy}
        />
      )}
      {clock?.blocked && (
        <div className="clock-blocked" role="alert">
          <strong>
            {clock.paused
              ? "The table is paused"
              : clock.config.expiry === "auto"
                ? "AI is finishing this turn"
                : "Turn time has expired"}
          </strong>
          <p>
            {!clock.paused && clock.config.expiry === "auto"
              ? "The remaining decisions are being completed automatically. Play passes on as soon as they resolve. The host can pause or add time."
              : room.host
                ? "Resume or add time in Turn timers."
                : "The host can resume the table or add time."}
          </p>
          <button onClick={onTimers}>Open turn timers</button>
        </div>
      )}
      {game.turn && !arranging && !game.activity?.resolving && (
        <div className="pip-strip">
          <span>
            {myCardTurn
              ? "YOUR CARD PIPS"
              : `${game.players[game.current]?.name}’s pips`}
          </span>
          <b>
            {"♦".repeat(game.turn.pips)}
            {"◇".repeat(Math.max(0, 4 - game.turn.pips))}
          </b>
          <small>{game.turn.pips} remaining</small>
        </div>
      )}
      {myTurn && !myCardTurn && (
        <p className="timing-tip">
          You are resolving a response during {game.players[game.current]?.name}
          ’s turn. Resolve this effect before their turn continues.
        </p>
      )}
      {myTurn && !arranging && confirmEnd === null && !waiting && (
        <DecisionGuide
          game={game}
          teaching={teaching}
          setTeaching={setTeaching}
          onInspect={onInspect}
        />
      )}
      {d.description && !arranging && !teaching && (
        <p className="command-description">{d.description}</p>
      )}
      {!myTurn && (
        <p className="command-description">
          {game.activity?.label ?? "Resolving their turn"}. You can inspect the
          map, cards, and ambition standings while you wait.
        </p>
      )}
      {game.phase === "card" && myTurn && (
        <p className="command-description">
          {game.lead
            ? `Match ${cap(game.lead.suit)} and beat ${game.lead.rank} to Surpass. Copy gives one lead-suit action; Pivot gives one action in a different suit.`
            : "Select a card from your hand to lead. You may declare its ambition before your actions, or after them until the turn reveals something new (a roll, a draw or a look at a hand)."}
        </p>
      )}
      {myTurn &&
        game.turn?.prelude &&
        !game.activity?.resolving &&
        !teaching && (
          <p className="timing-tip">
            Card actions appear after you finish Prelude. You can undo this
            stage transition until new information or another player’s decision
            commits it.
          </p>
        )}
      {closedNote && <p className="timing-tip">{closedNote}</p>}
      {myTurn && game.phase === "card" && !picked && (
        <div className="choose-card-prompt">
          <strong>Choose a card from your hand</strong>
          <p>Nothing is played until you confirm a play here.</p>
          <button
            onClick={() =>
              document
                .querySelector(".hand-area")
                ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
            }
          >
            View your hand ↓
          </button>
        </div>
      )}
      {myTurn && game.phase === "card" && picked && (
        <div className="selection-context">
          <span>
            Selected: {cap(ACTION_CARDS[picked].suit)}{" "}
            {ACTION_CARDS[picked].rank}
          </span>
          <button onClick={onClearCard}>Clear selection</button>
        </div>
      )}
      {myTurn && hasSelectedTargets && (
        <div className="selection-context">
          <span>
            Targets in sector {MAP[selected].cluster} ·{" "}
            {cap(MAP[selected].symbol)}
          </span>
          <button onClick={onClearSystem}>All systems</button>
        </div>
      )}
      {myTurn && !hasSelectedTargets && choices.some((c) => c.system) && (
        <p className="timing-tip">
          Highlighted systems are legal targets. Select one on the map to narrow
          these choices.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {myTurn && game.interaction && (
        <div className="movement-guide">
          <span className="eyebrow">FLEET MOVEMENT</span>
          <p>
            {game.interaction.kind === "moveOrigin"
              ? "Click a highlighted origin on the map."
              : ["catapultSelect", "sprintSelect"].includes(
                    game.interaction.kind,
                  )
                ? "Click ships to select them, then confirm your selection."
                : game.decision.form?.kind === "pieces"
                  ? "Your fleet is selected when it fits the limit. Click ships to adjust it, then click a glowing destination to move."
                  : game.interaction.kind === "moveTo"
                    ? "Click a glowing destination or drag your selected fleet there to move. Undo is available until a commitment boundary."
                    : "Continue through a highlighted gate route, or finish the catapult move."}
          </p>
        </div>
      )}
      {d.dice && (
        <>
          <div className="dice-results">
            {d.dice.map((die, i) => (
              <div key={i} className={`die ${die.type}`} title={die.type}>
                <small>{die.type[0].toUpperCase()}</small>
                <span>
                  {die.faces.length
                    ? die.faces.map((f, j) => <DiceSymbol key={j} symbol={f} />)
                    : "—"}
                </span>
              </div>
            ))}
          </div>
          <p className="dice-key">
            ✹ Ship hit · × Self hit · ↩ Intercept · △ Building hit ·{" "}
            <DiceSymbol symbol="key" /> Raid key
          </p>
        </>
      )}
      {myTurn && d.form?.kind === "dice" && (
        <>
          <button
            className="dice-guide-link"
            onClick={() => onBattleGuide(dice)}
          >
            What do these dice do? · Faces & probabilities ↗
          </button>
          <div className="dice-presets" aria-label="Battle dice presets">
            <span>Starting pool · adjust freely</span>
            {["skirmish", "assault", "raid"].map((mode) => (
              <button
                key={mode}
                disabled={busy || (mode === "raid" && d.form.raidMax === 0)}
                onClick={() => setDice(dicePreset(d.form, mode))}
              >
                {mode === "skirmish"
                  ? "Skirmish · no self hits"
                  : mode === "assault"
                    ? "Assault · more risk"
                    : "Raid · seek keys"}
              </button>
            ))}
          </div>
          <div className="dice-picker">
            {["skirmish", "assault", "raid"].map((type) => (
              <label key={type}>
                <span>
                  <b>{type[0].toUpperCase() + type.slice(1)}</b>
                  <small>
                    {type === "skirmish"
                      ? "50% ship hit · no self hits"
                      : type === "assault"
                        ? "83.3% ship hit · 50% self hit"
                        : "50% building hit · 50% raid key"}
                  </small>
                </span>
                <input
                  disabled={busy || (type === "raid" && d.form.raidMax === 0)}
                  aria-label={`${type} dice`}
                  type="number"
                  min="0"
                  max={type === "raid" ? d.form.raidMax : 6}
                  value={dice[type]}
                  onChange={(e) =>
                    setDice({
                      ...dice,
                      [type]: Math.max(
                        0,
                        Math.min(
                          type === "raid" ? d.form.raidMax : 6,
                          Math.floor(Number(e.target.value)),
                        ),
                      ),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <PoolOdds dice={dice} />
          {d.form.raidMax === 0 && (
            <p className="timing-tip">
              Raid dice are unavailable in this battle.
            </p>
          )}
          <div className="dice-commit">
            <div>
              <strong>
                {totalDice} / {d.form.max} dice
                {d.form.min ? ` · at least ${d.form.min}` : ""}
                {d.form.corsair ? " · Assault ≤ skirmish" : ""}
              </strong>
              <p className="commit-warning">
                Rolling commits earlier decisions. You cannot undo a roll.
              </p>
            </div>
            <button
              className="primary full"
              disabled={
                busy ||
                Object.values(dice).reduce((a, b) => a + b, 0) <
                  (d.form.min ?? 0) ||
                Object.values(dice).reduce((a, b) => a + b, 0) > d.form.max ||
                (d.form.corsair && dice.assault > dice.skirmish)
              }
              onClick={() => submit(dice)}
            >
              <Swords size={16} /> Roll battle dice
            </button>
          </div>
        </>
      )}
      {myTurn && d.form && d.form.kind !== "dice" && (
        <SelectionObjects
          game={game}
          values={values}
          setValues={setValues}
          busy={busy}
          onSubmit={submit}
          onBack={() => onAction({ cancel: true })}
        />
      )}
      {myTurn &&
        game.turn?.prelude &&
        !game.activity?.resolving &&
        groups.length > 1 &&
        confirmEnd === null &&
        !waiting && (
          <div className="stage-categories" aria-label="Choices in this stage">
            {groups.map((g) => (
              <button
                key={g}
                title={g}
                className={activeFilter === g ? "selected" : ""}
                onClick={() => setFilter(g)}
              >
                {g.startsWith("Prelude · slot") && (
                  <img
                    className="prelude-token"
                    src={`/assets/${game.players[game.me].resources[Number(g.split(" ").at(-1)) - 1]}.webp`}
                    alt=""
                  />
                )}
                {g === "Before actions"
                  ? "Ambition & initiative"
                  : g.startsWith("Prelude · slot")
                    ? `${cap(game.players[game.me].resources[Number(g.split(" ").at(-1)) - 1])} · ${game.resourceKeys[game.me][Number(g.split(" ").at(-1)) - 1]} keys`
                    : g.replace("Prelude · ", "")}{" "}
                <small>
                  {g.startsWith("Prelude · slot")
                    ? `Slot ${g.split(" ").at(-1)}`
                    : stagedChoices.filter((c) => c.group === g).length}
                </small>
              </button>
            ))}
          </div>
        )}
      {confirmEnd !== null && game.turn && myTurn && (
        <div
          className="confirm-end stage-review"
          role="region"
          aria-label="Review turn"
        >
          <span className="eyebrow">REVIEW & CONFIRM</span>
          <h3>
            {game.turn.pips > 0
              ? `End with ${game.turn.pips} unused pips?`
              : "Ready to end your turn?"}
          </h3>
          <p>
            All required effects have been resolved.{" "}
            {game.turn.pips > 0 ? "Unused pips will be lost. " : ""}Confirming
            passes control and commits this turn; Undo will no longer be
            available.
          </p>
          {room.history?.steps.filter((s) => s.applied).length > 0 && (
            <details>
              <summary>Recent decisions</summary>
              <ul>
                {room.history.steps
                  .filter((s) => s.applied)
                  .map((s, i) => (
                    <li key={i}>{s.label}</li>
                  ))}
              </ul>
            </details>
          )}
          <div>
            <button
              className="subtle"
              disabled={busy}
              onClick={() => setConfirmEnd(null)}
            >
              Keep playing
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => onAction({ choice: confirmEnd })}
            >
              Confirm & end turn
            </button>
          </div>
        </div>
      )}
      {waiting && myTurn && (
        <div
          ref={confirmRef}
          tabIndex={-1}
          className="confirm-end stage-review"
          role="region"
          aria-label="Confirm this choice"
        >
          <span className="eyebrow">REVIEW & CONFIRM</span>
          <h3>{confirmStep.title}</h3>
          {confirmStep.card && (
            <button
              className="draft-confirm-card"
              onClick={() => onInspect(confirmStep.card)}
              aria-label={`Inspect ${CARDS[confirmStep.card]?.name}`}
            >
              <img
                src={cardImage(confirmStep.card)}
                alt={CARDS[confirmStep.card]?.name}
              />
              <span>
                Inspect selected{" "}
                {CARDS[confirmStep.card]?.kind === "leader" ? "Leader" : "Lore"}
              </span>
            </button>
          )}
          <p>{confirmStep.body}</p>
          <div>
            <button
              className="subtle"
              disabled={busy}
              onClick={onCancelConfirm}
            >
              Cancel
            </button>
            <button className="primary" disabled={busy} onClick={onConfirm}>
              {confirmStep.confirm}
            </button>
          </div>
        </div>
      )}
      {myTurn && picked && game.phase === "card" && (
        <PlayChoices
          key={`${picked}-${game.revision}`}
          choices={display.filter((c) => c.op === "play")}
          game={game}
          busy={busy}
          onPlay={act}
        />
      )}
      {display.some((c) => c.op === "action") && (
        <ActionChoices
          choices={display.filter((c) => c.op === "action")}
          game={game}
          busy={busy}
          onAction={act}
        />
      )}
      {targetChoices.length > 0 && (
        <div className="map-instruction">
          <MapPin size={25} />
          <div>
            <strong>
              {targetChoices.some((c) => c.system)
                ? "Choose on the map"
                : "Choose a card in the Court"}
            </strong>
            <small>
              {targetChoices.some((c) => c.op === "hit")
                ? "Click the piece that should take the hit."
                : targetChoices.some((c) => c.op === "repairTarget")
                  ? "Click a damaged piece to repair it."
                  : "Glowing targets show where this action is available."}
            </small>
          </div>
        </div>
      )}
      {arranging && (
        <div className="map-instruction">
          <MapPin size={25} />
          <div>
            <strong>Arrange tokens on your player board</strong>
            <small>
              Drag to swap, or select a token and a slot. Press Done there to
              continue this step.
            </small>
          </div>
        </div>
      )}
      {!arranging &&
        renderChoices(
          display.filter(
            (c) =>
              c.op !== "play" &&
              c.op !== "action" &&
              c.op !== "seize" &&
              !targetChoices.includes(c),
          ),
        )}
      {display.some((c) => c.op === "seize") && (
        <details className="special-choices">
          <summary>Seize initiative · discard an extra card</summary>
          {renderChoices(display.filter((c) => c.op === "seize"))}
        </details>
      )}
      {targetChoices.length > 0 && (
        <details className="target-fallback">
          <summary>Choose from a list instead</summary>
          {renderChoices(targetChoices)}
        </details>
      )}
      {game.phase === "over" && (
        <p className="command-description">
          Final Power:{" "}
          {game.players.map((p) => `${p.name} ${p.power}`).join(" · ")}
        </p>
      )}
    </div>
  );
}
