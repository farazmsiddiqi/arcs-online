# Arcs Online: what changed and why

A plain-language overview of the review and the eighteen milestones built
from it between 10 and 16 October 2026. The first part is a two-page index.
The second part gives each area in more detail. It deliberately leaves out
line numbers and test names; those live in the three working documents it
summarises:

- `PROPOSED-CHANGES.md`: the reasoning, with rulebook citations.
- `BUILD-PLAN.md`: the technical plan and the milestone-by-milestone log,
  including each milestone's scope and verification.

---

## Part 1: the index

### The short version

The game was already in good shape when the review started: nobody could
see hidden information, undo could not be abused, the game could not get
stuck, and the battle and turn rules matched the rulebook everywhere
checked. The work since then did five things.

1. **Changed one rule of play.** The action discard pile now uses the
   rulebook's tournament variant with two piles, because the default
   single pile cannot be kept secret online.
2. **Fixed one exploit and six narrow engine mistakes**, and settled a
   handful of judgement calls the rulebook leaves open.
3. **Made the interface safer and clearer**: turn alerts, confirm steps on
   irreversible moves, dice in the log, a battle record, a discard window,
   a laptop layout, and many small fixes.
4. **Added a chess-style time bank** beside the existing turn limit.
5. **Deepened the tests** from 243 to 593, including every leader, lore,
   Guild and Vox card, every errata and FAQ ruling, and a screen-by-screen
   UI check, then removed about 1,000 lines of dead code.

Everything was judged against four priorities, in order: fairness (nobody
can see or do what they should not), correct rules with no stuck games,
little waiting, and an interface that makes rules and state easy to find.
Every claimed problem was checked against the official rulebook, the card
text, the publisher FAQ and the errata before it was acted on. The claims
that turned out to be wrong are listed at the end so nobody re-raises them.

### Milestone index

| Milestone | Area | What changed, in one line |
| --- | --- | --- |
| M0 | Testing | Safety net first: a random player that tries everything, and checks after every move that no piece, card or marker is lost or duplicated. |
| M1 | Rules | Warrior and Feastbringer could get their bonus action for free by pressing Back at the right moment. Closed. |
| M2 | Rules | The last pass of a chapter hands the initiative on; a card declaration and your lead-card declaration are independent. |
| M3 | Rules | Elder Broker's trade no longer gives away an empty slot; Ancient Holdings' 4-key slot stays put; Tycoon's Charm is only offered with something to trade. |
| M4 | Rules | Populist Demands resolves everything it triggers before the Court refills; Sprinter Drives moves one group, once. |
| M5 | Battles | Elder's Ransack protection remains battle-only; Agitator's player picks which Weapon to discard; an empty reroll no longer spends the ability. |
| M6 | Rules | Declaring and seizing stay open after actions until the turn reveals something new. |
| M7 | Gameplay | Split action discard piles, the rulebook's tournament variant: face-up plays public, face-down plays and leftovers hidden. |
| M8 | Interface | The Action discard window, the full table history grouped by turn, and an uncapped log. |
| M9 | Interface | Clearer Tyrant and Warlord text, Back buttons on more steps, FAQ and errata searchable in the library, duplicate names refused. |
| M10 | Interface | Closing a card returns to the library, a setup card preview when creating a table, a draft pick-order strip. |
| M11 | Interface | Confirm steps on one-click irreversible moves, a tab-title flash and chime on your turn, timer pop-ups, a laptop layout. |
| M12 | Battles | Dice faces and rerolls in the log, why a raid came to nothing, and a battle record for the whole game. |
| M13 | Timers | A time bank and increment alongside the turn limit, free response seconds, draft picks never charged. |
| M14 | Testing | Battle, turn and scoring tests against the rulebook, and a check that every Back button restores the table exactly. |
| M15 | Testing | Every leader and lore card tested against its printed text; leader setups verified against the cards. |
| M16 | Testing | Guild, Vox, errata and FAQ tests, and a server test for reconnecting mid-decision. |
| M17 | Cleanup | Dead code removed, saved test states rebuilt from the current engine, old-save code dropped, and a UI sweep that found and fixed six screen defects. |

### Numbers

