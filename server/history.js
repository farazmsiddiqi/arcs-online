import { decision, transition, RuleError, log } from "../game/engine.js";
const actorOf = (s) =>
  s?.phase === "over" ? null : (s?.pending[0]?.p ?? s?.current);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const discardPiles = (s) => [s.discardDown, s.discardUp];
export function historyBoundary(before, after, actor, choice) {
  if (
    choice?.op === "endTurn" ||
    choice?.op === "pass" ||
    before.chapter !== after.chapter ||
    before.round !== after.round ||
    after.phase === "over"
  )
    return "Turn confirmed. Earlier decisions are committed.";
  if (actorOf(after) !== actor || before.current !== after.current)
    return "Another player has a decision. Earlier actions are committed.";
  if (before.rng !== after.rng)
    return "Dice were rolled or a deck was shuffled. Earlier decisions are committed.";
  if (
    !equal(before.courtDeck, after.courtDeck) ||
    !equal(discardPiles(before), discardPiles(after))
  )
    return "A deck changed or a card was revealed. Earlier decisions are committed.";
  if (
    after.players.some((p, i) =>
      i !== actor
        ? !equal(p.hand, before.players[i].hand)
        : p.hand.some((c) => !before.players[i].hand.includes(c)),
    )
  )
    return "New hand information was revealed. Earlier decisions are committed.";
  if (after.pending.some((t) => /^farseers/.test(t.type)))
    return "Farseers can reveal private cards. Earlier decisions are committed.";
  return null;
}
export function applyDecision(room, actor, input) {
  const before = room.game,
    d = decision(before, actor),
    choice = d.choices?.[input.choice];
  const after = transition(before, actor, input);
  return recordDecision(
    room,
    actor,
    before,
    after,
    choice,
    choice?.label ??
      (input.cancel
        ? "Back"
        : d.form?.kind === "dice"
          ? "Roll battle dice"
          : `${d.title} · ${Array.isArray(input.value) ? input.value.length : ""} selected`),
  );
}
function recordDecision(room, actor, before, after, choice, label) {
  const boundary = historyBoundary(before, after, actor, choice);
  if (boundary)
    room.history = {
      owner: actorOf(after),
      steps: [],
      cursor: 0,
      reason: boundary,
    };
  else {
    let h = room.history;
    if (!h || h.owner !== actor)
      h = {
        owner: actor,
        steps: [],
        cursor: 0,
        reason: "Beginning of your decision window.",
      };
    h.steps = h.steps.slice(0, h.cursor);
    h.steps.push({
      before: structuredClone(before),
      after: structuredClone(after),
      label,
    });
    if (h.steps.length > 40) {
      h.steps.shift();
      h.reason = "Oldest retained decision reached (40-step history).";
    }
    h.cursor = h.steps.length;
    room.history = h;
  }
  room.game = after;
  return after;
}
export function historyView(room, p) {
  const h = room.history,
    mine = h?.owner === p && actorOf(room.game) === p;
  return {
    canUndo: !!(mine && h.cursor > 0),
    canRedo: !!(mine && h.cursor < h.steps.length),
    undoLabel: mine ? h.steps[h.cursor - 1]?.label : null,
    redoLabel: mine ? h.steps[h.cursor]?.label : null,
    reason: mine
      ? h.reason
      : actorOf(room.game) === p
        ? "No reversible decisions yet."
        : "Available only to the player resolving the current decision.",
    steps: mine
      ? h.steps.map((s, i) => ({ label: s.label, applied: i < h.cursor }))
      : [],
  };
}
export function travelHistory(room, p, direction) {
  if (!["undo", "redo"].includes(direction))
    throw new RuleError("Choose undo or redo.");
  const v = historyView(room, p),
    h = room.history;
  if (!v[direction === "undo" ? "canUndo" : "canRedo"])
    throw new RuleError(
      direction === "undo" ? v.reason : "There is no decision to redo.",
    );
  const old = room.game,
    undo = direction === "undo",
    step = h.steps[undo ? h.cursor - 1 : h.cursor];
  const restored = structuredClone(undo ? step.before : step.after);
  restored.revision = old.revision + 1;
  restored.eventId = Math.max(restored.eventId, old.eventId);
  log(
    restored,
    `${restored.players[p].name} ${undo ? "undid" : "redid"} their previous decision.`,
  );
  h.cursor += undo ? -1 : 1;
  room.game = restored;
  return restored;
}

// Choosing a fleet and its destination is one atomic user command.
export function applyMovement(room, actor, input) {
  if (room.game.pending[0]?.type !== "moveSelect")
    throw new RuleError("Choose a moving fleet first.");
  const copy = structuredClone(room);
  applyDecision(copy, actor, { value: input.value });
  const target = decision(copy.game, actor).choices.find(
    (c) => c.op === "moveTo" && c.system === input.destination,
  );
  if (!target)
    throw new RuleError("Choose a highlighted adjacent destination.");
  applyDecision(copy, actor, { choice: target.id });
  // Collapse selection and movement into one Undo entry when both are reversible.
  const h = copy.history;
  if (h?.steps.length >= 2 && h.cursor === h.steps.length) {
    const tail = h.steps.splice(-2);
    h.steps.push({
      before: tail[0].before,
      after: tail[1].after,
      label: target.label,
    });
    h.cursor = h.steps.length;
  }
  room.game = copy.game;
  room.history = copy.history;
}

// A visual arrangement commits through the same legal choices as the text flow.
export function applyResourceArrangement(room, actor, input) {
  const before = room.game,
    task = before.pending[0],
    order = input.resourceArrangement;
  if (
    !task ||
    task.p !== actor ||
    !(
      task.type === "arrangeResources" ||
      (task.type === "reorder" &&
        before.pending[1]?.type === "arrangeResources")
    )
  )
    throw new RuleError(
      "Resources can only be arranged in an arrangement window.",
    );
  const current = before.players[actor].resources;
  if (
    !Array.isArray(order) ||
    order.length !== current.length ||
    JSON.stringify([...order].sort()) !== JSON.stringify([...current].sort())
  )
    throw new RuleError("Keep the same resources and resource slots.");
  let after = before;
  const take = (op, index) => {
    const c = decision(after, actor).choices.find(
      (c) => c.op === op && (index === undefined || c.index === index),
    );
    if (!c)
      throw new RuleError("This resource arrangement is no longer available.");
    after = transition(after, actor, { choice: c.id });
  };
  // Resume saves made in the old two-step slot picker without moving a token.
  if (task.type === "reorder") take("swapSlot", task.index);
  for (let i = 0; i < order.length; i++) {
    const resources = after.players[actor].resources;
    if (resources[i] === order[i]) continue;
    const j = resources.findIndex((r, index) => index > i && r === order[i]);
    if (j < 0) throw new RuleError("Keep the same resource tokens.");
    take("arrangePick", resources[i] ? i : j);
    take("swapSlot", resources[i] ? j : i);
  }
  take("skip");
  return recordDecision(
    room,
    actor,
    before,
    after,
    { op: "arrangeResources" },
    "Arrange resources · Done",
  );
}
