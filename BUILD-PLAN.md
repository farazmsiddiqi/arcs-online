# Arcs Online: build plan and milestone log

The technical record of the October 2026 review and the eighteen milestones
built from it. Sections 1 to 7 are the decisions and the specification of
each item as it was built; section 9 lists the claims checked against the
rulebook and rejected; section 10 the known limitations; section 11 the
milestone-by-milestone log of what was done, found and changed. The
plain-language overview is CHANGES.md; the reasoning behind each proposal is
PROPOSED-CHANGES.md. Function names are the anchors in the code; grep for
them. In sections 2 to 7, "before" means before that item was built.

## 0. Ground rules

- **Priorities, in order:** (1) competitive integrity: no player, host
  included, can see or infer hidden information or act out of turn;
  (2) correct rules, no stuck games, no lost state; (3) low latency;
  (4) UI that makes rules and state easy to find. Judge every change
  against these. Not priorities: scale, cleanup, phones, 2-player balance,
  the quality of the timeout AI.
- **Rules source of truth:** the base rulebook text is saved at
  `work/arcs-rulebook-base.txt` (gitignored). Card texts are in
  `data/cards.json`, publisher FAQ in `data/faq.json`, errata in
  `data/errata.json`. Rulebook Fine Print: cards supersede the rulebook,
  but any rule using "cannot" is absolute unless a card says "ignore";
  unspecified ties break in turn order from the initiative holder.
- **Scope:** base game plus Leaders & Lore. Blighted Reach is out of scope
  (no cards, no rules; existing filter guards stay).
- **Verify with** `npm run check` (593 tests, then the build; the two
  server tests need `node_modules`). The Playwright scripts in `scripts/`
  need a dev server and Chrome (`PW_CHANNEL=chrome`) and are not in CI;
  `npm run test:ux-sweep` renders every saved state at four window sizes and
  is the UI regression check. The saved states come from
  `npm run fixtures:ux`, deterministic for a given engine.

### Repo map

- `game/engine.js`: the rules engine. Pure functions over a
  state object. `transition(state, p, input)` clones the state, applies
  one choice or form value, runs `pump` (auto-resolves follow-ups), bumps
  `revision`, runs `assertInvariants`. `decision(s, p)` returns the
  current actor's choices or a form. Pending work is a stack `s.pending`
  of task objects handled by `taskDecision` / `resolveTask` /
  `resolveForm`. Per-card logic lives in `preludeDecision`/`resolvePrelude`
  (Prelude abilities), `specialTargets`/`specialDecision`/`resolveSpecial`
  (new actions like "Trade (Tax)"), `voxDecision`/`resolveVox`, and inline
  `has(s, p, "L10")` checks. `viewFor(s, p)` builds the per-seat view and
  is where privacy is enforced. `log(s, text, detail)` appends to the
  public log (every line is sent to everyone; never name a hidden card
  there).
- `game/data.js`: cards, map, setups, `LEADER_SETUP`, dice, pips.
- `game/autoplay.js`: random driver for simulations. `game/timeout-policy.js`:
  the AI that plays for a timed-out seat.
- `server/index.js`: Express + ws, SQLite via `node:sqlite`, one process.
  Seat auth by key; actor always derived server-side. `server/history.js`:
  undo/redo; `historyBoundary` defines when earlier steps become
  committed (RNG use, deck change, hand reveal, actor change, end turn,
  pass). `server/clock.js`: turn timers.
- `src/`: React client. `App.jsx` (modals, board clicks, WebSocket),
  `CommandPanel.jsx` (decision UI), `DecisionObjects.jsx`,
  `SelectionObjects.jsx` (forms), `TurnTimers.jsx`, `PlayerTable.jsx`,
  `SharedBoard.jsx`, `TableStory.jsx` (round story, log), `tableContext.js`.
- `tests/engine.test.js` (helpers `table()`, `choose()`, `form()`, `own()`,
  `giveCard()`, `diceState()` and others at the top of the file), plus
  `turn-controls`, `server`, `timeout*`, `decision-guide`,
  `shared-board`, `resource-arrangement`, `battle-ux`, `learning`,
  `simulations` test files.

### Engine conventions to respect

- Choices are positional indices into a server-computed list; never let
  the client name a target the engine did not offer.
- Anything the defender decides must be its own task with `p` = defender,
  which makes it an actor change and therefore a history boundary.
- Any `random(s)` call is a boundary; put the dice-count choice and the
  roll in the same transition (already the case).
- Hidden information: hands, face-down plays, seize cards, the face-down
  action discard (`discardDown`, contents and order; the face-up pile is
  public since M7), Court deck order, RNG, pending stack, `held`. Keep them
  out of `viewFor` and the log.

## 1. Decisions already made by the owner (do not re-open)

| Topic | Decision |
|---|---|
| Zero-dice battles | Legal (rulebook: "you may collect fewer dice than the maximum"). Only skip the empty reroll step. |
| Elder vs Galactic Rifles | Elder's "cannot Ransack" covers Rifles and any rival-dealt city destruction (item 15). |
| Declare/seize timing | Lenient: allowed until new information is revealed (item 16). Upstart and Tycoon's Ambition keep their printed strict timing. |
| "Reroll none" | Does not consume the reroll ability (item 9). |
| Declarations from cards | Lead-card declaration and Populist Demands / Tycoon's Ambition declarations are independent (item 17). |
| Ransack | Mandatory when a card is eligible (rulebook p.16). No change. |
| Sprinter Drives | Build the FAQ reading: one group, one extra move (C3). |
| Action discard | Solution A, the rulebook's split piles (item 3). |
| Pass chain | Final pass hands the marker on (item 8). |
| Where F-1's checks run | Tests only (`tests/invariants.js`). Do not move them into the engine's `assertInvariants`: a false positive there would block a live game. |
| Per-move checks in engine tests | Not yet. They run after every move in the simulations, and at explicit call sites in `engine.test.js`. Eight hand-built test setups would fail them; fix those in M14–M16 (see F-2). |
| Declare/seize window (M6) | Closes only when the turn has both acted and revealed. A reveal from a declaration itself (Noble, Farseers) does not close the other choice before your first action (rulebook p.20: both come before Prelude actions, in either order). |
| Printed strict timing (M6) | Upstart, Tycoon's Ambition, Galactic Bards and Lattice Spies keep "before any actions": they close at the first action, revealed or not. |
| What counts as a reveal (M6) | Any other player's decision closes the window (stricter, for competitive integrity), matching the undo-history boundary. Railgun Arrays also counts (no owner preference; kept as the plan had it). |
| No-op Preludes (M6) | A Union skipped, or a Lore Prelude closed with Done, is not an action. It counts once it does something. |
| Farseers and split piles (M7) | Farseers checks whether the face-down pile is short after its own discards land on it (discard, then draw, as the Farseers FAQ assumes). It merges only when that pile was already empty; a deeper dig returns the player's own discards. |
| 2p mulligan (M7) | Unchanged: draw 6 from the face-down bottom, then shuffle the old hand into the rest (rulebook setup steps P and Q). |

## 2. Phase A: engine rule fixes

### A1. Item 8: final pass hands the initiative marker on
- **Rule** (p.8, p.19): a pass gives the marker to the next clockwise
  player with cards and ends the round; if everyone with cards passes
  consecutively the chapter ends; the initiative holder starts the next
  chapter. So the first passer opens the next chapter.
- **Engine:** `resolveMain` case `"pass"` calls `endChapter`
  before advancing on the final pass, so the last passer keeps it. Also
  feeds the game-end tie-break ordered from `s.initiative`.
- **Change:** advance `s.initiative` to the next player with cards before
  `endChapter` on the final pass.
- **Tests:** 4p all pass: next chapter `initiative` is the original
  holder. 3p with one player out of cards: that player is skipped and does
  not count toward "everyone with cards". Extend `consecutive voluntary
  initiative passes end the chapter`.

### A2. Item 15: Elder's Ransack immunity covers Galactic Rifles
- **Engine:** `destroy` suppresses Ransack only when the hit
  has `battle: true`; `rifleHits` pushes `battle: false`.
- **Change:** when the dealer is a rival and the city's owner has LEAD01,
  push no ransack task regardless of the `battle` flag.
- **Tests:** Rifles destroys an Elder city: Outrage provoked, no ransack
  task. Rifles destroys a non-Elder city: ransack task as before.
- **Done in M5** (see section 11).

### A3. Item 17: lead-card and card-sourced declarations are independent
- **Rule** (p.9): "You cannot declare an ambition multiple times using the
  same card." Per card, not per turn. Populist Demands (BC27) and
  Tycoon's Ambition (L27) are different cards.
- **Engine:** `declare` sets `s.turn.declared` for every
  source; `mainChoices` offers the lead-card declaration only while it is
  clear. Card first then lead card is blocked.
- **Change:** split the flag. `turn.leadDeclared` is set only by the
  lead-card path (and BC25 Galactic Bards' pivot path, which already uses
  `roundDeclared`). `resolveVox` "populist" and L27 in
  `resolvePrelude` do not set it. Per-card limits stay: Populist
  Demands is discarded after use; L27 once per turn.