| | Before | After |
| --- | --- | --- |
| Rules tests | 243 | 593 |
| Browser checks listed in the README | 3 | 9, plus the UI sweep over 344 renders |
| Publisher errata implemented | 10 of 10 | 10 of 10, now each with a test |
| FAQ rulings followed | 58 of 59 | 58 of 59, the untested ones now tested |
| Code removed in cleanup | | about 1,000 lines across 57 files |

---

## Part 2: the detail

### 1. The action discard pile (M7, M8)

This is the one change to how the game plays, and the only decision that
needed the group's agreement.

**The problem.** The rulebook's default rule keeps one face-down discard
pile that nobody is supposed to remember. Online that cannot be enforced:
the log names every face-up play, so anyone who scrolls back knows the
pile, and anyone who does not is at a disadvantage. Worse, the engine
discarded cards in a fixed order, so the exact layout of the pile could be
worked out. Farseers, which draws from the bottom, became a search tool:
in a three-player game you could discard two cards, draw three, and the
third was the first round's lead card. No physical table has this
problem, because people scoop cards in random order.

**Two solutions were weighed.**

| | Solution A: split piles (chosen) | Solution B: one pile, shuffled each round |
| --- | --- | --- |
| Source | The rulebook's own tournament variant | A house rule that mimics how a real table scoops cards |
| What you see | A live panel of the face-up pile by round, and a count for the face-down pile | A cumulative record that cannot say which early cards have since been drawn |
| Honesty | Every card shown is certainly in the pile; a visible card can never be drawn | Not live; players have to reason about "maybe Bob has it" |
| Farseers | Slightly weaker: a face-up card is gone for the chapter | Slightly stronger than the base game, since everyone has perfect memory |
| Table disputes | None, it is the written rule | Small, but a house rule |

**How it works now.** Cards played face up (lead, surpass, pivot) go to a
face-up pile. Cards played face down (copies, seize cards), the leftovers
dealt at the start of each chapter, and the cards you discard to Farseers
go to a face-down pile. Every draw from the discard takes the bottom of
the face-down pile. If that pile runs short, both piles are shuffled
together and the log says only how many face-up cards went in. Each
chapter starts both piles afresh.

The Action discard window shows the face-down count, the face-up cards by
round with who played each and how, the last merge, and a draw log in
counts only. No face-down card is ever named anywhere, and a test checks
that.

**Details settled on the way.** Farseers counts your own discards before
checking whether the pile is short, as the publisher FAQ assumes, so it
only merges the piles when the face-down pile was already empty. The
two-player mulligan is unchanged. Rejected: a viewer over the old
deterministic pile (keeps the Farseers search), a fully shuffled pile
(Farseers could pull any strong card from any depth), and scrubbing the
log to force pure memory (unenforceable). Solution B remains a possible
table option if the group misses base-game Farseers after real play.

### 2. Rules fixes (M1 to M5)

Each of these is a place where the engine did something the rulebook does
not say. The fix was to follow the rulebook.

- **Warrior and Feastbringer bonus actions (M1).** Both leaders get a bonus
  move or influence alongside a battle or secure. Choosing "after" and
  then pressing Back on the main action kept the bonus queued and never
  spent the pip, repeatably. This was the one real exploit found. Now,
  once you choose "after", you must complete the paid action; if it has
  no legal target the whole choice is undone. A second hole found during
  the fix (the same trick through Court Enforcers' Abduct or Galactic
  Rifles) was closed in the same milestone. Decision recorded: a misclick
  on these paths cannot be reversed, because competitive integrity wins
  over convenience.
- **Who opens the next chapter (M2).** When everyone passes in a row, the
  final pass still hands the initiative marker on, so the first person to
  pass opens the next chapter. The end-of-game tie-break counts from the
  same marker.
- **Two declarations in one turn (M2).** Your lead card's declaration is
  independent of Populist Demands and Tycoon's Ambition. The three
  markers remain the only cap. Tycoon's Ambition no longer counts as an
  action.
- **Elder Broker's trade (M3).** Paying for the Trade with a resource
  spends it first, so the slot you emptied can no longer be the one you
  "give" the rival.
- **Ancient Holdings' special slot (M3).** The 4-key slot stays last. Its
  contents no longer slide onto an ordinary 1-key slot when your number of
  cities changes.
- **Tycoon's Charm with nothing to trade (M3).** The trade is only offered
  when you hold Material or Fuel. The random-play tests had been hitting
  the empty form on their own.
- **Populist Demands and Noble (M4).** Everything a Populist Demands
  declaration triggers resolves before the Court refills, so Noble draws
  the card that was on top of the deck. The same ordering now applies to
  every Vox card.
- **Sprinter Drives (M4).** One group, one extra move, as the FAQ says.
  It used to let every group dropped along a Catapult move again.
- **Elder and Galactic Rifles (review correction).** Elder's protection applies
  only when rivals battle you. Galactic Rifles is not Battle and does not
  receive that protection, consistent with its publisher FAQ.
- **Agitator's Weapon discard (M5).** With two or more Weapons, the
  Agitator's player chooses which to discard. Slot position sets the raid
  cost, so it matters.
- **Rerolls (M5).** Confirming a reroll with no dice selected no longer
  uses up the ability. A battle with no dice skips the empty reroll step.

### 3. Declaring and seizing later in your turn (M6)

The rulebook's Fine Print says declaring an ambition and seizing the
initiative happen before your actions, but tables usually allow them any
time before new information is revealed. The engine used to lock both
after your first action. It now uses the lenient reading.

You can declare your lead card's ambition or seize the initiative after
taking actions, as long as nothing new has been revealed this turn.
Building, moving, taxing and Prelude spending leave both open. They close
once dice are rolled, a deck is shuffled, a card is drawn, a rival's hand
is seen, or another player responds. The panel says why they closed. A
late declaration still makes your lead card 0, and a late seize still
costs an extra face-down card.

Cards that print "before any actions" (Upstart, Tycoon's Ambition,
Galactic Bards, Lattice Spies) keep their strict timing. Backing out of a
Union or a Lore ability with Skip or Done no longer counts as an action.
The automatic player never declares after something is revealed.

Decisions made by the owner: a declaration's own reveal (Noble, Farseers)
does not close the other choice before your first action; any other
player's decision closes the window, the stricter reading; Railgun Arrays
counts as a reveal. Besides thirty new tests, every simulated game checks
after every move that anything the undo history treats as new information
also closes declaring and seizing.

### 4. Battles (M5, M12)

**The defender could not see the dice.** Rolls were logged as a count,
rerolls were not logged, and the battle record was overwritten by the next
battle. Now the roll line ends with the faces that came up, each reroll
names who did it, which ability allowed it and each die's old and new
face, and Galactic Rifles logs the dice it rolls.

**A raid that steals nothing says why**: no attacking ship left, no keys
left, nothing affordable, or nothing stealable.

**A battle record for the whole game.** "Review latest battle dice" in the
Table history lists every battle, newest first and grouped by chapter,
with who fought whom, the round, the sector, which abilities rerolled and
the final dice.

**Labels.** Rivals now see "Choosing effect order" and "Using Farseers"
instead of a generic message during those steps.

### 5. Interface (M8 to M11)

**Knowing it is your turn (M11).** The tab title flashes "Your turn" when a
decision becomes yours while the tab is in the background, and flashes
timer notices that are about you. The your-turn chime is on by default
with a mute in Settings. Every player sees a pop-up when the host pauses,
resumes, adds time or changes the timer, and when the AI takes over a
turn. Pop-ups last nine seconds and only show what you missed.

**Confirm steps (M11).** Four one-click moves now stop for a small "Review
& confirm" box: passing initiative, any face-up card play, securing a
Court card, and starting a battle. Nothing is sent until you press
Confirm; Cancel or Escape leaves the game exactly as it was. Each box says
what the move will do. Copying face down has no confirm, since undoing it
shows nobody anything. The expanded map shrinks when a confirm opens, so
the box is never hidden under it.

**The table history (M8).** The log is no longer cut to the last 150
lines. Table history groups it by chapter, round and whose turn it was,
and opens at the newest turn.