- **Tests:** lead turn: secure Populist Demands in Prelude (Relic or
  Tyrant's Ego), declare Tyrant through it, then declare the lead card's
  ambition: two markers placed, zero marker placed once. L27 in both
  orders on the same turn (existing `:934` covers lead-then-L27). With
  only two markers left, the third declaration is refused.

### A4. C6: Warrior Tactical / Feastbringer Charismatic "after" path leaks free actions (integrity)
- **Cards:** Warrior (LEAD06): when you Copy or Pivot to battle, you may
  move before or after. Feastbringer (LEAD07): when you Copy or Pivot to
  secure, you may influence before or after. Warrior FAQ: must perform a
  legal Battle.
- **Engine:** `resolveTask` case `"action"`, op `bonusAfter`
  pushes the pip-cost main action task (`again`) and then the free bonus
  task behind it. `again` is not `required`, so its target list offers
  "Back". `cancel` just returns, leaving the free
  bonus queued and the pip unspent. Repeatable for unlimited free moves or
  influences. The `bonusBefore` path is safe (`required: true` plus a
  `rollback` snapshot, undone in `pump` if no legal main action
  follows).
- **Change:** on `bonusAfter`, either mark `again` `required` with a
  rollback like the before path, or make `cancel` on a task that has a
  queued free bonus also remove that bonus task. Prefer the first for
  symmetry.
- **Secondary (plausible):** taking either bonus sets `standardOnly`,
  hiding Court Enforcers' Abduct and Galactic Rifles for the
  pip-paid battle. Rulebook p.20 ties new actions to any pip- or
  resource-paid standard action, so the battle should still offer them.
  Remove `standardOnly` from the main action if cheap; keep it on the free
  bonus.
- **Tests:** Warrior: Battle, "Move after", Back: no free move, pip
  unchanged, back at the action list. Same for Feastbringer with
  influence. Keep `:1151` and `:599` passing.
- **Done in M1, with three differences from the list above.**
  1. *No Back after "after".* The preferred fix (mark `again` `required`
     with a `rollback`) removes Back from the paid action, as the
     `bonusBefore` path already did. So the test cannot press Back. It
     asserts that Back and skip are not offered, the pip is unchanged and
     the bonus is queued behind the main action. A second test per leader
     covers the rollback: with no legal main target the whole choice is
     undone to the action list, pip unchanged, nothing queued. Owner
     decision (competitive integrity): keep it this way; do not add a Back
     that restores the snapshot.
  2. *`standardOnly` removed* from the main action (both paths), because
     the rulebook "New Actions" section allows a new action whenever the
     standard action is taken by spending a pip or resource. The free bonus
     stays standard-only through `cost: "free"`. Owner decision: keep it
     removed.
  3. *New hole found and closed.* Removing `standardOnly` exposed the
     Abduct (BC14) and Galactic Rifles (L02) prompts on the pip-paid
     battle. `specialDecision` always offered its own Back, and cancelling
     it dropped the paid action while leaving the free move (queued in the
     "after" path, already made in the "before" path) with the pip
     unspent: the same exploit by another route. Fix: the `special` task
     carries `required` from the action task, and `specialDecision` omits
     Back when it is set. Choosing a special after a bonus is therefore a
     commitment. Standalone specials (no bonus) keep Back.
  Tests: four for item 1 and two for item 3 (Warrior, both bonus orders,
  Galactic Rifles), built with `table()` and ending in
  `assertDeepInvariants`. Not covered: Abduct after a bonus (same code
  path as Rifles; add in M15 if wanted).

### A5. C8: Elder Broker Trade can give the paid slot
- **Card:** "Trade (Tax): Choose a Rival city you control. Swap 1 resource
  with that Rival: take a resource of that city type from them, and give
  them a resource they don't have."
- **Engine:** `tradePairs` builds give/take options from
  `pl.resources` before payment, including the slot about to be spent.
  `resolveSpecial` calls `pay` first; a resource-paid Trade
  (Psionic for Tax) moves that slot's token to `s.held`, then the swap
  hands the rival `null`. Cloud Cities guards the same case
  with `i !== t.cost`.
- **Change:** in `tradePairs` (or where the special decision is built),
  skip `give === t.cost` when `t.cost` is a slot index.
- **Tests:** Psionic-paid Trade never offers the paying slot; pip-paid
  Trade unchanged (`:1006`, `:1454`).
- **Done in M3** (see section 11). Also threaded `cost` through
  `specialTargets` so Trade is not listed when the paying slot is the only
  token the Broker could give.

### A6. C1: Ancient Holdings' 4-key slot is positional
- **Card (L13):** one extra resource slot with raid cost 4.
- **Engine:** `capacity` adds 1; `resourceKeysFor`
  appends `[4]` after the board keys, so the card slot is always the last
  index. `cleanResources` grows the array by appending `null`
  and shrinks it by removing the first `null`, never moving tokens.
  Building a city shifts a token held on the card onto a board slot (and
  leaves the card slot empty); a city returning can do the reverse.
- **Change:** keep the card slot anchored. Simplest: in `cleanResources`,
  when the player holds L13, insert new empty slots and remove empty slots
  from the board portion only (indices `< length-1`), so the last element
  stays the card slot. Then the existing `needsArrange` step lets the
  player rearrange.
- **Tests:** token on the card, build a city: token still on the 4-key
  slot. City returns at chapter end with L13: card token stays; a board
  token is the one that overflows. Raid choices price the card token at 4.
- **Done in M3** (see section 11). Needed a per-player `cardSlot` flag and
  an `addToken` helper beyond the plan; loss of the card follows the
  rulebook (discard returns the token to the supply, theft carries it).

### A7. C2: Tycoon's Charm trade offered with nothing to trade
- **Engine:** `preludeDecision` offers "Trade Material and Fuel for
  new resources" whenever Tycoon is declared; the form has
  `min: 1` and zero options when no Material/Fuel is held; no Back.
- **Change:** offer the choice only when at least one Material or Fuel
  token is in a board slot. (Also see C11/item 12: give forms a Back.)
  **Done in M3, as "any slot"**: the card slot is spendable, so a token
  there counts (see section 11).
- **Tests:** Tycoon declared, L28 held, Relics only: choice absent. One
  Fuel: offered with one option.
- **Already caught by F-1:** the explorer driver hits this on seed 44 (and
  286 of 400). `tests/simulations.test.js` lists seed 44 in `KNOWN`, so it
  runs as `todo`. (Removed in M3; `KNOWN` is now empty.) Remove that entry once fixed; the explored game must then
  pass. The timeout policy (`timeout-policy.js`) submits `[]` on this
  form too, which the engine rejects.

### A8. C9: Populist Demands refills the Court before the declaration's follow-ups
- **Done in M4** (see section 11).
- **Rule** (p.13 Secure): resolve the When Secured action, then draw to
  refill. Effects the declaration triggers (Noble Connected, Demagogue
  Bold, Farseers, Upstart's resource) are part of resolving it.
- **Engine:** `declare` queues its triggers as pending tasks via
  `pushEffects`; `resolveVox` then calls `finishVox`,
  which `refill`s at once. The triggers run after the refill,
  so Noble's Connected draw takes the second card instead of the top one,
  and Bold can target the refilled card.
- **Change:** for Vox cards whose effect declares, defer `finishVox` until
  the pending effects resolve: push a `voxFinish` task behind them (or run
  the declaration triggers synchronously for the Vox path).
- **Tests:** Noble + Populist Demands: Connected takes the former top
  card; the refill is the next one. Demagogue Bold after Populist Demands:
  the refilled slot is not an influence target.

### A9. C3: Sprinter Drives bonus move is one group, once
- **Done in M4** (see section 11).
- **Card (L03):** "When you move fresh Loyal ships, you may move any of
  them one more time." FAQ: "Choose a group of any number of fresh Loyal
  ships that just moved, and move them one more time." Not recursive; the
  bonus move may Catapult.
- **Engine:** after the bonus group moves, `resolveForm`
  re-queues a `sprinter` task with the remaining just-moved fresh ships and
  `pump` keeps offering it.
- **Change:** do not re-queue. One `sprinter` task, one group from one
  system, one extra move.
- **Tests:** Catapult drops 2 ships at gate A and 2 at gate B: after the A
  pair's bonus move, no further sprinter task. Moving 1 of 3 from a system:
  the other 2 get nothing. `:761` keeps passing.

### A10. Item 9: battle decisions the engine makes for the player
- **Agitator's Weapon discard** (`resolveBattleDice`,
  `indexOf("weapon")`): when the Agitator holds more than one Weapon
  token, push a defender task to choose the slot (actor change =
  boundary). Auto-discard only when exactly one is held. Test both.
- **Reroll none** (`resolveForm` "rerollSelect"): append the
  ability to `used` only when at least one die was rerolled. Test: confirm
  with none selected, ability still offered; reroll one, not offered.
- **Empty reroll step** after a 0-dice battle: in `pump`, when `dice` is
  empty skip the "resolve or reroll" task and go to `battleEnd`. Test:
  0 dice, no reroll decision, Repair Drones still fires.
- **Pin the Agitator intercept rule** with a test: intercept symbol
  rolled, defender has no fresh ship but has Agitator and a Weapon:
  Weapon-icon hits are dealt and one Weapon discarded (rulebook p.14:
  interception is defined by the roll).
- **Done in M5** (see section 11).

### A11. Item 10, label part: `publicActivity` keys
- `publicActivity` keys `effectOrder` and `farseersDraw`
  never match; task types are `effects` and `farseersDiscard`. Rename the
  keys. Test that non-actors get the specific label for both.
- **Done in M5** (see section 11).

## 3. Phase B: lenient declare and seize timing (item 16)

- **Rule** (p.22 Turn Etiquette): declaring and seizing happen before
  other actions, but players allow them during the turn as long as no new
  information has been revealed (dice rolled, card drawn) and modifiers
  are followed. Owner decided: lenient.
- **Engine before:** `mainChoices` offers declare and seize only
  while `!turn.acted`; `pay` and `usePrelude` set `acted`
  on any pip, resource spend or Guild/Lore Prelude (BC16 and L27 excepted).
  Side effect (C10): backing out of a Union with Skip still locks
  declare and seize.
- **Change:** add `s.turn.revealed`, set when, during a turn: `random(s)`
  is called; a card enters any hand or leaves any deck (Court refill after
  secure, Farseers, Call to Action, Union draws, Noble Connected); a task
  is handed to another player (defender responses, casualties, Predictive
  Sensors, Railgun). Gate declare and seize on `!turn.revealed` instead of
  `!turn.acted`. Keep `acted` as the gate for Upstart (LEAD04: "must
  declare before taking any actions, including Prelude actions from
  resources") and Tycoon's Ambition (L27: "before taking any other
  actions"). Late declaration still places the zero marker. Seize still
  discards an extra card face down.
- **UI:** Declare and Seize buttons stay visible until `revealed`; after
  that the panel shows a one-line reason reusing the boundary strings
  ("Dice were rolled; declaring is closed").
- **Tests:** declare after a build allowed; after a capturing tax allowed;
  after a Prelude Fuel move allowed; after a battle roll refused; after a
  secure that refilled the Court refused; after skipping a Union allowed;
  Upstart after any action refused; L27 after any other action refused;
  seize after a move allowed, after a roll refused; the timeout policy
  never declares after a reveal.

## 4. Phase C: client and log changes

### C-1. Item 7: ambition text for Tyrant and Warlord (strings only)
Replace in `src/App.jsx`:
- Tyrant: "Most Captives. Captives are rival agents you take by taxing
  their cities or securing Court cards they have agents on, plus a few card
  abilities such as Abduct and Gate Ports. If Tyrant is scored at chapter
  end, every player's Captives go back to their owners' supplies. If it
  was not declared, they stay and carry over."
- Warlord: "Most Trophies. Trophies are rival ships, cities, starports and
  agents you destroyed, plus agents taken by Ransacking the Court and
  Captives executed with Prison Wardens. If Warlord is scored at chapter
  end, every player's Trophies go back: ships and starports to their
  owner's supply, cities to their owner's player board (which can cover a
  resource slot and force a discard). If it was not declared, they stay
  and carry over."
Also: `title` tooltips on the Captives/Trophies mat sections
(`src/PlayerTable.jsx`): "Returned to owners at chapter end if Tyrant
was declared" / "... if Warlord was declared". Replace the mat help
sentence (`PlayerTable.jsx`) with: "Captured rival agents go in
Captives (Tyrant); rival pieces you destroy go in Trophies (Warlord). Both
return to their owners at chapter end only if that ambition was declared."
Leave `src/sharedBoard.js` labels alone.

### C-2. Item 2: closing a card opened from the library returns to the library
One modal shell in `App.jsx` driven by `modal` ("library",
"court-discard", ...) and `detail` (card id). Three close paths clear both:
X button, backdrop, Escape. Change:
when `detail` is set and `modal` is "library" or "court-discard", close
only `setDetail(null)`; a second close dismisses the library. Preserve the
library's tab, search query and scroll position. Cards opened from the
board (no `modal`) still close to the board.

### C-3. Item 4: show the setup card when choosing a setup
Create-table form "Setup card" `<select>` inside a collapsed `<details>`
(`App.jsx`). Assets exist unused:
`public/assets/setup-{2,3,4}p-{01..04}.webp`, mapping `3SETUP04` to
`setup-3p-04.webp`. Show the selected card's image beside or below the
picker, large enough to read cluster labels; for "Random official setup"
show the candidates for the player count as a strip. Changing player count
already resets the setup to random; the preview follows. Style like the
card modal (gold border art on dark field, room, subtle shadow). Optional:
tap to open full-size in the existing card modal.

### C-4. Item 5: draft pick order strip
During the Leaders & Lore draft (`App.jsx`) nothing shows whose
pick it is. Rule (p.21): picks start right of the initiative holder and go
counterclockwise every pass; initiative holder picks last. Engine: start
`(initiative + n - 1) % n`, step backwards skipping finished
players. Passes: `1 + loreCount`; a player may take lore before
leader, so passes are by pick count. Show a strip of player chips in draft
order, one per pick for every pass; completed picks dimmed with what was
taken; current pick highlighted; future plain; mark the initiative holder.
Derive purely from the view: order from `initiative - 1` backwards,
repeated; current index = total picks made (each player's `leader` set +
`cards.length`). Archivist (LEAD09) private pick: a note in that chip, no
card names.

### C-5. Item 1: notify everyone of clock changes and turn arrival
- Diff `room.notices` between WebSocket messages keyed on each notice's
  `at` (list capped at 20; don't key on length). Show each new notice as a
  transient toast to every player. Keep the collapsed "Timer activity"
  list as history. On reconnect, show notices newer than the last seen.
- For the affected player (clock extended, AI took over), flash
  `document.title` while the tab is unfocused.
- Also flash the title whenever the actor changes to you, and turn the
  existing 660 Hz chime (`App.jsx`) on by default with a mute in
  Settings (before, it was off unless `localStorage` "arcs-sound" was "yes").
- Relevant: `server/clock.js` (`changeClock` writes notices),
  `server/index.js` (`broadcast`), `src/TurnTimers.jsx`, `App.jsx`
  (`room.clock.blocked`). Out of scope: sounds beyond the chime, the
  Notification API.

### C-6. Item 11: confirm step on one-click irreversible commits
- "Pass initiative" is a lone button whenever you lead and no card is
  picked (`CommandPanel.jsx`,); `historyBoundary` commits on
  `op === "pass"`.
- Clicking a Court card during a Secure action secures it (`App.jsx`
 ; labelled "Secure card ↗" but no confirm); the refill is a
  boundary.
- Clicking a system during Battle with exactly one target starts the
  battle (`selectBoard`); with Predictive Sensors or Railgun on the
  defender the handoff is a boundary before any roll.
- Change: a small confirm (same style as End turn's "Review & confirm")
  on Pass, Secure and Battle. Also add the confirm on face-up card plays
  (undoing one reveals the undoer's hand). Add coverage to the Playwright
  `scripts/ux-flow-check.mjs`.

### C-7. Item 12 and C11: small UI fixes
- `App.jsx` runs `setSelected(null)` on every revision, so an open
  "System details" modal falls through to the generic rules page. Keep
  `selected` across revisions while the system exists.
- `CommandPanel.jsx` shows the move instruction ("click a glowing
  destination") for `catapultSelect` and `sprintSelect`, whose
  `destinations` are empty; only "Confirm selection" works. Use a "select
  ships, then confirm" instruction for those two.
- `server/index.js` `join` accepts duplicate names; the log is
  name-keyed. Reject a name already seated at the table.
- Forms have no Back: `moveSelect`, `dice`, `catapultSelect`,
  `sprintSelect`, `predictive`, `rerollSelect`, `farseersDiscard`, the
  `special` forms (L02/L16/L28/BC12), and the `relicFence` task
  (offers only discards). Add a Back/cancel to each where the
  rule is a "may"; relicFence and L28 are the traps.
- FAQ and errata appear only in the card detail modal (`App.jsx`,
  matched on `e.card === CARDS[id].name`). Index FAQ text in
  library search, badge cards that have clarifications, make
  `$link:X$` references open that card (before, `rulesText` stripped them).

### C-8. Item 10: battle visibility
- Log the rolled faces after the roll (before, a count only) and
  after each reroll naming the ability (`resolveForm`; Galactic
  Rifles writes nothing).
- Log one line when a raid ends with nothing stolen and why (`pump`
  "raid": no attacker survived / keys exhausted / nothing
  affordable).
- Keep a per-chapter list of `lastBattle` snapshots in the view, shown
  from the History panel ("Review latest battle dice", `App.jsx`
 ), instead of only the latest.
- Tests: faces present after roll and reroll; each raid auto-end branch
  logs a reason.

## 5. Phase D: item 6, time bank

**Today:** only a per-card-turn limit. `server/clock.js` records
`total[seat]` (time as actor across the game, including responses in
rivals' turns, frozen on pause, never refunded by undo) but nothing
enforces it; `clockView` compares `spent[seat]` to the per-turn allowance.

**Model:** three knobs replace `seconds`:

| Knob | Meaning | 0 = off |
|---|---|---|
| `turn` | max seconds per card turn (the old setting) | no per-turn cap |
| `bank` | total seconds for the whole game per player | no bank |
| `increment` | seconds added to the bank each time your card turn starts | plain bank |

```
turnRemaining = turn*1000 + turnBonus[seat] - spent[seat] - running
bankRemaining = bank*1000 + bankBonus[seat] - total[seat] - running
remaining     = min(of whichever are enabled)
```

Everything downstream (`blocked`, `assertClockOpen`, the 750 ms loop,
client countdown, pause/extend/configure) reads `remainingMs` and is
unchanged. Old rooms have no `bank`; `validateTimer` defaults it to 0.

**Decisions:**
1. Bank at zero: with `increment > 0` the player gets only the increment
   per card turn; with `increment = 0`, expiry applies at once on each of
   their decisions (`auto`: AI plays their turns for the rest of the game;
   `pause`: freezes at each of their turns until the host extends;
   `overtime`: negative bank shown).
2. Responses inside a rival's turn: first 10 s free. In `settleClock`,
   subtract up to 10,000 ms of grace per response stretch before banking,
   only when the actor is not the turn owner.
3. Draft picks (turn key `draft:<seat>`) never charge `total`; the draft
   uses a per-turn clock only: the table's `turn` if set, else 2 minutes.
4. Host extend adds to `bankBonus[actor]` when a bank exists and to the
   per-turn bonus when a turn cap exists (both if both). `configure`
   resets `spent`, `turnBonus`, `bankBonus`, not `total`.

**UI** (`src/TurnTimers.jsx`): host form with turn / bank / increment, each
with an "off" state, and a one-line summary ("5 min per turn, 40 min bank,
+30 s"). Chip shows the binding value and which ("turn 3:12" / "bank
24:50"); per-seat rows show bank remaining with total used. Item 1 toasts
cover "bank empty, AI will play X's turns".

**Validation:** `turn`: 0 or live 60-3600 s, async 3600-604800 s. `bank`:
0 or live 300-36000 s, async up to 604800 s. `increment`: 0-600 s. At
least one of `turn`/`bank` set when mode is not `off`.

**Tests:** bank expiry; min of both; increment credited at turn start;
response grace; draft exempt and the 2-minute default; old rooms
unaffected. No changes to `timeout.js` or `timeout-policy.js`.

## 6. Phase E: item 3, action discard pile (Solution A, official split piles)

**Current engine:** one array `discard`. Chapter start (`deal`,):
full deck shuffled, 6 cards each, leftovers shuffled again and placed as
the pile (4 cards in 4p, 2 in 3p, 8 in 2p). Round end: every
played card pushed on top in play order, face-up and face-down mixed.
Draws from the bottom (index 0): 2p mulligan (then whole pile
reshuffled), Farseers (its own discards shuffled before going on
top), Call to Action. Chapter end rebuilds the pile. `viewFor`
omits `discard` entirely; the UI shows nothing, not even a count.

**Why change:** the face-up plays are already public via the log (last
150 lines), so hiding the pile only penalises players who don't scroll.
And because discard order is deterministic and play order public, the
pile layout is computable: once the unseen leftovers are drawn, Farseers
returns a specific known card (3p: discard 2, draw 3, the third card is
round 1's lead). No physical table has that.

**Rule** (Fine Print, "Split Discard Piles"): two piles, one for cards
played face down and one for cards played face up; draw from the
face-down pile; if it has too few, shuffle the piles together first.
Setup step Q puts undealt cards face down into the discard; round-end
step 4 discards seize cards face down.

**Build:**
- Two arrays, e.g. `discardUp` and `discardDown`. Lead, Surpass, Pivot
  plays go to `discardUp`; Copy and Seize cards, chapter-start leftovers,
  Farseers' own discards (face down) go to `discardDown`.
- All discard draws (mulligan, Farseers, Call to Action) take from the
  bottom of `discardDown`. If it is short, merge: shuffle both piles into
  one face-down pile, start a new empty face-up pile, then draw.
- Chapter end rebuilds both from scratch as before.
- `viewFor`: send `discardUp` in full (public, every card certainly there)
  grouped by round, plus `discardDownCount`. Draws log only "X drew N
  cards". After a merge, log "shuffled N face-up cards into the face-down
  pile" and the panel shows the new count.
- UI: a live "Action discard" panel (face-up cards by round, face-down
  count). Reachable like the Court discard viewer.
- Keep `assertInvariants` action-card uniqueness across hands + played +
  both piles.
- **Tests:** face-up vs face-down routing per play mode; seize card
  face down; leftovers face down; Farseers draws from the face-down bottom
  and never returns a face-up card; merge when short (3p, 2 leftovers, no
  copies, Farseers digs 3); mulligan path; Call to Action; view exposes
  the face-up list and only a count for face-down; the log never names a
  face-down card.
- Known tradeoff accepted by the owner: face-up cards are gone for the
  chapter, a small Farseers nerf. Solution B (one pile, shuffle each
  round's cards, cumulative viewer) is the documented fallback if the
  group misses base-game Farseers; it can be added later as a table option
  without reworking the panel.

## 7. Phase F: tests only

### F-1. Item 13: simulation driver and invariants
- `game/autoplay.js` in the turn phase keeps only declare / action /
  endTurn and always picks the first `min` form options. Add a second
  driver that samples every op (Prelude resource actions, Guild/Lore
  Preludes, Seize, Pass, Prepare, Back/cancel) with some probability and
  random subsets of form options; run over more seeds. Keep the current
  driver for the timeout tests.
- Extend `assertInvariants`: agent conservation per player
  (map + Court + captives/trophies held by anyone + outrage + supply = 10;
  requires exposing the clamp in `pool`), captive/trophy owner and type
  validity, marker count and flip state, Court card conservation (court +
  deck + discard + player cards + unions = full set), action-card
  completeness, hand size <= 6, Power <= track max, `s.current` and
  pending actors valid, `held` empty outside Prelude, `turn.pips >= 0`.
- `fixture()` (since replaced by `table()`) hand-sets `phase`, `turn`, `lead`
  while the lead card is still in hand and discard, and `task()` replaces
  the pending stack. Add a helper that reaches a turn by playing cards and
  move round-end and initiative tests onto it.
- **Done in M0, with three changes from the list above.** Agent check is
  physical agents (map + Court + captives/trophies + scrap) <= 10, with
  Outrage checked separately: the rulebook lets Outrage use a placeholder
  when no agent is in supply. Dropped "hand size <= 6" (Unions and Call to
  Action legally exceed it) and "Power <= track max" (the rulebook gives
  no maximum). Do not re-add them. The fixture helper is `table()` in
  `engine.test.js`; the explorer is `exploreInput` in `autoplay.js`.

### F-2. Item 14 and the card-pass test lists
Fixture cleanup (from M0): these eight tests hand-build states that real
play cannot reach, so they fail the F-1 checks if checked after every
move. Rebuild each setup with `table()` or keep it consistent (every card
and agent in exactly one place) when touching the test: `copy, pivot and
surpass` (`:217`, M14); `LEAD08 Demagogue needs two agents` (M15); `BC17
Farseers draws from a short discard`, `BC30 Guild Struggle still
reshuffles`, and the BC26/BC27/BC28/BC31 `resolve and discard, refill
Court` loop (M16). Once all eight are fixed, check after every move in
`engine.test.js` by wrapping `transition` with `assertDeepInvariants`.

Rules probed correct, no regression test. Battle: hits spill to buildings
only after the last defending ship; intercepts do not stack; self-hit and
intercept destructions are the defender's Trophies; raid auto-ends when no
attacker survives; raid affordability by slot cost; raid dice allowed when
the defender has no buildings anywhere; damaged attackers count toward the
dice limit; fleet revive skipped when a starport remains or the pool is
empty. Turn and scoring: rank-7 declare any; 7-surpass auto-seize and its
suppression; lead keeps initiative with no surpass; empty hands skipped
mid-round; `cityBonus` once per ambition; early end at 27/30/33; marker
flips after chapters 2 and 3; Cartel and Lavish chapter-end discards;
Outrage blocking a Prelude action for a non-Loyal holder; 2p neutral
scoring; a returning Trophy city forcing overflow; Catapult only from Loyal
starports, control before entry, stop at planets; rival-city tax with empty
resource supply still captures.

Tighten: `${leader} scoring penalty` (`:348`) tied and second cases; `tax
city once per turn...` (`:295`) empty-supply case; copy/pivot/surpass
(`:217`) pivot pips and suit; chapter-five tie-break (`:1178`) must
distinguish holder from earliest-from-holder.

Leaders (C7): assert each leader's starting resources and A/B/C pieces
against `LEADER_SETUP` (the loop at `:153` checks invariants only);
Fuel-Drinker Lavish; Demagogue Bold; Noble Influential; Shaper Ancient;
Paranoid's Ransack exemption; Anarchist Inspiring rival-city clause; Rebel
Disorganized on a normal move.

Lore (C5): L05 ships built fresh in rival-controlled systems; L08 and L11
gate buildings, one per gate across players; L20 Catapult from a rival
starport and damaged build; L06 a rolled intercept actually ignored; L11
gate-city Outrage for every cluster type and none for untyped; L13 held
item (A6); L18 destroy-target branch; L28 Fuel Outrage clear.

Guild/Vox (C12): keep-on-Outrage for BC01/07/19/21; Cartel after-scoring
discard even when Tycoon not scored; BC16 actual seize; BC20 resource
steal; BC21 spend as Relic; BC25 on Surpass and no zero marker; BC29
shuffle-back; BC30 actual steal; BC31 bottom draw.

Errata (E1): Upstart cannot tax uncontrolled cities even with Empath's
Bond; Empath's Bond build damaged in rival-controlled system, fresh
otherwise; Agitator via Mirror Plating; Populist Demands leaves
`lead.rank`; Force Beams no Gate Ports capture and no Catapult; Unions
removed from `cards` and unstealable once placed.

FAQ (E2): Cartel resources count for ambitions and Keeper's Solidarity,
not for Relic Fence, not stealable, Prelude discard with nothing to steal;
Galactic Bards seize/declare either order and 7 = any; Noble Connected
retrigger on Populist Demands, not on Farseers; Overseer once per turn,
Outrage before gain, free repeat; Warrior rollback and Catapult; Cloud
Cities Outraged payment and one per planet; Keeper's Trust thief's Cartel
counts; Raider Exosuits unlimited when no buildings anywhere;
Silver-Tongues discard with nothing; Predictive Sensors no Catapult; L27
with zero Material/Fuel; Demagogue Bold one per card; Corsair reroll once.

### F-3. Item 18: reconnect mid-decision (server test)
Reconnect already works (client retries every 2 s, HTTP poll every 15 s,
`App.jsx`; server rebroadcasts the full per-seat view on auth,
`server/index.js`). Add to `tests/server.test.js`: reach a pending
decision for seat A; close A's socket; B cannot act, revision unchanged;
reopen A, send credentials, first message has the same revision, decision
title and choice count; with A disconnected the host extends A's clock;
reconnect A, newer revision and same decision; an unauthenticated socket is
closed within 5 s.

## 9. Claims checked against the rulebook and rejected

Each of these was raised in review and checked against the rulebook; the
engine is right. Do not "fix" them.

- Chapter end when the initiative holder has no cards: p.8 says they must
  pass to the next player with cards. `endRound` is right.
- Buildings need control: p.12 says "a system with a Loyal piece", built
  damaged if a rival controls. `buildSites`/`build` are right.
- Ransack optional: p.16 lists it as a required step. Forced Ransack is
  right.
- Feastbringer Generous tie: p.22 breaks unspecified ties in turn order.
  Engine does that.
- Catapult control after arrival: p.13 says before. Engine right; also
  Loyal starports only, stops at any planet.
- Agitator needs a fresh defender: p.14 defines interception by the roll.
  Engine right.
- Outrage with no agents should take one from the Court: p.22 says
  placeholder. Engine right.
- Tyrant 2p neutral value: p.4 assigns none. Round counter on pass: p.8,
  a pass ends the round. `DATA_DIR`: the Dockerfile sets `/data`.
- Prelude on a card secured this turn: p.20 forbids it in the same
  Prelude; `acquired` resets at the next card play, equivalent. Stolen
  cards are not "secured", so immediate use is right.
- Song of Freedom "city you control": p.7, control covers the system's
  contents; the system-control filter is right.
- Undealt cards at the bottom of the discard: setup step Q. Right (and
  item 3 replaces the pile anyway).
- Force Beams / Survival Overrides on free actions: p.20 ties new actions
  to pip or resource spends. Exclusion is right.
- Empath's Bond captives when you control the system: the Bond is a
  "may"; the normal tax with a Captive is the better choice. No change.
- Nurture triggering Copy-to-tax leaders: p.20, tax modifiers apply to the
  Tax inside a new action. No change.

## 10. Known and accepted (no work)

- `history.steps` stores `before` and `after` per step; ~1.6 MB room at
  40 steps, parsed per request and again on broadcast; 15-30 ms per click
  in a long Prelude. Fine at this scale.
- No way to end, abandon or transfer a game; an absent host on an untimed
  or paused table blocks everyone. Low priority.
- "Finish Prelude" costs a click every turn. Design choice.
- Noble "Connected" temporary Court lanes are never spliced out; harmless,
  filtered from views.
- No UI test runs in `npm test` or CI; `npm run test:ux-sweep` (M17) is the
  manual UI regression check and needs a dev server plus Chrome.
- The dock's automatic height is capped at 46% of a tall window (M17), so a
  long command panel (a Prelude with many abilities) leaves the map about
  370px on a 14" MacBook and 330px at 900px tall; the panel scrolls to reach
  its last button and the dock can be dragged taller. Windows under about
  870px keep the older 400px map reserve.

## 11. Milestone log

One entry per milestone: what was done, what was found on the way, and what
changed as a result.

### M0: safety-net tests (F-1)
See F-1 above. Test-only invariants, second explorer driver, `table()`.
Baseline after M0: 303 tests, 302 pass, 1 `todo` (A7, explored game 44).

### M1: Warrior / Feastbringer "after" exploit (A4)
- **Fixed:** `bonusAfter` queued the paid action as optional, so Back
  dropped it and left the free bonus with the pip unspent. It is now
  `required` with a `rollback`, like `bonusBefore`.
- **Found and fixed on the way:** the special-action prompts (Abduct,
  Galactic Rifles) had their own Back that reopened the same exploit once
  `standardOnly` was removed. They omit Back when started from a bonus.
- **Changed by decision:** `standardOnly` removed from the paid action
  (rulebook p.20); no Back after choosing "after"; a special chosen after a
  bonus is a commitment.
- **Checked, no change needed:** no roll can be undone on these paths. The
  automatic undo (`pump`) only fires before any dice, and every Back sits
  before the roll. Cloud Cities (`cloudTarget`) is Build-only, so it cannot
  reach this path.
- **Worth knowing:** M0's explorer did not find this exploit, even though
  it presses Back; it needs a Warrior or Feastbringer holder in a copied
  battle or secure. The M14 Back-button sweep covers it.
- **Files:** `game/engine.js` (`resolveTask` "action", `specialDecision`),
  `tests/engine.test.js` (six new tests).
- **Result:** 309 tests, 308 pass, 1 `todo` (unchanged; belongs to M3).

### M2: turn order and declaration fixes (A1, A3)
- **A1 fixed:** `resolveMain` "pass" now advances `s.initiative` to the next
  player with cards before the all-passed check, so the final pass hands
  the marker on and the first passer opens the next chapter. The game-end
  tie-break (`endChapter`, ordered from `s.initiative`) follows. The advance
  loop is bounded, so a table with no cards cannot hang it.
- **A3 fixed:** `turn.declared` is now `turn.leadDeclared`, set only when
  `declare` is called with `lead` (the `"declare"` main choice). The flag
  rides on the `generous` task, so a Feastbringer declaration made through
  Populist Demands does not set it when the guild is given. BC25's pivot
  path still uses `roundDeclared`.
- **Changed to make A3 work (decided: keep):** Tycoon's Ambition (L27) no
  longer sets `turn.acted`. Before, `tycoonDeclare` set `acted`, which hid
  the lead-card declaration and Seize regardless of the flag, so "L27 then
  lead card" stayed blocked. The card text (`data/cards.json`) supports
  this: it is a Prelude, "before taking any other actions", with
  "(You may do this just after declaring Tycoon.)", so it sits beside the
  lead declaration rather than replacing it. L27 still has to come before
  the first action (`!acted`).
- **L27 once-per-turn is not printed on the card.** It came from the plan
  and is now enforced by `turn.used` (like BC24), previously by `acted`.
  Kept as a harmless guard: a second use would need fresh Material or Fuel
  before any action. Drop the guard if a literal reading is ever wanted.
- **Found:** an existing test encoded the A1 bug (`chapter five finishes
  with Power winner and initiative tie-break` expected the last passer, 3,
  to win a 0-v-3 tie). Rewritten to expect 0, plus a second tie-break test
  from a non-zero initiative.
- **Found:** A3 mentions an existing lead-then-L27 test. There was none;
  the only L27 test used `tycoonDeclare` alone. The lead-then-L27 order is
  now covered by the new tests.
- **Found:** A3's first test as written (secure Populist Demands via Relic
  or Tyrant's Ego, then declare the lead card) cannot happen in real play
  yet: both set `turn.acted`, and the lead declaration is gated on
  `!acted` until Phase B (lenient timing). The new Populist tests inject the
  vox task directly on an un-acted turn to isolate the flag. Revisit with
  real-flow tests when Phase B lands.
- **Files:** `game/engine.js` (`declare`, `mainChoices`, `resolveMain`
  "pass"/"declare", `resolveTask` "generous", `preludeAvailable` L27,
  `resolvePrelude` tycoonDeclare), `tests/engine.test.js` (ten new tests,
  two edited).
- **Result:** 319 tests, 318 pass, 1 `todo` (unchanged; belongs to M3).
  Against the old engine, 9 of the changed or new tests fail.

### M3: resource and slot bugs (A5, A6, A7)
- **A5 fixed:** `tradePairs(s, p, cost)` skips `give === cost` (cost is a slot
  index only for resource-paid actions; `"pip"` and `"free"` never match).
  `cost` is threaded through `specialTargets` from both callers (the action
  list in `mainChoices`-style `costs` loop, and the target prompt), so a
  resource-paid Tax no longer lists Trade when the paying slot is the only
  token the Broker could give; before, that opened a special prompt with
  only Back.
- **A6 fixed:** `cleanResources` splits the L13 card token off the end,
  resizes only the board portion, and puts it back last. Needs one new
  player field, `cardSlot` (true when the array currently ends with the
  card slot), because array length alone cannot tell "board grew" from "L13
  just gained" (both add one slot). `cardSlot` is set lazily by
  `cleanResources` (`?? has L13` for older saves), so no migration. New
  helper `addToken` (used by `gain` and `steal`) inserts a token that has
  no empty slot to land in *before* the card slot instead of after it.
- **A6 extra rules I added (worth a look):**
  - An empty card slot absorbs a board token that would otherwise overflow.
    Without this, discarding the card token during an overflow looped
    (overflow cleared by the count check, then re-raised by the layout).
  - Losing L13 follows the rulebook (resources "held on cards"):
    discarded, buried or scrapped returns the token to the supply (done in
    `cleanResources`, which sees the card gone); stolen carries the token
    to the thief's new card slot (`carryCardSlot`, called from `steal`).
    An earlier draft of M3 moved the token to a board slot; that was wrong
    and is corrected. In today's engine L13 cannot actually leave a player
    (only Guilds are stealable or discardable), so this is future-proofing;
    the steal test makes L13 stealable temporarily to exercise it.
  - `needsArrange` is still set whenever the board portion is over
    capacity, so the existing arrange step still runs.
- **A7 fixed:** `preludeDecision` adds `tycoonTrade` only if some slot holds
  Material or Fuel. The timeout bot needed no change: with the option
  gone, the empty form can no longer be reached, and with one Fuel it
  picks that slot (`options.slice(0, min)`). Test covers it.
- **A7 decision:** "any slot", not "board slot". The form (and the card:
  "discard any number of Material and Fuel"; the rulebook: resources held
  on cards "can be spent") already allow the card slot, so a stricter
  check would hide a valid trade.
- **Found, not fixed:** `preludeAvailable` has a dead `L28` clause
  (`active tycoon && has Material/Fuel`) after an earlier line that already
  returns `true` for L28. L28 is always listed because its second Prelude
  (clear Outrage) needs no Tycoon. So with Tycoon active and no
  Material/Fuel, the Charm's prompt can now be just "Clear Outrage" plus
  "Done". Harmless; left alone.
- **Found, test helper:** `resources()` in `tests/engine.test.js` builds a
  slot array directly, so it now also sets `cardSlot` to match; without
  that, hand-built L13 states looked like "L13 just gained" and
  reshuffled. Real play never hits this.
- **Files:** `game/engine.js` (`addToken`, `carryCardSlot`, `cleanResources`,
  `gain`, `steal`, `tradePairs`, `specialTargets`, `preludeDecision`),
  `tests/engine.test.js` (twelve new tests, helper tweak),
  `tests/simulations.test.js` (`KNOWN` emptied; explored game 44 passes).
- **Result:** 331 tests, all pass, 0 `todo`. Against the old engine, 5 of
  the new tests plus explored game 44 fail; the rest are regression guards.

### M4: Secure/Court sequencing and Sprinter Drives (A8, A9)
- **A8 fixed:** `resolveVox` now defers `finishVox` whenever the card's
  effect queued tasks. It counts the tasks pushed during the effect (for
  Populist Demands: Generous, Ambitious, Bold, Noble, Farseers, or one
  `effects` bundle) and splices a new `voxFinish` task in directly behind
  them, so the discard and the Court refill run only after all of them, and
  after anything they push in turn (those go on the front). `voxFinish` is
  an auto task in `pump`, so players never see it. With nothing queued the
  refill still happens at once. BC29's shuffle-back is preserved
  (`voxFinish` recomputes the flag from the card id).
- **A8 scope:** Populist Demands (BC27) is the only Vox card that
  declares. The deferral is generic, so it also covers Mass Uprising's
  Prelude placements (fewer than 4 ships in supply) and Song of Freedom's
  seize choice. Neither reads the Court, so nothing was wrong there; this
  makes "resolve, then refill" (rulebook p.13) uniform. The other Vox cards
  (BC28, BC30, BC31) queue nothing and are unchanged.
- **A9 fixed:** the `sprintSelect` branch of `resolveForm` no longer pushes
  a follow-up `sprinter` task. One `sprinter` task offers a group from one
  system; that group gets one extra move (which may Catapult, as before;
  `finishMove` already ignores `extra` moves). The `pump` case for
  `sprinter` is unchanged; it still drops a task whose ships are all
  damaged.
- **Found, test helper:** the Vox card sits in the securing player's `cards`
  until `finishVox` discards it, so Court conservation holds while
  `voxFinish` is pending and `assertDeepInvariants` needed no change.
- **Tests (9 new, `tests/engine.test.js`):** Sprinter: Catapult leaving 2
  ships at each of two gates gets one group's bonus only; moving 1 of 3
  gives the other 2 nothing; the bonus move may Catapult and ends the
  chain. Populist: Noble draws the former top card and the refill is the
  next; Bold cannot target the empty lane and the lane refills after it;
  Generous keeps the lane empty until the Guild is given; no triggers still
  refills at once. Uprising: the lane stays empty through the Prelude
  placements. Freedom: the lane stays empty until the seize is answered
  (the refill is not predictable there, since the card is shuffled into the
  deck first). All end with `assertDeepInvariants`. The existing
  Sprinter test (`L03 Sprinter Drives moves grouped fresh ships...`) passes
  unchanged.
- **Files:** `game/engine.js` (`resolveVox`, `pump`, `resolveForm`),
  `tests/engine.test.js`.
- **Result:** 340 tests, all pass, 0 `todo`. Against the old engine, 7 of
  the 9 new tests fail (both Sprinter group tests, plus Noble, Bold,
  Generous, Uprising and Freedom); the Catapult-bonus and no-trigger tests
  are regression guards.

### M5: Battle decision fixes (A2, A10, A11)
- **A2 fixed:** `destroy` no longer looks at the `battle` flag. A rival
  destroying a city whose owner has LEAD01 (Elder) pushes no ransack task,
  whatever the source (battle hits, Galactic Rifles, Martyr). Outrage is
  still provoked. `rifleHits` is unchanged, so M1's Warrior/Feastbringer
  Rifles behavior is untouched (both M1 Rifles tests still pass).
- **A10 fixed:**
  - Agitator (LEAD15): with exactly one Weapon the engine still discards it
    automatically. With two or more it queues an `agitatorWeapon` task
    (actor: the defender, `p` set) ahead of the hits task; the defender picks
    the slot (`agitatorPay` choices). The hit count is taken before the
    discard, which matches the card ("1 hit per Weapon icon ... then you
    discard 1 Weapon resource", data/cards.json LEAD15).
    Added a decision guide entry for the new task type.
  - Reroll "none": `rerollSelect` records the ability in `used` only if at
    least one die was selected.
  - 0-dice battle: `pump` now handles a `reroll` task with no dice by
    resolving it at once (straight to hits/`battleEnd`), so there is no
    empty "resolve or reroll" decision.
  - Pinned: Agitator intercept is defined by the roll (defender with only
    damaged ships, one Weapon: 2 hits dealt, Weapon discarded).
- **A11 fixed:** `publicActivity` labels are now keyed `effects` and
  `farseersDiscard`.
- **Found, fixed (timeout bot):** with "reroll none" no longer spending the
  ability, the timeout policy looped forever (it picked Reroll with no blank
  dice, selected nothing, and was offered the same ability again; 5001
  decisions in the automatic full-game tests). `game/timeout-policy.js` now
  only chooses a Reroll when an eligible blank die exists. Any other bot or
  UI that auto-picks Reroll needs the same care; the client UI can still
  confirm an empty selection repeatedly, which is harmless.
- **Found, tests:** the decision-guide test counts `taskDecision` cases
  (43 to 44); updated. The LEAD16 test with a hand-built empty-dice
  `reroll` task still passes because `task()` does not run `pump`.
- **Tests (8 new, `tests/engine.test.js`):** Rifles on an Elder city (no
  ransack) and on a non-Elder city (ransack); Agitator with two Weapons
  chooses a slot; Agitator intercept pin; reroll none keeps the ability and
  reroll one spends it; 0-dice battle goes straight to Repair Drones;
  non-actor labels for `effects` and `farseersDiscard`. State-building tests
  end with `assertDeepInvariants`.
- **Files:** `game/engine.js`, `game/timeout-policy.js`,
  `src/decisionGuide.js`, `tests/engine.test.js`,
  `tests/decision-guide.test.js`.
- **Result:** 348 tests, all pass, 0 `todo`. Against the old engine, 6 of
  the 8 new tests fail (Rifles on an Elder city, Agitator slot choice,
  reroll none, 0-dice skip, and both label tests), plus the updated
  decision-guide count test; the Agitator intercept pin and the non-Elder
  Rifles case are guards.

### M6: lenient declare and seize timing (item 16, C10)
- **Flag:** `s.turn.revealed` starts `false` on every new turn and records the
  first reveal as a reason key: `"dice"` (any roll or shuffle), `"deck"` (a
  card drawn from the Court deck or the action discard), `"hand"` (a rival
  hand seen), `"rival"` (another player responds). Set through one helper,
  `reveal(s, reason)`, which is a no-op outside a turn.
- **Where it is set:**
  - `random(s)` itself, so every roll and every in-turn shuffle is covered
    by construction (battle dice, rerolls, Galactic Rifles and its Empath's
    Vision reroll, the Farseers discard shuffle, BC29 shuffle-back, BC30
    guild shuffle). Calls outside a turn (setup, draft, Archivist, deal,
    mulligan) have no turn to mark.
  - `refill` when a card is actually drawn (Court refill after secure,
    ransack, `finishVox` and `voxFinish`); Noble's Connected draw (`pump`
    `noble`); Call to Action's draw (`resolveVox` `call`); the Farseers
    Prelude draw (`resolveForm` `farseersDiscard`, marked before the shuffle
    so a zero-card discard still counts); the Farseers hand look
    (`resolveTask` `farseersRival`).
  - The end of `transition`: if the next decision belongs to someone other
    than `s.current`, the turn is marked `"rival"`. This mirrors the history
    boundary "Another player has a decision" and catches every handoff in
    one place: Predictive Sensors, Agitator's Weapon choice, Quartermaster's
    repair and Elder's Beloved influence for the defender, and a rival's
    `overflow` or `arrangeResources` (for example after Annex).
  - Railgun Arrays (`pump` `railgun`) when it fires. It is an automatic task,
    so the handoff check never sees it; marked explicitly because the plan
    lists it.
- **Gate (`mainChoices`):** declare and seize are offered while
  `!t.acted || t.revealed === false`. Inside that block, Upstart's lead
  declaration, Galactic Bards' declaration and Lattice Spies' seize still
  need `!t.acted`. L27 is unchanged (`preludeAvailable`, `!t.acted`).
  Declaring still places the zero marker (`zero: mode === "lead"`), and Seize
  still plays an extra card face down.
- **Decisions (proposed in M6, confirmed by the owner; see section 1):**
  - **The gate is "not yet acted, or nothing revealed", not just
    `!revealed`.** The rulebook (p.20, Prelude) puts declaring and seizing
    before Prelude actions in either order, and a declaration can itself
    reveal (Noble's draw, a Farseers look). With the plan's literal gate,
    declaring with Noble or Farseers would then close a seize (or, after
    L27, the lead declaration) that the printed rule and the old engine
    both allow. The window now closes only when an action and a reveal have
    both happened. Pinned by two tests (Noble on L27, Farseers on Bards).
    Owner: keep, since it follows the rulebook.
  - **Galactic Bards (BC25) and Lattice Spies (BC16) keep their printed
    timing.** Both say "before any (other) actions", like Upstart and L27.
    Lattice Spies had to stay strict anyway: `preludeAvailable` refuses it
    once acted, so offering it would have thrown. Owner: keep.
  - **Any other player's decision closes the window**, including a rival's
    resource overflow or arrangement, matching the undo-history boundary.
    Owner: keep the stricter reading, for competitive integrity.
  - **Railgun Arrays counts as a reveal although it reveals nothing new.**
    It only changes anything in a 0-dice battle (any dice roll reveals
    anyway). Kept because the plan lists it; the owner has no preference.
  - **Old saved turns keep the strict timing.** A turn saved before M6 has
    no `revealed`, and the gate checks `=== false`, so a game that is
    mid-turn at deploy cannot reopen declaring after a roll.
- **C10 fixed fully:** a Union (BC04, BC05, BC10, BC11) sets `acted` when it
  is placed (`resolveTask` `union`), not when it is opened, so Skip leaves
  the turn untouched. The lenient gate alone would have fixed the
  declare/seize symptom, but not Upstart, L27 or Lattice Spies after a
  skipped Union.
- **Lore Preludes closed with Done (same pattern as C10), fixed on owner
  request:** L19, L21, L23, L24, L25 and L28 no longer set `acted` when
  opened (`usePrelude`); `resolvePrelude` sets it on `clearOutrage`,
  `spendTrophy`, `spendCaptive` or `tycoonTrade`. Spending a Trophy or
  Captive counts even if the free influence or secure is then skipped, and
  Tycoon's Charm's trade counts although its form does not `pay`.
  `tycoonDeclare` (L27) still does not count (M2), and Mass Uprising's
  Gatekeepers placement, which also runs through `resolvePrelude`, is
  untouched. Before the fix, opening one of these just to read it and
  pressing Done closed Upstart, L27, Lattice Spies and Bards for the turn.
- **Timeout policy:** scores `declare` at -10 whenever `turn.revealed` is
  set, so the bot never declares after a reveal, even inside the printed
  window. It never seizes (unchanged).
- **UI (`CommandPanel.jsx`):** the buttons need no change; they render
  whatever the engine offers, in the Prelude tabs ("Ambition & initiative")
  and in the actions stage. When the turn has acted and revealed, and
  declaring (lead card, not yet declared, a marker free) or seizing would
  otherwise apply, one line says why, in the history-boundary wording:
  "Dice were rolled or a deck was shuffled; declaring is closed for this
  turn." (also "A deck changed or a card was revealed", "New hand
  information was revealed", "Another player responded"). It also shows in
  the Review step, which a closed seize can now trigger automatically.
- **Audit (test-only):** `assertRevealTracked(before, after)` in
  `tests/invariants.js` runs after every move of the 90 simulated games. It
  fails if the RNG moved, a card left the Court deck or the action discard,
  a card entered a hand, a Farseers look is pending, or another player has a
  decision without the turn marked, and if the turn is marked with none of
  those (Railgun excepted). Mutation check: removing each site in turn, the
  simulations catch `random`, `refill`, the handoff check, Noble, the
  Farseers look and the Farseers draw. They cannot catch Call to Action (the
  refill straight after it masks it) or Railgun (no state trace), so both
  have dedicated tests. A spurious reveal on every build fails all 90.
- **Paths checked and left unmarked:** BC22 Sworn Guardians buried by a
  steal (`steal` pushes onto the Court deck: a card entering a deck, public,
  bottom); the server history treats it as a boundary, so Undo is lost but
  declaring stays open. Generous's Guild gift and Elder Broker's trade (no
  decision by the rival). Union retrieval, mulligan and the deal (not in a
  turn). Hits are always assigned by the attacker here (`p` is the attacker),
  so "casualties" are covered by the roll that causes them. `pump`'s
  `autoSecure` and `battlePrepare` cases are dead (never pushed).
- **Found, not fixed:**
  - M2 expected Phase B to make "secure Populist Demands, then the lead
    declaration" reachable in real play. It is reachable only when the
    Court deck is empty: otherwise the refill reveals a card and closes the
    lead declaration, as the rule intends. Covered by a real-play test with
    an empty deck; the injected-task A3 tests stay.
  - The card-phase hint in `CommandPanel.jsx` still says you may declare
    "before taking any actions" (true but now incomplete); left for M9.
- **Tests (20 new, `tests/engine.test.js`):** declare after a build (late
  declaration still zeroes the lead), after a capturing tax, after a
  Prelude Fuel move; declare refused after a battle roll (and every seat's
  view carries the reason) and after a secure that refilled the Court;
  real-play Populist then lead declaration with an empty Court deck; Call to
  Action's draw closes declaring with nothing to refill; Union skip keeps
  declaring open and is not an action, plain and Upstart (C10); Upstart
  refused after any action; L27 refused after any other action while the
  lead declaration stays open; Bards refused after an action while seize
  stays open; seize after a move (extra card face down, hidden in the
  view); seize refused after a roll; Railgun and Predictive Sensors close
  declaring with no dice rolled; Noble's draw on L27 and Farseers' look on
  Bards keep the window open until an action; old turns keep strict
  timing; the timeout policy never declares after a reveal. `fixture()`
  now sets `revealed: false` (no existing test changed outcome).
  `tests/timeout.test.js`'s automatic full games also assert that the bot
  never declares after a reveal; the simulations run the audit above.
- **Tests (10 more, Lore Preludes):** for each of L19, L21, L23, L24, L25
  and L28, opening the Prelude and pressing Done leaves `acted` false, keeps
  the card and leaves Upstart's declaration open; using L19 (clear Outrage),
  L24 (spend a Trophy, skip the influence), L25 (spend a Captive, skip the
  secure) and L28 (trade) sets `acted` and closes Upstart's declaration.
  Without the `usePrelude` half all six Done tests fail; without the
  `resolvePrelude` half all four "used" tests fail.
- **Manual check (`localhost:5173`):** Playwright with system Chrome
  against the dev server, with the API routed to an in-process engine as in
  `scripts/controls-check.mjs` (script not added to the repo). Declare
  stays after a build and works from the button (marker placed, lead rank
  0); stays in the Prelude after a Fuel move; gone with the dice line after
  a battle roll; gone with the deck line after a Court refill; gone with
  the "Another player responded" line after Predictive Sensors; Seize stays
  after a move and is gone with the dice line after a roll (shown above the
  Review step). No page errors. Re-run after the Lore Prelude fix: same
  result.
- **Files:** `game/engine.js`, `game/timeout-policy.js`,
  `src/CommandPanel.jsx`, `tests/engine.test.js`, `tests/invariants.js`,
  `tests/simulations.test.js`, `tests/timeout.test.js`.
- **Result:** 378 tests, all pass, 0 `todo`; `npm run check` builds. Against the old engine,
  18 of the 20 timing tests fail: 9 on behavior (build, tax, Fuel move, empty-deck
  Populist, both Union skips, L27, Bards with seize, seize after a move) and
  9 only on the new flag (the closing cases, Upstart, Noble, Farseers). The
  other 2 pass: old-turn strict timing (a migration guard) and the timeout
  policy test, which fails against the old policy instead. With the
  audit on, 89 of the 90 simulations fail on the old engine.

### M7: split action discard piles, engine half (Phase E, item 3)
- **State:** `s.discard` is replaced by `s.discardDown` (card ids, index 0
  is the bottom) and `s.discardUp` (`{ card, player, mode, round }`, in
  discard order). `deal` rebuilds both every chapter: the leftovers go face
  down (shuffled, as before) and the face-up pile starts empty.
- **Routing (`endRound`):** each played card goes by its `faceup` flag, so
  lead, surpass and pivot go up with the round number; copy and seize go
  face down, in play order. Unions still take their target out of
  `s.played` first. Farseers' own discards go face down (shuffled, per the
  FAQ) on top of the face-down pile.
- **Draws:** one helper, `drawDiscard(s, n)`, used by the 2p mulligan
  (`resolveTask` `mulligan`), the Farseers Prelude (`resolveForm`
  `farseersDiscard`) and Call to Action (`resolveVox` `call`). It takes the
  bottom `n` of `discardDown`. If that pile has fewer than `n` and the
  face-up pile is not empty, it first shuffles both into one face-down pile,
  empties the face-up pile and logs counts only ("The face-down action
  discard is short: 3 face-up cards are shuffled into it."). If both piles
  together are still short, it draws what there is (as before). Call to
  Action now draws only when either pile has a card, and marks the reveal
  before the draw, so a merge's shuffle reports "deck", not "dice". The
  Farseers reveal stays where M6 put it (before its shuffle).
- **View:** `discardUp` is the face-up pile grouped by round,
  `[{ round, cards: [{ card, player, mode }] }]`, oldest first;
  `discardDownCount` is the only face-down information. Nothing else in the
  view or log names a face-down card or its position. Draw logs are
  unchanged ("B draws 3 cards with Farseers.", "takes a mulligan.").
- **Invariants:** `assertInvariants` checks uniqueness across hands,
  played cards and both piles. Test-only: `assertDeepInvariants` checks
  conservation across both piles, and that every face-up entry was played
  lead/surpass/pivot by a real seat with non-decreasing rounds;
  `assertRevealTracked` now flags a card leaving `discardDown`.
- **Undo history (`server/history.js`):** `historyBoundary` compares both
  piles, so a face-down draw (or anything reaching the face-up pile) still
  commits earlier steps. A saved game's old `discard` is compared as the
  face-down pile (helper `discardPiles`), so the upgrade itself is not a
  boundary. No other server change.
- **Saved games:** `transition` calls `upgradeDiscard` on its clone: a
  state with no `discardDown` gets its old `discard` as the face-down pile
  (order kept) and an empty face-up pile, and `discard` is deleted.
  `viewFor` reads `discardUp ?? []` and `discardDown ?? discard` and never
  mutates. Same lazy pattern as M3 (`cardSlot`) and M6 (`revealed`).
- **Decisions (made in M7; Farseers confirmed by the owner, the mulligan
  kept per the owner's brief; see section 1):**
  - **Farseers checks "short" after its own discards land.** The Farseers
    FAQ ("Shuffle all of the cards you are discarding before placing them
    on the discard pile... one of the few situations where discard order
    matters") only makes sense if you discard first and can draw your own
    cards back; the split-piles rule says to shuffle the piles together only
    if the face-down pile "doesn't have enough cards". Consequence: since a
    dig adds `k` and draws `k + 1`, Farseers merges only when the face-down
    pile was empty beforehand. A deeper dig returns your own discards at
    random, never a face-up card.
  - **Mulligan order unchanged:** draw 6 from the bottom, then shuffle the
    old hand into what is left. That is exactly setup steps P and Q
    (mulligan, then discard the rest face down and shuffle). The face-up
    pile is always empty at that point, so the mulligan never merges.
  - **The view groups by round** (rather than a flat list with a `round`
    field), as the plan worded it; state keeps the flat list.
  - **Legacy piles stay in order.** Shuffling them on upgrade would need
    `random`, which marks the turn revealed (M6) and moves the RNG.
- **Found:**
  - The planned merge test case ("3p, 2 leftovers, no copies, Farseers
    digs 3") does not merge under the "after" reading: the face-down pile
    has 2 + 2 = 4 cards for a 3-card draw. It now pins the anti-search
    result instead (both leftovers plus one of the player's own discards,
    never round 1's lead; the old engine returns round 1's lead there,
    checked on a copy of the M6 engine). Merges have their own tests with
    an emptied face-down pile.
  - None of the 90 simulated games reaches a merge (they reach Farseers 7
    times, Call to Action 16, the mulligan 69), so merges are covered by
    unit tests only.
  - Mutation check of the audit: removing the Farseers draw's reveal fails
    2 simulations ("an action discard draw, a card entering a hand").
    Removing Call to Action's reveal fails no simulation, as M6 found (the
    Court refill in the same transition masks it), but fails M6's
    dedicated test and the new Call to Action test.
  - In a game saved before M7, the first move after deploy was an undo
    boundary ("A deck changed"), because the old state has no
    `discardUp`/`discardDown`. Fixed after review at the owner's request:
    `historyBoundary` reads the old pile as the face-down pile.
  - A stress run (the 90 simulations with each chapter's leftovers dealt
    into hands) still reached no merge, and found that Farseers with both
    piles empty draws back the player's own discard and still marks the
    turn revealed. Same on the M6 engine, unreachable without emptying both
    piles, and in the strict direction; left alone, and the owner chose not
    to add a dedicated merge stress test.
  - In a game saved mid-chapter, the old single pile (deterministic order,
    face-up cards included) stays the face-down pile until that chapter
    ends, so the old Farseers search still works there for the rest of the
    chapter. Fixed by itself at the next deal. Owner: not a concern, since
    games run one at a time and start after a deploy.
- **Tests (11 new):** in `tests/engine.test.js`: routing per mode through
  real plays (lead, surpass, pivot up with round 1; copy and seize face
  down after the 4 leftovers); leftovers face down for 2/3/4 players and
  rebuilt at chapter end; Farseers draws the face-down bottom and never a
  face-up card; the 3p no-copies dig above; a Farseers merge (3p, leftovers
  already drawn, exact log lines, view shows the new count); Call to Action
  from the bottom and with a merge (revealed as "deck"); the 2p mulligan;
  every seat's view (face-up list by round, count only, no face-down id
  anywhere in the view, no face-down label in the log); a legacy saved
  state (fixture `mulligan`: view, mulligan draws the old pile's bottom, no
  mutation; fixture `card`: plays through round end, old pile kept at the
  bottom, face-up pile started). In `tests/turn-controls.test.js`: a
  face-down draw and a face-up pile change are each a history boundary.
  Every new draw test also checks that its new log lines name no action
  card. `table()` takes an optional player count (3p tests use
  `3SETUP01`). Also in `tests/turn-controls.test.js`: a legacy saved game
  can undo its first move after the update, and a draw from its upgraded
  pile is still a boundary.
- **Existing tests updated (same assertions):** `table()` swaps with
  `discardDown`; the pips test, the Union target tests, the short-discard
  Farseers test and the out-of-cards pass test set `discardDown`.
  `scripts/player-table-check.mjs` (not in CI) reads `discardDown ??
  discard`, since its fixture is a legacy state.
- **Files:** `game/engine.js`, `server/history.js`, `tests/engine.test.js`,
  `tests/invariants.js`, `tests/turn-controls.test.js`,
  `scripts/player-table-check.mjs`.
- **Result:** 389 tests, all pass, 0 `todo`; `npm run check` builds. With the engine diff
  reverse-applied, all 9 new engine tests fail (most first on the missing
  `discardDown`); with the history diff reverse-applied, the boundary test
  fails; without the legacy fallback, the saved-game undo test fails.

### M8: Action discard panel, client half (Phase E, item 3)

- **What:** new "Action discard" button beside the Court discard link in the
  Court heading (same `setModal` pattern), opening an "action-discard" modal
  in `src/App.jsx`. It shows the face-down count (number only) and the
  face-up cards grouped by round, each with the player's name and mode
  (Led / Surpassed / Pivoted); cards can be inspected. Grouping and labels
  live in the pure helper `src/discardPanel.js`
  (`discardPanelModel`, `modeLabel`), tested in `tests/discard-panel.test.js`.
  Missing or old-shape fields give an empty list and a zero count. Small
  styles added to `src/shared-board.css`.
- **Merge detail (owner chose option a):** `drawDiscard` in
  `game/engine.js` now attaches `merge: { chapter, round, cards }` to the
  merge log entry; `cards` is the face-up pile as it was (`{ card, player,
  mode, round }`), nothing else: no face-down card, no pile order. The
  panel's "Last merge" section reads the newest entry of the current
  chapter (`lastMerge` in `src/discardPanel.js`), grouped by round of play,
  with player and mode. Limits, stated: the view only carries the last 150
  log entries, so a very old merge can scroll out and the section then
  disappears; and the cards can't be followed after the shuffle (the panel
  says so). Earlier chapters' merges are ignored (the pile is rebuilt).
  `assertLogNamesNoCard` now also checks a merge entry has exactly
  `id/text/merge` and its cards equal the pre-merge face-up pile; the
  Farseers merge test checks the entry's chapter, round, cards and that
  every seat's view carries it. Fails without the engine change.
- **Verified in browser** (Playwright, system Chrome, `:5173`, injected
  state from the `preludeRoot` fixture with the API routed to a mock): the
  panel lists 3 face-up cards in rounds 1 and 2 with player and mode, count
  11; after two face-down cards were removed the count dropped to 9 and the
  face-up images were identical; after a simulated merge the face-up list
  was empty ("No face-up cards in the pile.") and the count grew by 3; no
  face-down card id appeared among the panel's images; the panel opens and
  closes like the Court discard viewer (close button, Escape); no page
  errors. The check script was a scratch file, not added to the repo.
- **Issues found:** none in M7's data. React logs an existing duplicate-key
  warning from `SharedBoard` on the fixture state (not from this change,
  not investigated). Clicking a card inside the panel opens the card detail
  over it, as the Court discard viewer does.
- **Owner follow-ups, same milestone (owner asked for these):**
  - *Uncapped log.* The only cap was `viewFor`'s `s.log.slice(-150)` (the
    engine state, saves and the undo steps were already uncapped; the other
    `slice(-N)` calls in `server/` are notices and takeovers, not the game
    log). Removed: the view sends the whole log. Cost: every view grows with
    the game (a finished 3p game is a few hundred entries); accepted for a
    friends instance. This also removes the "old merge scrolls out of the
    log" limit noted above.
  - *Turn history.* `log()` now stamps every entry with `at: { chapter,
    round, player }` (player = `s.current`, the turn owner; the entry text
    still names whoever actually acted, e.g. a defender). The existing
    "Table history" modal groups the log by consecutive (chapter, round,
    turn owner) via `groupTurns` in `src/turnHistory.js`; entries from
    games saved before the stamp gather under "Earlier events". It is the
    public log only, so it shows nothing hidden. The modal opens
    scrolled to the newest turn (one effect on open; later updates leave
    the scroll alone). Checked in Chrome: scrollTop equals the maximum.
  - *Total drawable.* The panel shows "In the discard: N cards, face-up X,
    face-down Y".
  - *Draw log.* Each draw from the discard (mulligan, Farseers, Call to
    Action) logs `draw: { player, count, via, merged }`: counts only, never
    which cards. Call to Action had no log line for its draw; it now has
    one ("X draws 1 card with Call to Action."). The panel lists them
    oldest first with chapter, round, player and whether the face-up pile
    was shuffled in first.
  - Tests: engine (draw records for Farseers and Call to Action, with and
    without a merge; the view log is uncapped and every entry has `at`),
    `tests/turn-history.test.js` (grouping, draw log, and a full simulated
    game: nothing dropped, every entry grouped).
- **Result:** 397 tests, all pass, 0 `todo`; `npm run check` builds.

### M9: Text and small isolated fixes (C-1, C-7)

- **What:**
  - *C-1 text.* Tyrant and Warlord ambition text, the Captives/Trophies mat
    `title` tooltips and the player-board help sentence use the exact
    wording in C-1 (`src/App.jsx`, `src/PlayerTable.jsx`). `sharedBoard.js`
    labels untouched.
  - *`selected` kept across revisions.* Removed the `setSelected(null)` in
    the per-revision effect (`App.jsx`). `selected` is a system id and
    systems never disappear, so no "while it exists" guard is needed; the
    target filter in `CommandPanel` is derived from the current choices, so
    a stale selection cannot hide anything.
  - *Move instruction.* `catapultSelect` / `sprintSelect` now show "Click
    ships to select them, then confirm your selection." (`CommandPanel.jsx`).
  - *Duplicate names.* `join` returns 409 for a name already seated
    (case-insensitive, after trim). Test in `tests/server.test.js`.
  - *Back.* New engine input `{ cancel: true }` for forms; a task opened
    from an earlier choice carries `back` (the parent task), and
    `cancelTask` re-pushes it. The decision view has `canCancel`;
    `SelectionObjects` shows "← Back"; history labels it "Back". Wired for:
    `moveSelect` (paid moves only), `catapultSelect`, `sprintSelect`,
    `rerollSelect`, the L16 ship form, the BC12 form and the L28 trade (L02's
    target and dice steps already had a Back choice). Follow-up, after
    review: free-cost moves (the free action and `freeChoice` parents are
    now remembered) and the first-hop destination step (`moveTo` gets a
    "Back" choice back to fleet selection; later hops, which have already
    moved ships, get none)
    (restores `turn.acted`). `relicFence` gets a "Back" choice.
  - *FAQ/errata.* New pure helper `src/clarifications.js` (tests in
    `tests/clarifications.test.js`): library search now matches FAQ and
    errata text, cards that have either show an "FAQ" badge, and `$link:X$`
    references open that card when the name is a library card (else plain
    text).
- **Not given a Back, on purpose:** `dice` (battle already declared and
  paid; 0 dice is allowed and Undo works before the roll), `predictive` (the
  defender's step; 0 ships is allowed), `farseersDiscard` (the card is
  already discarded and Farseers always draws one), and the L02 reroll form
  (dice already rolled; a Back would allow roll, look, retry).
- **Issues found:**
  - A Back that re-offers the parent must carry the parent's `required` flag
    and rollback, or Back would escape a Warrior/Feastbringer bonus; that is
    why `back` stores the whole parent task.
  - `{...t}` spreads copy `back` into later tasks, which would have shown
    Back on the L02 reroll form; cleared where the stage changes.
  - L28's trade sets `turn.acted` before its form opens; Back restores it.
  - Most `$link:` names in the FAQ (Lesser Regent, Sworn Guardians, ...) are
    not library cards, so they render as plain text, not links.
- **Result:** 407 tests, all pass, 0 `todo`; `npm run check` builds.
  Also moved the library's "FAQ" badge to the card's top centre (it
  overlapped the corner icon, and the card clips anything lower).
  Browser (Chrome, injected state on :5173): Back from destination and fleet selection
  returns to origins with the engine state unchanged; searching "stolen
  once" finds the four Union cards with FAQ badges; a card link opens the
  linked card; no page errors. Also ran Prettier on `src/resource-tray.css` (two one-line rules that
  predated M9 failed `prettier --check`; whitespace only).


### M10: Informational UI widgets (C-2, C-3, C-4)

- **What:**
  - *C-2, close paths (`src/App.jsx`).* Card detail is now a stack
    (`detailStack`; `detail` is its top, `setDetail(id)` still replaces the
    stack, `pushDetail` is used only by `$link:X$` buttons). One `closeTop()`
    serves the X button, the backdrop and Escape: it closes the topmost layer
    only (card, then commander details, then the modal, then the expanded
    map). So a card opened from the library, Court discard, Action discard,
    Players or the create form closes back to that modal, and a card opened
    from the board still closes to the board. Closing a linked card goes back
    to the card that linked it. A link to the card already showing is
    ignored. The library's tab and search live in `App` state and were already
    kept; scroll is saved on click (`onClickCapture` on the dialog) and
    restored in a layout effect when the modal layer is back. The focus trap
    now focuses with `preventScroll` (it was scrolling the library to the top
    on every close).
  - *C-3, setup preview (`src/setupPreview.js`, create form).* `setupImage`
    maps `3SETUP04` to `/assets/setup-3p-04.webp`; `setupsFor(count)` lists
    the official setups for a count. With "Random official setup" the form
    shows the four candidates as a 2x2 grid (tap one to choose it); with a
    chosen card it shows that image with its name. The preview sits inside
    the existing collapsed "Setup options" `<details>`. Changing the player
    count still resets to random. The optional full-size tap was skipped.
  - *C-4, draft strip (`src/draftOrder.js`, `tests/draft-order.test.js`).*
    Pure `draftOrder(game)`: seats start at `(initiative - 1)` and go
    backwards, repeated `1 + loreCount` times; current pick = picks made
    (leaders set + lore held). Each done chip names the card taken, read from
    the public log (`card` + `at.player`, so lore-before-leader shows
    correctly), falling back to leader-then-lore. Chips show done (dimmed,
    card name), current (gold), next; the initiative holder is marked; the
    chip where LEAD09 was taken carries "Archivist: chooses Lore privately
    after the draft" (no card names).
- **Rules check (p.21, `work/arcs-rulebook-base.txt`):** "start with the
  player to the right of the player with initiative, and go
  counterclockwise" matches `(initiative + n - 1) % n` then stepping back.
  The rulebook does not say the order snakes, and the engine does not
  snake; the strip repeats the same cycle every pass.
- **Decisions made:**
  - *Detail stack: yes.* The X/Escape/backdrop on a linked card go back one
    card, not out. Cost: a long chain of links needs several closes.
  - The "close one layer" rule is general, not limited to library and
    court-discard: Action discard (as the handoff required), Players,
    commander details and the create form behave the same.
  - Escape on the expanded board now only collapses the map when no dialog is
    open (before, it closed everything at once).
- **Issues found:**
  - The Archivist's private Lore pick happens after the draft ends (phase
    `card`, pending `archivist`), when the strip is gone, so the strip can
    only carry a note on the Archivist's chip; there is no private pick
    inside the draft to hide.
  - Restoring scroll first failed: the dialog's focus trap re-focused the
    first control on every layer change and scrolled to the top. Fixed with
    `preventScroll`.
  - Two pre-existing problems, fixed at the owner's request: React logged a
    "unique key" warning from `SharedBoard` on every page load because the
    explore-mode preview game's markers (`App.jsx`) had no `id` (they now
    have ids 2, 1, 0, matching the engine's); and `prettier --check
    scripts/` flagged `scripts/verify-assets.mjs` (whitespace only,
    reformatted). The browser pass now reports zero console errors.
- **Result:** 412 tests (5 new), all pass, 0 `todo`; `npm run check` builds;
  `prettier --check` clean on `src tests game server scripts`. Browser (Chrome,
  :5173, mock room): library search "a" + Leader tab + scrolled to 494px,
  card opened and closed by X, Escape and backdrop each returned to the same
  tab, query and scroll; second close dismissed; a linked card (Elder Broker
  to Sworn Guardians) closed back to Elder Broker then the library; Court
  discard and Action discard (injected face-up cards), Players and
  commander details closed layer by layer; the setup image followed player
  count and selection; a 3-player draft with the Archivist at seat 1 showed
  the strip matching the engine's current seat at every step.

### M11: Notifications and confirm steps (C-5, C-6)

- **What:**
  - *C-6, confirm steps.* New pure `src/confirmStep.js`
    (`tests/confirm-step.test.js`): `confirmFor(choice, game)` returns
    `{ title, body, confirm }` for the ops `pass`, `play` (every mode but
    Copy), `secureTarget`, `ransack` and `battleTarget`, and `null` for
    anything else.
    `App.jsx` has one path for every choice sent from the interface,
    `actOrConfirm(input)`: the hand and card-dialog plays, Court clicks, map
    clicks and the map tray, the "choose from a list" fallback, Pass. A
    confirmable choice sets `pendingConfirm = { revision, choice }` and sends
    nothing; anything else (other choices, forms, `{ cancel: true }`, resource
    arrangement) goes straight to `act`, so Back and the M9 re-offer of the
    parent task are untouched. `CommandPanel` shows the pending choice in the
    End turn style (`confirm-end stage-review`, "REVIEW & CONFIRM", Cancel /
    Confirm & ...) and hides the choice lists while it is open, as End turn's
    review does; the region takes focus. Confirm calls `act({ choice })` once.
    The confirm is dropped by: Cancel, Escape, any new revision (the per-
    revision effect), and any other choice going through. `closeTop()` order
    is now card > commander details > modal > pending confirm > expanded map,
    so Escape cancels only the confirm. Opening a confirm also closes dialogs
    and the expanded map (the map is `position: fixed` over the dock, so the
    confirm would be hidden behind it). The WebMCP table tools
    (`useTableTools`) keep raw `act`: a tool call is a deliberate submission at
    a stated revision.
    Wording (`confirmStep.js`): Pass names what happens (marker to the next
    player with cards, round ends, chapter ends if everyone passes, cannot be
    undone). A face-up play says everyone sees the card and that undo will not
    hide it. Secure says Vox resolves first, otherwise you take the card and
    capture rival agents, and that the Court refills (a boundary) unless the
    deck is empty. Battle says dice come next and a roll cannot be undone, and
    names the defender's Predictive Sensors (L15) / Railgun Arrays (L12) if
    held, since those respond before the dice (`beginBattle`).
  - *C-5, notices.* `server/clock.js` (`changeClock`), `server/timeout.js`
    (AI takeover) and the "automatic play could not resolve" notice in
    `server/index.js` now write `{ text, at, p }`, `p` being the seat on the
    clock (for pause, resume and settings, the current actor). Old notices
    have no `p` and simply do not flash. All three writers now go through
    one `addNotice(room, text, p, now)` in `server/clock.js`, which keeps each
    `at` strictly later than the previous one and the newest 20. `src/notices.js` (pure,
    `tests/notices.test.js`): `freshNotices(list, seen)` returns the notices
    whose `at` is later than the newest one already shown. `src/NoticeToasts.jsx`:
    `useNoticeToasts(room, onFresh)` keeps that newest `at` per table in
    `localStorage` (`arcs-notices-seen-<id>`) and in a ref, so a reconnect or a
    reload shows exactly the notices missed in between, and a first visit
    shows none of the history. Toasts: at most 3, 9 seconds, dismissible,
    `role="status"`, above dialogs (`table-ux.css`). The collapsed "Timer
    activity" list in `TurnTimers.jsx` is unchanged except that its keys are
    `at`-based.
  - *C-5, title flash and chime (`src/attention.js`).* `flashTitle(label)`
    alternates `document.title` with `"<label> · <title>"` once a second only
    while the tab is unfocused (hidden or without focus) and stops on focus.
    It fires for a notice whose `p` is your seat, and when the actor changes
    to you. The chime (same 660 Hz tone, moved out of `App.jsx`) is on by
    default; `localStorage` "arcs-sound" "no" mutes it, "yes" or unset is on.
    The Settings button reads "Your-turn chime: on / muted" with
    `aria-pressed`.
  - *Notice wording.* `changeClock` said "Host added 1 minutes" and "1440
    minutes per turn" for an async timer; it now says "1 minute", "24 hours".
    Toasts put these lines in front of everyone, so it was worth fixing here.
- **Rules check:** Pass text follows "Passing Initiative" in
  `work/arcs-rulebook-base.txt` (marker to the next clockwise player with
  cards, round ends, all-pass ends the chapter) and `case "pass"` in the
  engine. Secure and Battle text follows `secure()` / `refill()` and
  `beginBattle()`. No engine change.
- **Decisions made:**
  - *Copy plays are not confirmed.* They go down face down, so undoing one
    reveals nothing; the plan said "face-up card plays". Lead, Pivot and
    Surpass are confirmed.
  - *Secure and Ransack are confirmed among Court clicks* (owner's call after
    review). Ransack calls `secure(..., true)`, so it takes the card and
    refills the Court, the same irreversible boundary. Influence and Bold only
    place an agent, which Undo covers, so they go straight through. Copy plays
    stay unconfirmed and End turn's review stays without Escape (owner's call).
  - *In-panel confirm, not a modal*, to match End turn's review; hence the
    explicit Escape handling and closing of covering layers above.
  - *No chime or flash on load or reconnect.* Both fire only for an actor
    change seen while the page was already open. Before, with sound on, the
    chime also rang on a page load that landed on your turn. A game starting
    from the lobby does not chime for the first actor either.
  - *Toast limits:* newest 3, 9 s. A returning player who missed more than 3
    sees the newest 3; the rest are in "Timer activity".
- **Issues found:**
  - The expanded map (`position: fixed; inset: 15px; z-index: 18`) covers the
    command panel, so a Battle click made on it would have opened an invisible
    confirm. Fixed by collapsing it when a confirm opens.
  - End turn's own review does not respond to Escape (the state is local to
    `CommandPanel`). Left as it was; it would need `confirmEnd` lifted into
    `App`.
  - A page that has never been clicked cannot start an `AudioContext`
    (browser autoplay policy), so the chime is silent in a tab the player has
    not interacted with since opening it. The title flash does not depend on
    it.
  - Two notices with the same `at` (same millisecond) would have shown once.
    It could not happen with today's writers, but `addNotice()` now makes it
    impossible (tested).
  - Two Playwright scripts clicked a face-up play and a battle target and now
    need the confirm: `scripts/controls-check.mjs` (Lead) and
    `scripts/learning-check.mjs` (Battle); both updated and passing.
  - Pre-existing failures in three browser scripts, found by checking against
    a clean checkout of `365dbf4` in a throwaway worktree (same machine,
    system Chrome), then fixed in the scripts: `ux-check.mjs` clicked "Clear
    selection" with the card dialog still covering it (a hand-card click has
    opened that dialog for some time; it now closes it first);
    `ux-state-check.mjs` failed the `draft` fixture at 390 px because
    lazy-loaded draft cards below the fold never start loading (the check is
    about the artwork, so it now sets incomplete images to eager; 3 of 3 runs
    pass, it failed 2 of 3 before); `player-table-check.mjs` read the selected
    stage tab once, right after `aria-pressed` flipped, a render before the
    filter followed (now an auto-retrying `toContainText`; 10 of 10 pass, about
    6 of 8 before).
  - *Laptop layout (owner asked for it after review).* `ux-check.mjs` asserted
    that at 1280x720 the map is 240 px tall and every Court card is visible;
    the map was 184 px (same on `365dbf4`) and, at 1280x700, the dock's 300 px
    cap sat on 400 px of content, so the hand was below the fold in a
    scrolling left column. The dock also never gave back height: it sized to
    its content up to the viewport minus 400, so the map stayed about 184 px
    at 700, 800 and 880 px tall. Fix, all in one new `src/laptop-fit.css`
    (imported last in `main.jsx`; delete both to revert), only for windows
    wider than 1000 px and at most 1000 px tall: the hand sits beside the
    player mat (3x2 grid) instead of under it, so the dock needs about 260 px
    instead of 400; the round-story strip is 80 px (was 104-118) with the
    "THIS ROUND" eyebrow hidden; the default player board is 60% wide from
    1200 px up. The player board is a size container, so the side-by-side
    arrangement applies only when it is 690 px or wider (a narrowed board or a
    1001-1199 px window keeps the stacked hand). `PlayerBoardResize.jsx` gets
    `defaultPlayerWidth()`, which reads the same media query as the CSS, so the
    handle's arrow keys step from the real width (a CSS-only default made
    ArrowRight shrink the board; caught by `player-table-check`). Map height:
    1280x700 184 -> 212 px, 1440x790 -> 289, 1512x880 207 -> 373, 1512x982
    309 -> 475; the Court is whole at 790 and up and still scrolls inside its
    box at 700. Phones and windows over 1000 px tall (checked 1920x1080) are
    unchanged. `ux-check.mjs` now asserts map >= 200 px and the first Court
    row visible at 1280x720; `ux-flow-check.mjs` asserts all six hand cards are
    on screen and the map is >= 200 px at 1280x700 (it fails with the stylesheet
    removed). Limits: at 1280x700 the dock is still 300 px (the command panel
    and a two-row hand both want about 290), so the gain there is 28 px and a
    visible hand; Chrome only, Safari not seen.
  - No Playwright browser is installed here, so every browser script failed to
    launch. All of them now pass `channel: process.env.PW_CHANNEL` to
    `chromium.launch()` (unset keeps the old behaviour); run them with
    `PW_CHANNEL=chrome` for system Chrome.
- **Result:** 422 tests (10 new, ransack folded into the confirm-step tests), all pass, 0 `todo`; `npm run check` builds;
  `prettier --check` clean on `src tests game server scripts`.
  `scripts/ux-flow-check.mjs` now covers: Pass, a face-up play (from the card
  dialog and from the panel), Copy (no confirm), Secure, Battle (from the
  expanded map), Escape layering, Back bypassing the confirm, each with
  cancel by Escape and by the button sending nothing and confirm sending
  exactly one write; the chime default and mute; toasts diffed on `at`
  (including a full list of 20), reload showing only missed notices, title
  flash for the affected seat only and only when unfocused. Run against
  `npm start` (scratch `DATA_DIR`) with system Chrome: passes with no page or
  console errors. I also mutation-tested it (battle not confirmed, Escape not
  cancelling, `>=` in the notice diff, chime off by default): each fails.
  Browser, real server, two contexts (Alice and Bob, live timer): the host's
  "Add 1 minute" put a toast on both screens and flashed only the affected
  player's background tab; a Lead play was cancelled (revision and history
  untouched) then confirmed (revision +1, one history entry, label
  "Lead ..."); ending the turn flashed "Your turn" on the other tab with one
  chime; a tab closed during two clock changes showed exactly those two
  toasts on reopening and none after the next reload; Pass was cancelled and
  confirmed the same way (revision +1, other tab flashed; the history reset
  on a confirmed Pass is asserted in `ux-flow-check.mjs`). The Ransack
  confirm has its own flow in `ux-flow-check.mjs`. All ten browser scripts
  pass against `npm start` with `PW_CHANNEL=chrome`.

### M12: Battle visibility logging (C-8)

- **What:**
  - *Roll.* The existing "rolls N dice" log line now ends with the faces, in
    the same entry (no extra line): `A rolls 3 dice against B: assault
    intercept+hit; raid building+key, self+key.` Helpers `diceText`,
    `faceText` and `copyDice` sit beside `log()` in `game/engine.js`. Dice
    faces are public, so nothing hidden is named.
  - *Reroll.* `rerollSelect` logs one line naming the ability and each die's
    old and new face (`A rerolls 2 dice (Skirmishers): blank -> hit, ...`).
    Choosing no dice logs nothing (and does not use the ability up, as before).
  - *Galactic Rifles.* `rifleDice` logs `A fires N skirmish dice at B:
    <faces>` and the Empath's Vision reroll (`resolveSpecialForm`, L02) logs
    like any reroll. The old "A uses Galactic Rifles." line still follows.
  - *Raid ends empty.* The `raid` task counts what it stole (`stolen`, set in
    the `raid` choice). When `pump` auto-ends it with `stolen` unset, it logs
    one line: `A's raid on B steals nothing: <reason>`, where the reason is
    "no attacking ship survived", "no keys left", "nothing B holds costs N
    key(s) or fewer" (something is stealable, but dearer than the keys rolled)
    or "B has nothing that can be stolen" (empty, or all protected, for
    example by Sworn Guardians). A raid that stole something logs nothing
    extra; the steal lines already say so.
  - *Per-chapter record.* New `s.battles` (public, in the view as `battles`,
    `[]` in new games, a missing list reads as empty): one record per roll
    `{ attacker, defender, system, dice, rerolls: [ability...], rifles?, at:
    { chapter, round, player } }`, `dice` being a copy that follows rerolls.
    `lastBattle` is unchanged (the live dice displays still use it);
    `recordBattle` sets both and `recordReroll` refreshes the record.
  - *History panel.* "Review latest battle dice" (button text unchanged) now
    opens `src/BattleRecord.jsx` in the same `modal === "battle"` dialog, so
    Escape, X and the backdrop close it through `closeTop()` as before. It
    lists every battle newest first, grouped by chapter: the current chapter is
    open, earlier ones fold in a `<details>`; each entry shows attacker against
    defender, round, sector, Galactic Rifles if it was one, the abilities that
    rerolled, and the final dice.
- **Rules check:** no rule changed. Rolls, rerolls, theft and the raid-ends
  logic are as before; only text and a counter were added.
- **Decisions made:**
  - Faces go into the existing roll line rather than a second line, to keep
    the uncapped log from growing by two lines per battle.
  - Raids that stole nothing are explained whether the game ended them or the
    player pressed "Finish raid" (owner's call): the latter logs "A ends the
    raid on B without stealing."
  - `battles` keeps the whole game (small: one record per battle), grouped by
    chapter in the view, instead of being cleared each chapter.
  - Games saved before this milestone have `lastBattle` but no `battles`. The
    engine treats the missing list as empty (the view sends `[]`); the browser
    falls back to showing that one `lastBattle` so the button still works on
    old saves and on the older fixtures (`battleList` in `BattleRecord.jsx`).
- **Issues found:**
  - The "keys exhausted" branch cannot be reached with nothing stolen in real
    play: a raid starts with at least one key and keys only fall when
    something is stolen. It is still handled (and tested by building the task
    directly) in case another effect ever starts a raid with no keys.
  - Owner decided "Finish raid" with nothing stolen should be logged; it now is.
  - The line numbers in the plan were stale (the roll is at about 2281, the
    raid pump at about 3820); found by grep.
  - Nothing else: no console errors in any browser script; the battle-start
    confirm text ("you pick dice next, a roll cannot be undone") is still true
    because the roll commits exactly what it did before.
- **Result:** 431 tests (9 new in `tests/engine.test.js`), all pass, 0
  `todo`; `npm run check` builds; `prettier --check` clean on `src tests game
  server scripts`. New tests: faces present in the log and the record after a
  roll; reroll line with old and new faces, ability named, record updated,
  "choose none" logs nothing; Galactic Rifles roll and Empath's Vision reroll;
  each raid auto-end branch (no attacker, no keys, nothing affordable in its
  two variants) logs its reason; finishing a raid by hand with nothing stolen
  logs too; a raid that steals logs no failure; a game
  without `battles` reads as empty and still rolls. `scripts/ux-check.mjs`
  gained `battleChapters`: two chapters of battles listed newest first,
  current chapter open and the other folded, rerolled ability shown, dialog
  fits at 1280x700 and 1440x790, and Escape, X and the backdrop each close
  it. All ten browser scripts pass against `npm start` (scratch `DATA_DIR`,
  port 3101) with `PW_CHANNEL=chrome`. I also ran a real engine roll and read
  the logged line.

### M13: Time bank (Phase D, item 6)

- **What:**
  - *Config.* `validateTimer` returns `{ mode, expiry, turn, bank, increment }`
    (seconds, 0 = off). `seconds` is still accepted as the old name for `turn`;
    with no knob given the old default stands (live 300 s, async 86400 s,
    turn only). Ranges as specified: `turn` live 60-3600, async 3600-604800;
    `bank` live 300-36000, async 3600-604800; `increment` 0-600; at least one
    of `turn`/`bank`. `mode: "off"` normalises every knob to 0.
  - *Old rooms.* A saved `clock.config` with only `seconds` is read through
    `knobs()` as `turn = seconds`, `bank = 0`, so `clockView` takes exactly the
    old path. The view always reports the normalised config, so the client
    never sees `seconds`. Missing seat arrays read as 0, as before.
  - *Clock fields.* Kept `spent`, `total`, `bonus` (the per-turn bonus; not
    renamed to `turnBonus` so old saves need no migration). Added `charged`
    (what the bank pays), `credit` (increments earned), `bankBonus`,
    `grace` (ms left of the current response stretch's free time),
    `credited` (the turn key already credited) and `empty` (per-seat
    "bank empty" announced).
  - *Model.* `limits(c, dt)` gives each enabled limit's time left;
    `remainingMs` is the smaller, and `binding` says which ("turn" or
    "bank"). Turn: `turn*1000 + bonus - spent - dt`. Bank: `bank*1000 +
    bankBonus + credit - charged + grace - dt`; grace is spent before the bank,
    so it counts as time left. Pause and AI expiry clamp `dt` at the binding
    limit's zero, as before; overtime lets both go negative. `blocked`,
    `assertClockOpen`, the 750 ms loop and `timeout.js` are unchanged and read
    `remainingMs`.
  - *Response grace.* `followClock` starts a stretch whenever the actor or
    the turn key changes, giving 10 s of grace when the actor is not the turn
    owner (the owner is `s.current` in `card`/`turn` phases, nobody
    otherwise). Grace survives the responder's own actions (`settleClock`
    stores what is left). It only reduces `charged`; the turn limit and
    `spent` are charged in full, as before.
  - *Draft.* Turn key `draft:<seat>`: nothing is charged to the bank, the
    bank limit is ignored, and the turn limit is the table's `turn` or else
    120 s live, 24 hours async (`DRAFT_TURN`; owner's decision, the spec said
    2 minutes for both). `total` still counts draft time.
  - *Increment.* `creditTurn` adds it once per card-turn key, when the phase
    is `card`/`turn` (so not at scoring or draft keys, and the setup-to-card
    move with an unchanged key still credits). The first card turn gets it
    too. A seat whose bank is at or below zero when its turn starts gets one
    notice ("bank empty", worded per increment/expiry) until its bank is
    positive again.
  - *Host.* Extend adds to `bonus` when a turn limit exists (or in the
    draft) and to `bankBonus` when a bank exists outside the draft; notice
    names which ("turn clock and time bank", "time bank", or the old
    "current clock"). Configure resets `spent`, `bonus`, `bankBonus`,
    pause and takeovers; it keeps `total`, `charged` and `credit`. Notices:
    "Timer set to 5 minutes per turn, 40 minutes time bank, +30 seconds each
    turn (live). Current allowance restarted; banks keep the time already
    used." Turn-only wording is unchanged.
  - *UI* (`src/TurnTimers.jsx`). Host form: mode, then a checkbox and value
    for the turn limit and the time bank, an increment field (enabled with
    the bank), expiry, and a live one-line summary ("2 min per turn, 10 min
    bank, +15 s"). Hero says which limit is running and any free response
    time left, and shows the table summary. Seat rows show "Bank 4:52 left"
    (or "overdrawn by"), a meter, "charged to bank · total", and a "+0:30"
    flash when an increment or host time lands (`useBankGains`). Chip reads
    "turn 3:12" / "bank 24:50" when a bank exists, unchanged otherwise.
    `useClock` counts the bank down only after grace, never in the draft.
- **Decisions made (all confirmed by the owner after review):**
  - The bank is charged from a separate `charged` field, not `total`, so the
    "total decision time" shown to players keeps its meaning (all time,
    including draft and grace). The spec's formula uses `total`; the effect on
    enforcement is the same.
  - Increments live in `credit`, which configure does not reset. Putting them
    in `bankBonus` (reset by configure) would make any mid-game settings
    change take back every increment earned, while `charged` stays.
  - An increment requires a bank (rejected otherwise). The async bank minimum
    is 1 hour (the spec gave only a maximum).
  - No notice per increment (it would toast every turn); only the "bank
    empty" notice, once per seat per episode.
  - Extending in the draft goes to the draft's turn clock only.
  - Configure keeps time already charged (spec decision 4), which includes
    time used while no bank was set: turning a bank on mid-game starts it
    part-used. The configure notice says so.
  - The draft default is 2 minutes live but 24 hours async: on an async
    table with only a bank, 2 minutes would let AI make a player's leader
    pick before they checked in. Changed at the owner's request after review.
- **Issues found:**
  - Spec gap: without care the setup phase and the first card turn share a
    turn key, so "credit on key change" would miss the first increment; and
    scoring between chapters has its own key, which would credit twice.
    Handled by crediting per key only in `card`/`turn` phases.
  - Spec gap: with an empty bank, a responder's "remaining" must include
    the grace, or a rival's forced response would expire them instantly.
    Grace counts as bank time left (tested).
  - With `auto` expiry and an empty bank, `timeout.js` (unchanged, per the
    spec) still writes its "timer expired, AI is completing" notice and log
    line on each of that seat's turns. Accepted: it records that AI played.
  - Pre-existing, fixed at the owner's request: a timer-control error
    showed twice, in the timer dialog and in the command panel, because both
    read App's shared `error`. Timer controls now use their own `timerError`
    in `App.jsx`, shown only in the dialog and cleared when it closes; undo
    and redo errors still show in the command panel.
  - Owner accepted the repeated per-turn "timer expired" notice for an
    empty-bank seat under AI expiry.
  - Found in review, fixed: times of an hour or more read "23h 59:59"; the
    clock reading now lives in `src/duration.js` (tested in
    `tests/duration.test.js`) and reads "23:59:59", "m:ss" below an hour.
  - Found in review, fixed: the host form kept the values it opened with if
    the settings changed while it was open (pre-existing). It now reloads
    from the table's settings whenever they change.
  - Response grace was first checked only in unit tests; it was then watched
    in Chrome on a real server (a saved "predictive" state with seat 0
    responding in seat 2's turn): the bank stayed at 5:00 for 10 s while
    "free response time" counted down, then drained. The chip and the
    dialog's big number first showed bank plus grace ("bank 5:10"); at the
    owner's request they now show the bank itself during grace ("bank 5:00")
    with the free time under it on the chip ("0:08 free first"), via
    `shownMs`/`inGrace` in `TurnTimers.jsx`. Rechecked in Chrome. The
    `urgent` style still keys on the true time until expiry.
  - A "table changed" (409) error from a timer button now shows in the timer
    dialog rather than the command panel, where the host pressed it; the
    view still refreshes. No change needed.
- **Result:** 441 tests (9 new in `tests/time-bank.test.js`, 1 in
  `tests/duration.test.js`; one assertion in
  `tests/server.test.js` now reads `config.turn`), all pass, 0 `todo`;
  `npm run check` builds; `prettier --check` clean on `src tests game server
  scripts`. New tests: validation ranges; a room saved with only `seconds`
  behaves as before (remaining, pause clamp, extend wording, no grace, draft
  length, no bank notices); bank expiry with AI (completes the turn, bank
  never overdrawn, AI on later turns, one notice); with pause and with
  overtime; min of both (turn binds, then bank); increment once per card turn
  (not on actions, responses or scoring; exactly the increment when empty);
  response grace (free first 10 s, kept across the responder's actions, none
  for the owner, grace-only time when empty); draft exempt and the 2-minute
  default (24 hours async), extend in the draft; extend split and configure resets, survives
  JSON reload. Also: a scratch differential run of 3,000 random clock
  histories on old-format rooms against the M12 `clock.js` (1,080,000 field
  comparisons and every notice identical); `scripts/timeout-simulations.mjs`
  (200 games) and `scripts/hosted-timeout-check.mjs` pass; all ten browser
  scripts pass against `npm start` with `PW_CHANNEL=chrome`, no console
  errors. Manual pass on a real server in Chrome: each combination (turn
  only, bank only, bank+increment, turn+bank) drains as expected; with
  turn 60 / bank 300 / +30 and AI expiry the guest's bank rose by 0:30 at
  each of their turn starts with the flash shown; host extend added a minute
  to both limits; a draft table with a bank ran the 2-minute clock and
  charged nothing, and its extend went to the turn clock only; the host form
  applied 120/600/15 and rejected both-off; chip fits at 1280x700 and
  1440x790. After the owner's review: an async draft table showed the
  24-hour draft clock, and a rejected setting showed its error once, in the
  dialog only, gone on close.

### M14: Battle and turn/scoring regression tests (F-2, item 14)

- **What:** `tests/engine.test.js`, plus one engine fix the owner asked for
  after review (Relic Fence, below). Every expected
  value was checked against the rulebook (`work/arcs-rulebook-base.txt`) and
  `data/cards.json`, not against the engine. New setups use `table()` and real
  play; pieces, resources, captives and trophies are added only in ways that
  keep everything in one place.
  - *Battle (8 tests):* hits reach buildings only after the last defending
    ship (a damaged ship still takes the next hit); building hits skip ships;
    raid offers only items its keys afford by slot cost and ends by itself
    when the rest cannot be paid; intercepts do not stack (one hit per fresh
    defending ship, however many intercepts); self-hit and intercept
    destructions are the defender's Trophies; a raid ends by itself when no
    attacker survives; raid dice need a defending building in the system or
    none of the defender's anywhere (rejected otherwise); damaged attackers
    count toward the dice limit; no fleet revival while a starport stands or
    with no ship in supply. Helpers: `battleWith`, `die`, `hitTypes`, `held`.
  - *Turn and scoring (21 tests):* 7 lead declares any ambition, 1 none;
    7 Surpass seizes and keeps its pips, and does not seize after a seize
    (seizer keeps the marker); no Surpass keeps the initiative, even past a
    higher Pivot; a player out of cards (after a seize) is skipped mid-round
    and the chapter ends without them; bonus city Power once per won
    ambition with two markers on it; early end at 27/30/33 (and not at one
    less) for 4/3/2 players; marker flips after chapters 1, 2 and 3, none
    after 4; Cartel makes rivals discard and the holder keeps, Lavish
    discards Fuel when Tycoon scored and keeps it when not, and Tycoon is
    counted before the discards; Outrage blocks each resource's Prelude
    action without its Loyal guild (all five); 2p neutral resources match
    the out-of-play planets and score as a third player (ties included); a
    Trophy city returned to its board covers a slot and forces a discard;
    Catapult checks control before entry, continues through uncontrolled
    and own gates, stops at a planet, and never starts from a Rival starport
    you control.
  - *Tightened:* leader scoring penalty (Elder, Warrior, Archivist) now has
    first (low value, no city bonus, the real second still paid), tied for
    first (nothing) and second (nothing); tax with an empty supply still
    captures; copy/pivot/surpass checks each mode's suit, pips and face;
    chapter-five tie-break also reaches a non-zero holder by a real seize and
    tells "holder", "lowest seat" and "earliest clockwise from the holder"
    apart.
  - *Fixture cleanup:* the `copy, pivot and surpass` setup is rebuilt with
    `table()` and real play (B answers A's lead), so it passes a check after
    every move.
  - *Committed-step sweep (41 tests):* rule: Back must return the table to
    exactly a state already seen (revision and log aside), so nothing is
    paid, queued or flagged by the step backed out of. Targeted:
    every special action (BC02, BC09, BC12 both, BC14, BC23, L01, L10 both,
    L26, L02 with its dice stage, L16 with its ships stage, L18), each paid
    with a pip and with Psionic in the Prelude; a second Prelude resource
    action with the first still held; the Warrior and Feastbringer bonus
    prompt; the Warrior's free move before battle (Back from its steps;
    skipping it leaves the paid battle owed with no Back); Catapult and
    Sprinter Drives ship choices; reroll dice choice; Tycoon's Charm's trade
    (`actedBefore`); all six Vox (no prompt offers Back, nothing stays
    queued). Plus an explorer (20 seeds, 250 moves, rotating leaders and 21
    special cards owned) that checks every Back it meets; it reaches over 20
    kinds of Back.
- **Proved the sweep can fail:** with the engine edited and then restored by
  git, the explorer alone caught a re-opened A4 exploit (`bonusAfter`
  without `required`, seed 1 step 88), which M0's explorer missed; removing
  the `actedBefore` restore failed the Tycoon's Charm test and the explorer;
  paying for a special before its Back failed all 26 special tests and the
  explorer.
- **Issues found:**
  - *Relic Fence (BC24) Back left the turn marked acted (fixed at the owner's
    request after review).* `usePrelude` sets
    `s.turn.acted` on opening BC24, and its Back (`relicFence` "cancel", no
    `back`) does not clear it. Nothing is paid or queued, so it is not an
    exploit, but Back does not fully rewind: Lattice Spies, Tycoon's
    Ambition, Galactic Bards' declaration and Upstart's lead declaration
    (all "before any actions") close, and if the turn has already revealed
    something, declaring and seizing close too. Found by the explorer
    (136 times in a 60,000-move scratch run; nothing else found). Fix
    (`game/engine.js`): BC24 joins the "opening is not an action" list in
    `usePrelude`, and the `relicFence` resolution in `resolveTask` sets
    `acted`, as Lore Preludes do. Test `Back from Relic Fence rewinds; using
    it is an action` (Lattice Spies stays offered after Back, closes after
    use); the explorer no longer excludes Relic Fence. Both fail on the old
    engine.
  - *No engine-vs-rulebook mismatch* in the battle and turn/scoring lists.
  - *Per-move checks:* in a throwaway copy with `transition` wrapped by
    `assertDeepInvariants`, 12 tests fail: the 7 setups still on F-2's list
    and 5 tests added in M2/M4 that use `voxTask`, which takes the Vox card
    out of every pile without giving it to the player ("Court cards are not
    conserved"). F-2's "eight" is therefore twelve; M16 rebuilt them.
  - *Checked, not leaks:* the Cloud Cities payment prompt (`cloudCost`) has
    no Back once a cloud city is chosen, though nothing is paid yet (UI
    only). Elder's Beloved, Noble's Influential, Warlord's Terror and Tyrant's
    Ego free actions, and Prison Wardens with no captives selected, can be
    skipped after the cost is paid: the player's own loss, never a free
    action.
- **Changed in existing tests:** `afterBonus` is now built on a new
  `beforeBonus` (same result). The four tightened tests above were edited in
  place.
- **Files:** `tests/engine.test.js`; `game/engine.js` (Relic Fence only).
- **Result:** 511 tests (70 new), all pass, 0 `todo`; `npm run check`
  builds; `prettier --check` clean on `src tests game server scripts`.

### M15: Leader and Lore card backfill (F-2, C7, C5)

- **What:** `tests/engine.test.js` only; no engine change. Expected values
  come from the card text (`CARDS` in `game/data.js`), the rulebook
  (`work/arcs-rulebook-base.txt`), `data/faq.json` and the printed leader
  cards, not from the engine. New setups use `table()` and real play, except
  where noted. 24 new tests.
  - *Leaders:*
    - Starting resources and A/B/C pieces: the per-leader draft loop now
      checks the two tokens, ships and building in boxes A, B and C at the
      setup card's systems for the seat, and that nothing else was placed. The
      engine and `LEADER_SETUP` are the same table, so a second test compares
      `LEADER_SETUP` with `LEADER_CARDS`, a literal read off the 16 card
      images (the URLs in `data/cards.json`; the setup boxes are only printed
      on the cards, not in any text). All 16 matched.
    - Abilities: Demagogue's Bold (each card once, ends when agents run out)
      and Paranoid (a Ransack may take a Guild card with only the defender's
      agent on it); Noble's Influential (copy and pivot give a second
      influence for one pip, with Back checked; none on a lead or for another
      leader); Shaper's Ancient (no Catapult from a starport, Catapult from a
      gate); Rebel's Disorganized (a normal move takes two ships; others take
      all); Anarchist's Inspiring (taxes a Rival city it does not control, only
      where it has a ship, with the Captive).
    - Warrior/Feastbringer gaps: "Just battle" / "Just secure" take no bonus
      and queue none (and Back rewinds to the action list); Court Enforcers'
      Abduct after and before the Warrior's move: one pip, no Back, a free
      move queued only after, lanes offered by Weapon icons (the card's own
      icon counts).
  - *Lore:* L05 (ships built fresh in a Rival-controlled system; a city is
    still damaged); L08/L11 (gate buildings need the card; one of each type
    per gate in total, even after the card changes hands, per the FAQ; a
    starport and a city may share a gate); L11 (gate-city tax offers each
    cluster type; destroying it Outrages every type; none when the cluster has
    no other city or only another cluster does); L20 (build at a Rival starport,
    damaged in a Rival-controlled system, fresh otherwise; Catapult from a
    Rival starport; both only while Empath is declared; no Captive for an
    uncontrolled city, a Captive when you control it, BUILD-PLAN section 9);
    L06 (a rolled intercept is ignored only if every attacker started fresh;
    one of two still counts); L13 (the card token counts for Keeper and pays a
    Relic Prelude action); L18 (sacrifice a fresh Loyal ship, destroy a
    non-Loyal ship as a Trophy, own ship no Trophy, damaged own ship not
    offered); L28 (clears Fuel, Material or both Outrage, leaves other types,
    returns the agents, discards the card, counts as an action; no trade
    without Tycoon).
  - *Fixture cleanup:* `LEAD08 Demagogue needs two agents for Guild secure but
    one for Vox` is rebuilt with `table()` and a new `putCourt(s, id, i)`
    helper (swaps a card into a Court lane, so it stays in one place). It now
    has a Guild with one agent (not offered), a Vox with one (offered) and a
    Guild with two (offered, and secured).
- **Mutation checks:** with the engine edited and then restored by git, each
  of these made the matching new test fail: Paranoid's threshold, L05's fresh
  ships, L06's ignored intercept, Noble's second influence, L08/L11 card
  requirement and one-per-gate, Shaper's Catapult rule, Anarchist's ship
  requirement; a changed `LEADER_SETUP` value failed the card-data test and a
  changed ship count in `setupPlayers` failed all 16 draft tests.
- **Issues found:** no engine-vs-rulebook or engine-vs-card mismatch in any
  leader or lore listed. The leader setup data matches the printed cards.
- **Checked, not changed:**
  - Empath's Bond still takes a Captive when you control the tax city (the
    "may" in section 9); the test pins that, so changing it later is a
    deliberate step.
  - Noble's second influence (and Elder's Beloved, Warlord's Terror) can be
    skipped after the first is paid; the player's own loss, as noted in M14.
  - A leader's setup boxes exist only as card art. Nothing in the repo text
    states them, so `LEADER_CARDS` is the only guard against a typo in
    `LEADER_SETUP`.
- **Per-move check:** in a throwaway copy with `transition` wrapped by
  `assertDeepInvariants`, exactly 11 tests fail, all M16's: BC17, BC30, the
  BC26/27/28/31 loop and the five `voxTask` tests. No M15 test fails it.
- **Files:** `tests/engine.test.js`.
- **Result:** 535 tests (24 new), all pass, 0 `todo`; `npm run check`
  builds; `prettier --check` clean on `src tests game server scripts`.

### M16: Guild, Vox, Errata and FAQ backfill; reconnect test (F-2, F-3, C12, E1, E2)

- **What:** `tests/engine.test.js` and `tests/server.test.js`; the only non-test
  changes are the two small UI fixes below (Lattice Spies listing, card-phase hint). Expected values come from the card text (`CARDS` in `game/data.js`),
  the rulebook (`work/arcs-rulebook-base.txt`), `data/faq.json` and
  `data/errata.json`, not from the engine. New setups use `table()` and real
  play; a card is handed over with the new `giveCard(s, id, p)` (`own` plus
  refilling any Court lane it empties) so every card stays in one place.
  62 net new tests (60 engine, 2 server).
  - *Fixture cleanup, all of it.* `voxTask` now puts the Vox card in player
    0's `cards`, as `secure` does (fixes the five tests that used it). `BC17
    Farseers draws from a short discard` is rebuilt from the split-pile
    fixture (`farseersRound3p`: one leftover face down, two discards, three
    draws take the whole pile). `BC30 Guild Struggle still reshuffles` and
    the BC26/27/28/31 loop are rebuilt as real plays (`secureVox(id, prep)`
    leads Aggression 1 and secures the card from Court lane 1). `courtLane`
    takes an optional player. Finally `transition` is wrapped with
    `assertDeepInvariants` for the whole of `engine.test.js` (an import alias
    plus a local `transition`); all 415 engine tests pass it, where 11 failed
    before the cleanup.
  - *Vox (per card, M14 only checked "no Back, nothing queued").* BC26 one
    fresh ship in each system of the chosen cluster; BC27 any of the five
    ambitions, optional, no zero marker (`lead.rank` and `declaration.zero`),
    only a skip when every marker is placed; BC28 every player including the
    securer provokes the chosen Outrage, optional; BC29 returns a city you
    control (a Rival's too, no Outrage, no Captive), then an optional seize
    (none for the initiative holder), card shuffled into the deck rather than
    discarded, and the Rival whose full slots shrink picks their own discard;
    BC30 steals one Guild card (never a resource; Sworn Guardians shield the
    others and are buried when stolen), declining still shuffles every Guild
    card from the Court discard into the deck and a Vox card stays discarded;
    BC31 draws the bottom of the face-down discard.
  - *Guild.* BC01/07/15/19/21 are kept on Outrage while another Guild card of
    the same resource is discarded (BC15 is not on the F-2 list but has the
    same text), and each lets any other resource be spent as its own with that
    Outrage ignored, with a without-the-card control; Cartels' after-scoring
    discard when no ambition is scored (both Cartels held by different
    players); Cartel supply is not discardable for Relic Fence, not stealable,
    and its Prelude can be discarded with nothing to steal and steals only
    its own resource; BC16 seizes with no hand card discarded and carries into
    the next round, is refused once the Prelude has an action (a Material spent
    in the Prelude) and only discards once the initiative is seized; BC20
    steals a resource, offers nothing behind Sworn Guardians but the Guardians
    themselves, and discards with nothing to steal; BC25 declares on a
    Surpass or Pivot with no zero marker on the led card, 7 means any
    ambition, seize and declare work in either order, not after the lead
    declared this round, not on a copy.
  - *Errata.* Upstart's Callow with Empath's Bond (untaxable when the city is
    not controlled, own city included; taxable when controlled, with or
    without the Bond), and the Bond still lets it build at a Rival starport;
    Agitator's Irregular applies to the intercept Mirror Plating adds (hits
    per Weapon icon, one Weapon discarded; a normal defender gets one hit per
    fresh ship); Force Beams captures nothing at a Rival's Gate Ports and
    never becomes a Catapult, against a normal move that does both (with an
    `assertRewinds` on its Back); a placed Union leaves `cards`, is in
    `unions`, and cannot be stolen where an unplaced one can (and skipping the
    Union prompt is exactly the old state).
  - *FAQ.* Noble's Connected triggers again for a Populist Demands that
    declares a new ambition, not for one already declared, and Farseers drawn
    by Connected does not see that declaration; Overseer's Ruthless: Outrage
    before the gained resource, the repeat costs no pip, once per turn across
    a ship build and a tax, a hit when the action yields nothing; Cloud
    Cities paid with an Outraged resource, one per planet in total, and only
    with a resource of the planet's type; Keeper's Trust counts the thief's
    Cartel; Raider Exosuits one die against a building-free system but no
    limit when the defender has no building anywhere; Predictive Sensors
    only from adjacent systems, never a Catapult; Tycoon's Ambition with no
    Material or Fuel and a Cartel's supply untouched; the Warrior's Tactical
    move as a Catapult (the battle still owed, a different ship fighting; with
    an `assertRewinds` on its Back); Corsair rerolls once.
  - *Already covered, not repeated:* Empath's Bond build damaged / fresh (M15
    L20), Demagogue's Bold one per card (M15), Warrior rollback (M1 and M14),
    Keeper's Solidarity with a Cartel (`L22 ... cartel supply`), Cartel counting
    for Tycoon (`BC03 cartel supply counts toward Tycoon`), the Farseers
    short-pile FAQ and Call to Action (M7), Noble and Populist refill order
    (M2/M4), BC14 after a Warrior bonus (M15).
  - *F-3 (tests/server.test.js).* The server launch code moved into a
    `launch(t)` helper so a second test can use it. New test: with a 5-minute
    live clock, play ordinary moves until seat B (the guest) has a target
    prompt open, connect both seats, close B's socket; the host sees B
    offline, nothing changes, and the host cannot act for B (400, revision
    unchanged). Reconnecting B gives a first message with the same revision,
    actor, decision title and choices. With B offline again the host extends
    B's clock (120 s): the revision goes up by one, the returning B sees the
    same decision, `clock.bonus[1]` of 120000, and can act at the new
    revision. Second test: a socket that never authenticates is closed (1008)
    within 5-6 s, a bad key at once. It adds about 5 s to the suite (the
    server's 5-second grace period).
- **Mutation checks:** with the engine edited and then restored by git, each
  of these made the matching new tests fail: Outrage keep list, Cartel
  discard only when Tycoon scored, Lattice not seizing / offered after
  acting, Bards placing a zero, Union kept in `cards`, Callow with the Bond,
  Agitator ignoring the added intercept, Freedom not shuffled back, Struggle
  not reshuffling or stealing resources, Trust ignoring the Cartel, Ruthless
  not once per turn, many Cloud Cities per planet, Guardians not protecting,
  Uprising placing one ship, Populist or Bards placing a zero, Outrage Spreads
  hitting only the securer, Bards declaring twice a round, Sensors from
  anywhere, Exosuits allowing six dice with buildings elsewhere, Force Beams capturing at Gate Ports,
  Loyal guilds not ignoring Outrage. Server: removing the broadcast on
  authentication fails the reconnect test, and removing the 5-second close
  fails the second. The first version of the Lattice test passed with the
  "not after acting" rule removed, because the Prelude has already ended
  after a pip action; it now spends a Prelude Material first.
  Follow-up pass (same day), engine edited and restored again, each failing
  the matching new test: Ruthless gaining the resource before the Outrage,
  the Ruthless repeat costing a pip, Ruthless only after a resource was
  actually gained, Call to Action drawing the top of the face-down pile, a
  free bonus move never Catapulting, the bonus-before action costing a pip,
  Corsair offered again, Cloud Cities on any planet (both filters), Outraged
  resources refused for Cloud Cities, Tycoon's Ambition needing a Material
  or Fuel, Freedom provoking Outrage, Freedom discarded rather than
  shuffled back, no Freedom seize, Connected on an already-declared
  ambition, Connected only on the lead, a Bards 7 only when leading,
  Silver-Tongues kept when opened. All ten Playwright scripts
  (`test:browser`, `ux`, `controls`, `learning`, `resources`, `ux-states`,
  `ux-flows`, `player-table`, `shared-board`, `tools`) pass against the dev
  server with `PW_CHANNEL=chrome`; a Chrome check of the Lattice Spies
  listing shows one entry in each case.
- **Issues found:** no engine-vs-rulebook, engine-vs-card or engine-vs-FAQ
  mismatch in any list item. Observations, none changed:
  - *Galactic Bards' "if an ambition has not been declared yet this round"*
    is read by the engine (`roundDeclared`) as "nobody has declared this
    round", so a lead declaration, Populist Demands or Tycoon's Ambition
    blocks it. The other reading ("that ambition is not declared yet") is
    possible; the card and FAQ do not settle it. The new test pins the engine's.
  - *Guild Struggle shuffles the whole Court deck,* so a Sworn Guardians
    stolen by it ("bury it") ends up anywhere in the deck, not at the bottom.
    The card says to shuffle the Guild cards into the deck, so this is the
    natural reading.
  - *Lattice Spies appeared twice* in the action list while the initiative
    could be seized: "Seize with Lattice Spies" (Before actions) and "Lattice
    Spies" (Prelude abilities). **Fixed afterwards at the owner's request**
    (`game/engine.js`, `mainChoices`): the Prelude entry is skipped when the
    Before-actions one is listed; with no seize possible (initiative holder, or
    already seized) only the plain Prelude discard shows. New test `Lattice
    Spies is listed once ...` (fails on the old engine).
  - *The card-phase hint* in `CommandPanel.jsx` ("declare its ambition before
    taking any actions") is reworded to say a declaration also works after
    an action until the turn reveals something new (open since M6).
    **Seen in Chrome afterwards: this paragraph is never displayed.** The
    clear-table layout hides it (`src/clear-table.css`, `.app .phase-card >
    .command-description { display: none }`, from the first commit) and the
    guided "Lead the round" prompt shows instead, so the rewording is dead
    text; either move it into that prompt or drop the paragraph.
  - *Older tests partly overlap the new ones:* `BC01 converts another resource
    and ignores its Outrage` (no without-the-card control, and BC21's case
    spends a Relic) and `BC03 cartel supply counts toward Tycoon`. Left alone.
  - *Back audit:* none of the new paths adds a Back or a Prelude with
    `actedBefore` beyond the ones checked (Force Beams, the Warrior's move,
    Relic Fence, the Union prompt's Skip). Silver-Tongues and the Cartels
    discard their card on opening and offer only Done, as the FAQ allows.
    `SWEEP_CARDS` is unchanged (no lore with a Back added).
- **Files:** `tests/engine.test.js`, `tests/server.test.js`, `game/engine.js`
  (Lattice Spies listing), `src/CommandPanel.jsx` (hint text).
- **Result:** 597 tests (62 new), all pass, 0 `todo`; `npm run check` builds;
  `prettier --check` clean on `src tests game server scripts`; all ten
  Playwright scripts pass (`PW_CHANNEL=chrome`), and the Lattice Spies fix is
  confirmed in Chrome. The card-phase hint is hidden by CSS (see above).

### M17: dead-code sweep, fixture regeneration and old-save shims, UI sweep

- **What, part 1 (dead code; 39 files, about 800 lines).** Four audits
  (engine, client JS, CSS, server/scripts/repo files) with every candidate
  re-verified by grep before removal. Engine: `ownedCards`, the `autoSecure`
  and `battlePrepare` pump cases, the unreachable `preludeAvailable` L25/L28
  branches, the `reorder` main-choice case, the `standardOnly` (orphaned by
  M1) and `guildOnly` flags, autoplay's `reorder` entries. CSS: 133 rule
  blocks and selectors for markup that no longer exists (old SVG map, old
  hand/choice panels, round summary, shared power list), one keyframe, two
  custom properties. Client: unused imports (including redundant default React
  imports), an unused symbol table and board ref, two `Card` props no caller
  passes, the always-true `personalBoard` prop, Blighted Reach branches, five
  internal-only exports, and the client old-save fallbacks (`declarationsFor`
  log scrape, `lastBattle`, the `seconds` clock field). Server: an unused
  import and the unread `serverNow` view field. Repo: `scripts/movement-api-check.mjs`
  (unwired, covered by `tests/turn-controls.test.js`) and two map images
  nothing referenced, with their manifest entries. `scripts/ux-check.mjs` lost
  its old-save declaration block and now records its hand-built battle in
  `battles` like the engine does.
- **What, part 2 (fixture and shims).** `scripts/ux-fixtures.mjs` (replaces
  `ux-simulation-audit.mjs`; `npm run fixtures:ux`) regenerates
  `tests/fixtures/ux-states.json.gz` from the current engine: both bots play
  seeded games and the richest state per decision kind is kept, 48 states
  (the 40 old keys plus eight the state check used to hand-build). With no
  pre-M7 state left anywhere, the engine's `upgradeDiscard` and the
  `discard`/`battles` read fallbacks, the `revealed === false` strict-timing
  branch, `server/history.js`'s `discardPiles` fallback, `knobs()`'s
  `seconds` read and `validateTimer`'s `seconds` alias are gone. Four tests
  that existed only to exercise them were deleted (two single-pile saves, the
  reveal flag, the missing battle list); twelve test and script call sites
  post `turn` instead of `seconds`. `ux-state-check` hand-builds only `revive`
  now; `ux-flow-check` loads the real `farseersDiscard` state and closes the
  M6 late-seize window with a reveal in its exhausted-turn case.
- **What, part 3 (UI sweep).** `scripts/ux-sweep.mjs` (`npm run test:ux-sweep`)
  renders every saved state at 1512x982 (14" MacBook, the main target),
  1440x900, 1280x720 and 390x844, from the acting seat and (at desktop) a
  waiting seat, then opens each dialog and panel (players, ambitions, history,
  library, rules, settings, timers, both discards, an ambition, a system, the
  expanded board, a card) on four states at desktop and phone. Mechanical
  checks per render: no horizontal overflow, no page scroll on a computer, no
  console error, no broken artwork, no clipped text, no control outside the
  window (sideways-scrolling rows excepted) or overlapping another hit-testable
  control (map shapes, resize strips and corner badges excepted), and the live
  command panel visible to the actor. Phone tap targets under 24px are listed
  as notes. Screenshots go to `work/ux-sweep/`, the report to
  `work/ux-sweep/report.json`, and the script exits non-zero on a failure.
  The screenshots were reviewed by eye for every desktop state and a sample
  of the others.
- **Found and fixed:**
  - *Decision tile art* was restyled by the old `.command-choice img` rule
    (`src/style.css`): card art cropped to a 26px slice, token art pushed to
    the right edge with the label after it (Tax type, Cloud Cities, Gain
    choices, drafting). The rule is now scoped to rows that are not
    `.object-choice`, so `decision-objects.css` sizes the art as designed.
  - *Card text in the command panel* showed raw markup (`per \`symbol:hit\``
    on Galactic Rifles). `rulesText` moved from `App.jsx` to
    `src/tableContext.js` and `DecisionObjects.jsx` applies it to the
    description.
  - *The empty-hand note* wrapped one word per line in the laptop layout
    (the hand is a 61px-column grid there); it spans the grid now
    (`src/laptop-fit.css`, `src/style.css`).
  - *Setup cards* (printed landscape) were cropped to a portrait slice in the
    library and discard grids; `Card` marks them `landscape` and they render
    whole (`src/Cards.jsx`, `src/style.css`).
  - *Ambitions dialog* glyphs of different widths misaligned the names; the
    glyph has a fixed column (`src/style.css`).
  - *Phone:* the "Choosing…" placeholder overflowed the 35px round card into
    the next seat's name; it wraps inside the card now, and the smallest
    controls (discard links, guidance toggle, card zoom, round power chips,
    the "Go to action" button, the player-board help, the wordmark, the
    owned-cards carousel arrows, the action help icons and the tile Inspect
    badges) have a 28px hit area (`src/clear-table.css`). The sweep's phone
    notes are empty.
- **Dock height (owner's request, after the sweep):** the automatic dock
  height in `App.jsx` was capped at 46% of the window on tall windows (see
  section 10), keeping the old 400px map reserve below about 870px so the
  1280x700 assertion in `ux-flow-check` still holds.
- **Repo:** `old-notes/` (the three pre-plan review notes, superseded by
  BUILD-PLAN and PROPOSED-CHANGES on 2026-10-10) was deleted at the owner's
  request.
- **Observed, not changed:** the Court's second row is cut by the dock strip
  and scrolls inside the Court (by design since M11); the expanded board on a
  phone letterboxes the map.
- **Files:** `scripts/ux-sweep.mjs`, `scripts/ux-fixtures.mjs` (new);
  `old-notes/` (deleted);
  `tests/fixtures/ux-states.json.gz` (regenerated); `game/engine.js`,
  `game/autoplay.js`, `server/clock.js`, `server/history.js`, `server/index.js`;
  `src/*` (see above); `scripts/ux-check.mjs`, `scripts/ux-state-check.mjs`,
  `scripts/ux-flow-check.mjs`, `scripts/player-table-check.mjs`,
  `scripts/shared-board-check.mjs`, `scripts/hosted-timeout-check.mjs`;
  tests as listed; `docs/asset-sources.json`, `docs/assets-integrity.json`;
  `package.json`, `README.md`.
- **Result:** 593 tests, all pass, 0 `todo`; `npm run check` builds;
  `prettier --check` clean on `game server src tests scripts`; all eight
  Playwright checks pass with `PW_CHANNEL=chrome`; the UI sweep passes every
  cell (344 cells across 48 states, four sizes, two seats and 13
  layers).