**The card library (M9, M10).** Closing a card you opened from the library,
a discard window or the Players list returns you to that list with your
search and scroll intact. The search also finds FAQ and errata text, cards
with clarifications carry an FAQ badge, and card names in an FAQ open that
card. Setup cards show whole instead of cropped.

**Creating a table and drafting (M10).** The create-table form shows the
setup card art, and on "Random official setup" you can tap one of the four
possible cards to choose it. The Leaders & Lore draft shows a strip of pick
chips in the real pick order: who has picked and what they took, whose
turn it is, who is waiting, and who holds initiative.

**Text and small fixes (M9).** Tyrant and Warlord now explain what Captives
and Trophies are and when they return. The "System details" window no
longer drops to the rules page whenever the game updates. Fleet selection
says "select ships, then confirm". Joining with a name already at the
table is refused. Back buttons were added wherever nothing has been paid
yet, and deliberately left off where something already has (battle dice,
Predictive Sensors, Farseers, Rifles' reroll).

**Laptop layout (M11, M17).** On laptop-sized windows the hand sits beside
the player board instead of under it, the round strip is shorter, and the
map is 30 to 100 pixels taller depending on the window. In M17 the action
area's automatic height was capped at 46% of a tall window, so a long
Prelude panel leaves the map about 370 pixels on a 14-inch MacBook; a
longer panel scrolls and the divider can still be dragged.

### 6. Timers (M13)

The only limit used to be per turn. The host can now set any mix of three
settings: a turn limit, a time bank that lasts each player the whole game,
and an increment added to the bank each time your card turn starts. When
both a turn limit and a bank are on, whichever runs out first applies.

- The first 10 seconds of each response you make in someone else's turn
  do not touch your bank, so nobody can drain it by forcing small prompts.
- Draft picks never use the bank.
- When the bank runs out, you get just the increment if there is one;
  otherwise the usual "when time runs out" setting takes over.
- The host's "Add time" goes to whichever limits are on.
- The timer button says which limit is counting ("turn 3:12" or
  "bank 24:50"), and the Turn timers window shows each player's bank with
  a bar and how much has been charged to it.

Changing settings mid-game keeps the time each player has already used,
so a bank turned on in chapter 2 starts part-used; the pop-up says so.

### 7. Testing (M0, M14 to M16)

**The safety net (M0).** A second random player that tries everything,
including Preludes, seizes, passes and Back, runs over sixty seeded games,
and after every move the tests check that agents, Court cards, ambition
markers and pieces are conserved. These checks run only in the tests, not
in live games, so a mistaken check can fail a test but never freeze a real
table.

**Battle, turn and scoring (M14).** Dozens of rulebook facts pinned by
tests: hits reach buildings only once ships are gone, raids offer only
what keys can pay for, intercepts count once, a 7 declares anything and a
1 nothing, the game ends early at 27, 30 or 33 Power, markers flip after
chapters 1 to 3, and the Catapult rules. Every Back button is now checked
to restore the table exactly, by a random player that presses Back
wherever it can. Putting the old Warrior bug back briefly proved the check
finds it at once. One real fix fell out: opening Relic Fence and backing
out no longer counts as an action.

**Leaders and lore (M15).** Every leader's starting resources and boxed
pieces are checked against the printed cards, and the abilities of every
leader and lore card are tested against their text.

**Guild, Vox, errata and FAQ (M16).** Each Vox card has its own test, the
Loyal guilds and Cartels are covered, and every errata and the untested
FAQ rulings now have a test. The stricter after-every-move check now runs
across the whole engine suite. A server test plays until a player has a
prompt open, drops their connection, shows nobody can act for them, and
checks they see the same prompt when they return. Two UI fixes came out of
it: Lattice Spies was listed twice while the initiative could be seized,
and the card-phase hint was out of date.

**Findings that were not bugs.** No disagreement between the engine and the
rulebook, cards or FAQ was found in any backfilled list. Two readings are
recorded as the engine's: Galactic Bards' "not declared yet this round"
means nobody has declared, and Guild Struggle shuffles the whole Court
deck.

### 8. Cleanup and the UI sweep (M17)

**Dead code.** Four audits (engine, client, stylesheets, server and repo
files) found about 1,000 lines that nothing used: engine branches nothing
could reach, 133 style rules for screens that no longer exist, unused
imports and props, an unwired script, two unused map images. Nothing
visible changed.

**Fresh saved states.** The browser checks render saved engine states, and
the old set predated the split discard piles and the time bank, so the
engine and server carried code to read those old shapes. A new script
(`npm run fixtures:ux`) rebuilds the set from the current engine, 48
states covering every kind of decision. The release review added an explicit
server-side migration for existing saved games, including undo snapshots and
clocks, plus a pre-upgrade SQLite backup. Existing games continue after deploy.

**The screen sweep.** `npm run test:ux-sweep` renders every saved state
at four window sizes (14-inch and 13-inch laptops, a 1280x720 window, a
phone), from the acting seat and a waiting seat, and with every dialog
open. It checks for sideways overflow, page scrolling on a computer,
console errors, missing art, clipped text, controls off the window or on
top of each other, and whether the acting player can see their command
panel, and saves a screenshot of every render. The first run found six
defects, all fixed:

- Decision tiles showed a cropped sliver of card art, or the token pushed
  to the far right. An old style rule for a different list was restyling
  them.
- Card text in the command panel could show raw markup instead of a
  symbol.
- "Your hand is empty" wrapped one word per line on laptop windows.
- Setup cards in the library were cropped to a portrait slice.
- The Ambitions dialog's names did not line up.
- On a phone the "Choosing…" placeholder ran over the next seat's name,
  and the smallest buttons were hard to tap.

### 9. Checked and left alone

Reviewers raised these; the rulebook says the engine was right.

- A player with initiative and no cards must pass; the chapter does not
  end early.
- Buildings need only a Loyal piece in the system, not control; they are
  built damaged if a rival controls.
- Ransack is mandatory.
- Feastbringer's "rival with the least Power" tie goes to turn order.
- Catapult checks control before entering, only from Loyal starports, and
  stops at any planet.
- Agitator's intercept fires on the roll, even with no fresh defender.
- Outrage with no agent in supply uses a placeholder.
- Tyrant has no neutral value in two-player games.
- A card secured this Prelude cannot use its Prelude ability; a stolen
  card can.
- Song of Freedom's "city you control" means a city in a system you
  control.
- New actions like Force Beams are not offered on free bonus actions.
- Empath's Bond still takes a Captive when you tax a rival city you
  control, because the normal tax is available and better.

Known and accepted: there is no way to end or abandon a game if the host
vanishes; "Finish Prelude" costs a click every turn; no UI test runs in
the normal test command or in CI, the sweep is run by hand; the Court's
second row scrolls inside the Court on small windows; the expanded board
on a phone has empty space above and below the map.

### 10. How to verify

| Command | What it checks |
| --- | --- |
| `npm run check` | The 593 rules and server tests, then the production build |
| `npm run test:simulation` | More seeded random games |
| `npm run test:ux`, `test:ux-states`, `test:ux-flows`, `test:controls`, `test:learning`, `test:resources`, `test:player-table`, `test:shared-board` | Browser checks against a dev server (`npm run dev`), with `PW_CHANNEL=chrome` to use an installed Chrome |
| `npm run test:ux-sweep` | Every saved state at four sizes with every dialog; screenshots in `work/ux-sweep/` |
| `npm run fixtures:ux` | Rebuilds the saved states after an engine change |

All of the above passed at the end of M17. The work is committed on the
`milestones` branch, one commit per milestone, to be squashed into a single
pull request.

## Release review corrections

The release review supersedes the earlier proposals in BUILD-PLAN.md and
PROPOSED-CHANGES.md on the following points:

- Elder's printed “when they battle you” condition still applies. The word
  “cannot” does not remove the condition. Galactic Rifles is not Battle.
- A consistent SQLite backup is created in the persistent data directory before upgrading old saves.
- Existing saved tables load through a versioned compatibility migration,
  including undo/redo and pending rollback snapshots. Old discard order is
  retained face down; no card is exposed or shuffled during migration.
- Existing timer limits and elapsed time survive migration. Legacy clients
  can still submit the previous `seconds` timer setting.
