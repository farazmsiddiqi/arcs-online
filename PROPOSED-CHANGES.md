# Arcs Online: proposed changes

A plain-language summary of everything the October 2026 review found and
everything that was changed as a result. Sections 1 to 10 are the findings
and proposals as they were written on 2026-10-10; every proposal in them was
built, and the log in section 11 says how, milestone by milestone. Technical
detail lives in BUILD-PLAN.md; the short overview is CHANGES.md.

**How we got here.** Four reviews of the rules engine, the server and the
interface; then every leader, lore, Guild and Vox card checked against its
printed text; then every publisher errata and FAQ answer checked against
the engine. Every claimed problem was re-checked against the official
rulebook before it made this list. Several things reviewers flagged turned
out to be correct and are listed at the end so nobody re-raises them.

**What we judge changes against, in order:** fairness (nobody can see or
do what they shouldn't), correct rules with no stuck games, little waiting,
and an interface that makes rules and state easy to find.

**How this document is ordered.** The short version comes first. Then the
one proposal that changes how the game plays, the action discard pile,
because it is the decision the group most needs to make. After that come
the narrower rules fixes and decisions, then interface and timer work, then
testing, and finally the list of things we checked and are leaving alone.

---

## 1. The short version

The game is in good shape. Nobody can see hidden information, undo cannot
be abused, the game cannot get stuck, and the battle and turn rules match
the rulebook everywhere we could check. All ten publisher errata are
implemented. Of 59 official FAQ rulings, 58 are followed.

What we found, in rough order of importance:

- **The discard pile does not work online.** The rulebook's default rule
  relies on nobody remembering a face-down pile. Online, the log makes the
  pile public and the engine's fixed order turns Farseers into a search
  tool. We chose the rulebook's own tournament variant with split piles.
  This is the one change that alters how the game plays, and it is
  explained in full in the next section.
- **One exploit.** Warrior and Feastbringer can get their bonus action for
  free by pressing Back at the right moment.
- **Six rules mistakes**, all narrow: who starts the next chapter after
  everyone passes; Elder Broker's trade giving away an empty slot; Ancient
  Holdings' special slot drifting; Populist Demands refilling the Court
  too early; Sprinter Drives moving too many groups; and two declaration
  rules being stricter than the rulebook.
- **A few places the engine decides for you** when the rules give you a
  choice, mostly in battle.
- **Interface gaps** that cost real games: no signal that it is your
  turn, one-click irreversible moves, and the defender never seeing the
  dice.
- **Tests are wide but shallow.** Many card abilities have no test, the
  simulation never uses Preludes, and no interface test runs
  automatically.

---

## 2. The action discard pile (Item 3)

This is the largest rules change and the one decision in this document
that needs the group's agreement, so it gets the fullest explanation.

### What the game did before

There is one action discard pile. At the start of each chapter, the deck
is shuffled, six cards go to each player, and the leftovers (four cards in
a four-player game, two in three-player, eight in two-player) are shuffled
and placed as the pile. Nobody ever sees them. At the end of each round,
every played card is put on top of the pile in the order it was played,
face-up and face-down plays mixed together. A few cards draw from the
pile: the two-player mulligan, Farseers, and Call to Action all take from
the bottom. The interface shows no discard pile at all, not even a count.

This is the rulebook's default rule, which the rulebook itself says
"favors players with good memory".

### Why it is a problem online

**The information is public anyway.** The game log names every face-up
play, and every player receives the last 150 log lines. Anyone who scrolls
back has the full list of discarded cards; anyone who does not is at a
disadvantage. Hiding the pile cannot be enforced online: a player can keep
notes, take screenshots, or open a second tab.

**Farseers becomes a search tool.** Because the engine's discard order is
fixed and the play order is public, the exact layout of the pile can be
worked out. Once the unseen leftovers have been drawn, Farseers returns a
specific, known card. In a three-player game with two leftovers: discard
two cards, draw three, and the third card is the first round's lead card.
No physical table experiences this, because real players scoop cards in
random order and nobody can track a face-down pile. The default rule's
balance quietly depended on that sloppiness.

### Solution A: the rulebook's split piles (recommended)

The rulebook's Fine Print offers this as a tournament variant. Two piles.
Cards played face up (lead, surpass, pivot) go to a face-up pile. Cards
played face down (copy, seize) and the chapter-start leftovers go to a
face-down pile. Every draw from the discard takes from the bottom of the
face-down pile. If the face-down pile runs out, both piles are shuffled
together into one face-down pile and a new face-up pile starts.

The interface shows a live panel of the face-up pile, grouped by round,
plus a count for the face-down pile. Every card shown is certainly
in the pile. Draws show only "X drew N cards". After a merge the panel
shows what was shuffled in and the new count.

Benefits: it is the written tournament rule, so there is nothing to argue
about at the table. The viewer never lies and never leaks a hand, because a
visible card can never be drawn. It kills the Farseers search: face-down
draws are the unseen leftovers first, then copies and seizes in order.
What you see is what is there.

Trade-offs: a face-up card is gone for the chapter, so Farseers can no
longer dig a good card back. That is a small nerf, mostly to deep digs in
three-player games; shallow digs and the look-at-a-hand half of Farseers
are unaffected. A player who copied or seized with a good card knows when
the face-down pile will return it; rare, and true at a physical table too.

### Solution B: one pile, shuffle each round, cumulative viewer

Keep one pile and the bottom-draw rule. At the end of each round, that
round's played cards are shuffled among themselves before going on top.
This only reproduces how a physical table scoops cards; the engine's
strict order is the artefact. Draws still take leftovers first, then round
one in random order, then round two, and so on.

The interface would show a cumulative record: every card discarded face up
this chapter, grouped by round, plus the pile count and how many cards
have been drawn. It never removes a card. Because draws come from the
bottom in round order, it can say precisely "round 1: one of four drawn,
unknown which; rounds 2 and later: all present".

Benefits: Farseers keeps its base-game value, since face-up cards remain
reachable. This is exactly what a perfect-memory player knows under the
default rules, offered equally to everyone. The engine change is smaller:
one shuffle per round, no merge case.

Trade-offs: the viewer is not live. Once cards have been drawn, you cannot
know whether a given early card is still in the pile or in someone's hand.
That is the base game's intended uncertainty, but the panel has to explain
it and players have to reason about it. The per-round shuffle is a house
rule, small and defensible but not in the rulebook. And Farseers becomes a
small buff over the base game as humans actually play it, because everyone
now has perfect memory of the discards.

### Our recommendation

Solution A. The viewer is live and honest: every card it shows is
certainly in the pile, so nobody has to reason about "maybe Bob has it".
That makes play easier and removes any table dispute, because it is the
rulebook's own tournament setting. The Farseers nerf is small and one the
designer explicitly accepted by publishing the variant. Solution B is a
legitimate fallback if, after real games, the group misses base-game
Farseers; it can be added later as a table option without reworking the
panel.

Rejected on the way: a viewer over the old deterministic pile (keeps the
Farseers search); a fully shuffled pile (Farseers could pull any strong
card from any depth, and the viewer could not be made honest); scrubbing
the log to force pure memory (unenforceable online).

---

## 3. Rules fixes (the engine does something the rulebook does not say)

The rest of the rules work is narrow. Each item below is a place where the
engine and the rulebook disagree, and the fix is simply to follow the
rulebook.

**Who starts the chapter after everyone passes.** When every player passes
in a row, the chapter ends. The rulebook says the final pass still hands
the initiative marker to the next player, so the first person who passed
opens the next chapter. The engine leaves it with the last passer. Rare,
but it also affects the end-of-game tie-break. (Item 8)

**Warrior and Feastbringer: free bonus actions.** Both leaders get a bonus
move or influence alongside a battle or secure. If you choose "after",
then press Back on the main action, the engine keeps the bonus queued and
never spends your pip. You can repeat it. The fix (done, M1) removes Back
once you have chosen "after": you must complete the paid action, and if no
legal one exists the whole choice is undone. This is the one real exploit
found. (C6)

**Elder Broker's trade.** Trade swaps one of your resources for one of a
rival's. If you pay for the Trade action with a Psionic resource, the
engine still lets you "give" the slot you just emptied, so the rival hands
over a resource and gets nothing back. Fix: the slot you paid with is
never offered (done, M3). (C8)

**Ancient Holdings' special slot.** This lore card adds a resource slot
that costs 4 keys to raid. The engine tracks that slot by position, so when
your number of cities changes, whatever is on the card slides onto an
ordinary slot that costs 1 key to raid. Fix: anchor the card's slot so its
contents stay put (done, M3). (C1)

**Populist Demands and Noble.** Securing Populist Demands lets you declare
an ambition. If that declaration triggers something (Noble's Connected
draws the top Court card), the engine refills the Court first, so Noble
draws the wrong card. Fix: everything the secure triggers resolves before
the new card appears. (C9)

**Sprinter Drives.** The card lets fresh ships that just moved move once
more. The official FAQ says one group, one extra move. The engine lets
every group you dropped off along a Catapult move again, which makes the
card roughly a second Move action for your whole fleet. Fix: one group,
once. (C3)

**Tycoon's Charm with nothing to trade.** The card's trade is offered even
when you hold no Material or Fuel, which opens an empty form with no way
out except Undo. Fix: only offer it when you have something to trade (done, M3). (C2)
The new random-play test driver (Item 13) ran into this on its own in 2 of
400 games, so it comes up in ordinary play. The timeout bot cannot press
Undo either: if the clock runs out on that form, it submits an empty
choice, which the engine rejects.

---

## 4. Rules decisions we made

Unlike the fixes above, these are judgement calls the rulebook leaves
open. They are settled.

**Declaring and seizing later in your turn.** The rulebook's Fine Print
says these happen first, but players usually allow them any time before
new information is revealed (dice rolled, a card drawn). The engine used to
lock them after your first action. We chose the lenient reading: they stay
available until you have taken an action and something has been revealed
(dice, a card drawn, a hand seen, or another player responding). Upstart,
Tycoon's Ambition, Galactic Bards and Lattice Spies keep their stricter
printed wording. (Item 16, built in Milestone 6)

**Two declarations in one turn.** Populist Demands and Tycoon's Ambition
each let you declare an ambition from a card. The rulebook limit is "not
twice with the same card", so a card declaration and your lead-card
declaration are independent and can both happen in one turn. The three
available markers remain the only cap. The engine used to allow one per
turn; fixed in Milestone 2. (Item 17)

**Elder versus Galactic Rifles.** Elder's card says rivals cannot Ransack
the Court when they battle you. Galactic Rifles destroys pieces by rolling
dice outside a battle. Since the rulebook treats "cannot" as absolute, we
decided Elder's protection covers Rifles too. (Item 15)

**Zero-dice battles stay legal.** The rulebook lets you collect fewer dice
than the maximum and does not forbid zero. A zero-dice battle still counts
as a battle for Repair Drones and Quartermaster, which gives a risk-free
repair. We keep it; the engine only skips the pointless "reroll" step.
(Item 9)

**Choosing not to reroll keeps the ability.** If a reroll ability's dice
picker is confirmed with nothing selected, the engine used to mark the
ability as used. It no longer does (Milestone 5). (Item 9)

**Ransack is mandatory.** The rulebook lists it as a required step after
destroying a city. The engine is right to force it. No change.

---

## 5. Choices the engine makes for you

**Agitator's Weapon discard.** When Agitator's intercept fires, it discards
one of your Weapons. The engine picks the lowest slot. Slot position sets
the raid cost, and the raid in the same battle happens afterwards, so you
should choose. (Item 9)

**Which Court card to Ransack** is already your choice. Confirmed correct.

---

## 6. Battle clarity

**The defender cannot see the dice.** The roll is logged as a count, not
the faces; rerolls are not logged at all; the battle record is overwritten
by the next battle. A raid that steals nothing (because every attacker
died, or keys ran out, or nothing was affordable) leaves no trace. Done in M12:
log the faces after every roll and reroll, log why a raid ended empty, and
keep a battle record for the chapter. (Item 10)

**Two "what is X doing" labels never show.** Rivals see a generic label
while a player orders simultaneous effects or discards for Farseers,
because two internal names do not match. Two-word fix. (Item 10)

---

## 7. Interface improvements

**Knowing it is your turn.** Nothing signals your turn except a chime that
is off by default. With four friends in background tabs, nobody notices.
Done in M11: flash the tab title when the actor changes to you, turn the chime
on by default with a mute, and show timer events (pause, extend, AI
takeover) as pop-up toasts for everyone. (Item 1)

**One-click irreversible moves.** Three single clicks commit with no
confirm: "Pass initiative", clicking a Court card while securing, and
clicking a system while battling. A player who meant to read a card has
secured it. Done in M11: a small confirm on each, like the existing End turn
review, and the same on face-up card plays. (Item 11)

**Card library navigation.** Opening a card from the library and closing it
drops you back on the board instead of the library. Done in M10: close returns
to the library with your search and scroll position intact. (Item 2)

**Setup card preview.** The table creation form names the setup ("Mix Up
1") without showing it. All twelve official setup cards are already bundled
and unused. Done in M10: show the card image. (Item 4)

**Draft pick order.** During the Leaders & Lore draft nothing shows whose
pick it is or who is next. Done in M10: a strip of player chips in pick order
with the current pick highlighted. (Item 5)

**Ambition descriptions.** The Tyrant and Warlord descriptions do not say
which pieces count or that they return to their owners at chapter end when
the ambition is scored. The Warlord line is also backwards. Done in M9:
rewrite both, matching the rulebook's wording. (Item 7)

**Small fixes.** The "System details" window closes itself whenever
anything happens at the table. Two ship-selection forms show the wrong
instruction. Two players can join with the same name, which makes the log
ambiguous. Several forms have no Back button, and Relic Fence cannot be
cancelled once clicked. FAQ and errata are only visible inside a card's
detail view and not searchable. (Item 12, C11)

---

## 8. Timers

**Time bank.** The only limit used to be per turn. Done in M13: three
independent settings. A per-turn cap (the old setting), a total time bank
for the whole game, and an increment added to the bank at the start of
each of your turns, chess-style. Any combination works. Decisions already
made: when the bank hits zero you get only the increment, or the usual
expiry behaviour if there is none; the first ten seconds of a response
inside a rival's turn are free, so nobody can burn your bank by forcing
small responses; draft picks never charge the bank; a host extension adds
to the bank. Existing tables are unaffected. (Item 6)

---

## 9. Testing

The suite was broad (243 tests, every card touched) but shallow in three
ways, and deepening it was the cheapest insurance against future
regressions, including against the changes above.

**The simulation avoids most of the game.** Thirty seeded random games run
on every test, but the random player never uses a Prelude ability, never
seizes or passes, never cancels, and always picks the first option in every
form. Done in M0: a second driver that tries everything, run over more seeds.
(Item 13)

**The invariant checker misses conservation laws.** After every move the
engine checks a list of sanity rules, but not that agents, Court cards or
ambition markers are conserved, so a lost or duplicated piece would pass
silently. Done in M0: add those checks. (Item 13)

**Many tests start from impossible states.** The main test fixture hand-sets
a turn in a way that cannot occur in play. Done in M14 to M16: a helper that reaches
a turn by actually playing cards. (Item 13)

**Specific gaps.** Nine of ten errata have no test proving the engine
follows the corrected text. Thirty-one FAQ rulings are untested. Leader
starting pieces are never asserted. A list of around forty card abilities
and rules that were verified correct by hand but have no test is in the
build plan. Reconnecting mid-decision works but has no test. (Items 14, 18,
and the card-pass lists)

**Where the new checks run (decided).** The stricter checks run only in
the test suite, not in live games, so a mistaken check can fail a test but
never freeze a real game. In the main engine tests they run at chosen
points rather than after every move, because eight older tests start from
hand-built positions real play cannot reach. Those eight get rebuilt during
the test backfill, and then every move gets checked.

**No interface test runs automatically.** The browser checks exist but need
a running server and are not part of the normal test run. Accepted for
now; the confirm-step work should at least add to them.

---

## 10. Things we checked and are leaving alone

Reviewers raised these; the rulebook says the engine is right.

- A player with initiative and no cards must pass; the chapter does not
  end early. (Rulebook p.8)
- Buildings need only a Loyal piece in the system, not control; they are
  built damaged if a rival controls. (p.12)
- Ransack is mandatory. (p.16)
- Feastbringer's "rival with the least Power" tie goes to turn order.
  (p.22)
- Catapult checks control before entering, only from Loyal starports, and
  stops at any planet. (p.13)
- Agitator's intercept fires on the roll, even with no fresh defender.
  (p.14)
- Outrage with no agent in supply uses a placeholder. (p.22)
- Tyrant has no neutral value in two-player games. (p.4)
- A pass ends the round, so the round counter is right. (p.8)
- A card secured this Prelude cannot use its Prelude ability; a stolen
  card can. (p.20)
- Song of Freedom's "city you control" means a city in a system you
  control. (p.7)
- Undealt cards sit at the bottom of the discard pile. (setup step Q)
- New actions like Force Beams are not offered on free bonus actions.
  (p.20)
- Empath's Bond still takes a Captive when you tax a rival city you
  control, because the normal tax is available and better.
- The Railway data directory is set by the Dockerfile.

Also known and accepted: the server stores two full game states per undo
step (fine at four players); there is no way to end or abandon a game if
the host vanishes; "Finish Prelude" costs a click every turn.

---

## 11. Log: changes made and issues found

A running record, newest last, of what was actually done and what turned up
while doing it, including problems that were found and fixed in the same
pass.

### Milestone 1: the Warrior / Feastbringer exploit (C6), done

**What was fixed.** Choosing the "after" bonus and then pressing Back no
longer leaves a free move or influence behind. After choosing "after" you
cannot back out of the paid action; if it has no legal target, the whole
choice is undone and you are back at the action list with your pip intact.

**A second hole, found and fixed.** Offering Court Enforcers' Abduct and
Galactic Rifles on that battle (see below) briefly reopened the same
exploit through their own Back button. Back is now hidden on those prompts
when a Warrior or Feastbringer bonus is in play, so picking one is a
commitment.

**Rule change: special actions on the paid battle.** Previously, taking a
bonus hid Abduct and Galactic Rifles on the pip-paid battle. The rulebook
(New Actions) says a new action is allowed whenever you take the standard
action by spending a pip or a resource, so they are offered again. The free
bonus move or influence still cannot use them. Decided by the owner.

**Decision recorded: competitive integrity over convenience.** Once you
choose a bonus order there is no taking it back, and no dice roll can be
undone on these paths. A misclick on "after", Abduct or Rifles cannot be
reversed.

**Observation.** The random-play test driver did not find this exploit, even
though it presses Back, because it needs a particular leader in a particular
battle. Specific scenarios still need targeted tests.

**Result.** Six new tests; the suite is 309 tests, 308 passing and 1
expected-failure marker (the Tycoon's Charm bug, fixed in a later milestone).

### Milestone 2: turn order and two declarations in a turn (Items 8 and 17), done

**Who opens the next chapter.** When every player with cards passes in a
row, the last pass now still hands the initiative marker on. The first
person who passed opens the next chapter, as the rulebook says. The
end-of-game tie-break counts from the same marker, so it now starts from the
first passer too. Players with no cards are skipped and not waited for.

**Two declarations in one turn.** Your lead card's declaration is now
independent of Populist Demands and Tycoon's Ambition. Declaring through
either card no longer uses up the lead card's declaration, and the lead
declaration no longer blocks them. Each card keeps its own limit: Populist
Demands is discarded after use, Tycoon's Ambition works once per turn, and
the three markers remain the only overall cap. A Feastbringer declaration
through Populist Demands behaves the same way.

**Tycoon's Ambition no longer counts as an action (decided).** It used to
close the lead-card declaration (and Seize) for the rest of the turn. It no
longer does, so you can use it and then declare from your lead card, or the
other way round. The card is a Prelude that says you may use it "just after
declaring Tycoon", which is why. It still has to come before your first
action. The card has no once-per-turn limit printed on it; we keep one as a
harmless guard.

**Issues found.**
- One existing test had been written around the old tie-break behaviour. It
  now expects the first passer to win a tie.
- Declaring from Populist Demands cannot be followed by a lead declaration in
  real play yet: securing it counts as an action, and the lead declaration
  closes after any action until the lenient timing rule (Item 16) is built.
  The fix is in and tested with directly built situations; real-play tests
  come with that later change.

**Result.** Ten new tests; the suite is 319 tests, 318 passing and 1
expected-failure marker (unchanged).

### Milestone 3: resource and slot bugs (Items C8, C1, C2), done

**Elder Broker's trade.** When you pay for the Trade with a resource, that
resource is spent first, so it can no longer be the one you give the rival.
If it was the only thing you could have given, Trade is not offered at all.
Paying with a pip is unchanged.

**Ancient Holdings' special slot.** The four-key slot now stays last. When a
city is built, the slot's contents stay on it instead of sliding onto an
ordinary one-key slot; new board slots appear before it. A resource you gain
with no free slot also lands before it. If the board is over capacity and you
discard the card's resource, a board resource moves onto the card slot
(otherwise the game would keep asking you to discard). Losing the card follows
the rulebook: if it is discarded or buried, its resource returns to the supply;
if it is stolen, the resource goes with it. (No card in the game can
currently take Ancient Holdings away from you, so this is future-proofing.)

**Tycoon's Charm with nothing to trade.** The trade only appears when you hold
Material or Fuel, in any slot (including the Ancient Holdings slot). The
empty form and the timeout bot's rejected submission are gone. The explored
game that found it (seed 44) now passes.

**Issues found.** None that change play. Notes: the Charm's prompt can now be
just "clear Outrage" and "Done" when you have nothing to trade (harmless); a
dead check for Charm in the code was left alone; one test helper had to learn
about the new `cardSlot` field to build Ancient Holdings states. An earlier
draft of this milestone moved a lost Ancient Holdings resource to a board
slot; that contradicted the rulebook and was corrected.

**Decision (settled).** The Charm's trade is offered for Material or Fuel in
any slot, not only board slots as the plan said, because the card text, the
rulebook ("resources held on cards can be spent") and the form all allow the
Ancient Holdings slot.

**Result.** Twelve new tests; the suite is 331 tests, all passing, with no
expected-failure markers left.

### Milestone 4: Populist Demands timing and Sprinter Drives (Items C9, C3), done

**Populist Demands and Noble.** Everything a Populist Demands declaration
triggers (Noble's Connected draw, Demagogue's Bold, Farseers, Generous's Guild
gift) now resolves before the Court refills. Noble takes the card that was on
top of the deck, and the refill is the one after it; Bold can no longer pick
the newly dealt card. If nothing is triggered, the Court refills straight
away as before.

**Sprinter Drives.** The card now gives one group, one extra move. Ships left
at other gates after a Catapult, or left behind from the same group, get no
further move. The bonus move can still Catapult.

**Other Vox cards.** The same rule now applies to every Vox card: anything
the card asks you to do (Mass Uprising's ship placement when you are short of
ships, Song of Freedom's seize choice) is finished before the Court refills.
Nothing went wrong there before, since neither reads the Court; this just
makes "resolve the card, then refill" consistent.

**Issues found.** None that change play.

**Result.** Nine new tests; the suite is 340 tests, all passing.

### Milestone 5: battle decisions and Elder's Ransack (Items 15, 9, 10), done

**Elder and Galactic Rifles.** The Elder's immunity to Ransack now holds when
a rival destroys their city with Galactic Rifles (or any other non-battle
hit), not just in battle. Outrage is still provoked.

**Agitator.** With one Weapon, it is discarded automatically as before. With
two or more, the Agitator's player now chooses which Weapon slot to discard.
Hits are counted before the discard, as the card says ("1 hit per Weapon
icon ... then you discard 1 Weapon resource"). A test pins the rule that
interception is defined by the roll: if the
intercept symbol is rolled, the Agitator deals Weapon hits and discards a
Weapon even with no fresh ship.

**Rerolls.** Confirming a reroll with no dice selected no longer uses up the
ability. A battle with no dice no longer shows an empty "resolve or reroll"
step; it goes straight on to the results (Repair Drones still fires).

**Labels.** Other players now see "Choosing effect order" and "Using
Farseers" instead of a generic message for those steps.

**Issues found.** The automatic-play bot used to pick Reroll with no blank
dice; with the new rule that looped forever, so it now rerolls only when
there is a blank die. Fixed.

**Result.** Eight new tests; the suite is 348 tests, all passing.

### Milestone 6: declaring and seizing later in your turn (Item 16), done

**What changed.** You can now declare your lead card's ambition, or seize
the initiative, after taking actions, as long as nothing new has been
revealed this turn. Building, moving, taxing (even capturing an agent),
spending resources in your Prelude and similar actions leave both open. They
close once dice are rolled, a deck is shuffled, a card is drawn (a Court
refill after securing, Noble's draw, Call to Action, Farseers), a rival's
hand is seen, or another player responds (Predictive Sensors, Railgun
Arrays, a defender's repair or influence). When they close, the panel says
why, for example "Dice were rolled or a deck was shuffled; declaring is
closed for this turn." A late declaration still makes your lead card 0, and
a late seize still costs an extra card played face down.

**Cards with stricter printed timing keep it.** Upstart, Tycoon's Ambition,
Galactic Bards and Lattice Spies all say "before any actions", so they still
close at your first action, whatever has been revealed. The plan named
only Upstart and Tycoon's Ambition; Bards and Lattice Spies have the same
wording, so we treated them the same way.

**Backing out of a Union or a Lore ability no longer counts as an action.**
Choosing a Union and then Skip used to close declaring and seizing (and
Upstart, Tycoon's Ambition and Lattice Spies). The same happened when you
opened a Lore card's Prelude ability (Empath's Vision, Keeper's Trust,
Warlord's Cruelty, Warlord's Terror, Tyrant's Ego, Tycoon's Charm), for
example just to read it, and pressed Done. Now only placing the Union, or
actually using the Lore ability (clearing Outrage, spending a Trophy or a
Captive, trading), counts.

**The automatic player never declares after something is revealed.**

**Decided by the owner.**
- *A declaration's own reveal does not close the other choice.* The
  rulebook lets you declare and seize in either order before your Prelude
  actions. Declaring with Noble or Farseers reveals a card or a hand, but
  you can still seize (or, after Tycoon's Ambition, still make your lead
  declaration) until you take an action. Reading the plan word for word
  would have taken that away; we kept what the printed rule allows.
- *Galactic Bards and Lattice Spies keep their printed timing*, like
  Upstart and Tycoon's Ambition.
- *Any other player's decision closes the window*, even one that is not
  part of a battle (for example a rival choosing which resource to discard
  after you Annex their city). This is the stricter choice, for
  competitive integrity.
- *Railgun Arrays counts as a reveal*, as the plan said, though its hit is
  predictable. It only matters in a battle with no dice. No preference.

**Issues found.**
- The Lore ability problem above was found during this milestone and
  fixed at the owner's request.
- Securing Populist Demands and then declaring your lead card is still
  usually impossible, because the Court refill after the secure reveals a
  card. That is the rule working as intended; it is possible only when the
  Court deck is empty.
- Games that are mid-turn when this goes live keep the old timing for the
  rest of that turn, so nobody can declare after a roll that happened
  before the update.

**How we checked.** Besides thirty new tests, every simulated game now
checks after every move that anything the undo history treats as new
information also closes declaring and seizing. We confirmed that check
catches each missing piece by removing them one at a time. We also checked
the buttons and messages in the browser.

**Result.** Thirty new tests; the suite is 378 tests, all passing.

### Milestone 7: split action discard piles, engine half (Item 3), done

**What changed.** The game now uses the rulebook's split discard piles
(Solution A in section 2). Cards played face up (lead, surpass, pivot) go to
a face-up pile, remembered by round. Cards played face down (copies, seize
cards), the leftover cards dealt at the start of each chapter, and the cards
you throw away to Farseers go to a face-down pile. Every draw from the
discard (the two-player mulligan, Farseers, Call to Action) takes the bottom
of the face-down pile. If that pile does not have enough cards, both piles
are shuffled together first; the log then says how many face-up cards went
in, and nothing else. Each new chapter starts both piles again. The panel
that shows the face-up pile is the next milestone; the game already sends
it, plus a count of the face-down pile, and never the face-down cards
themselves.

**Decided in this milestone (confirmed by the owner).**
- *Farseers counts your own discards before checking whether the pile is
  short.* At a table you discard first and then draw, and the publisher's
  Farseers FAQ (shuffle the cards you discard "before placing them on the
  discard pile") assumes the same. So Farseers only shuffles the piles
  together when the face-down pile was already empty. Digging deeper than
  the face-down pile gives you back some of your own discards at random,
  never a face-up card.
- *The two-player mulligan works as before:* draw six from the bottom,
  then shuffle the old hand into the rest. This matches the setup steps in
  the rulebook. The face-up pile is always empty at that point.

**Issues found.**
- The example we planned to test the shuffle-together case with (three
  players, two leftovers, no copies, Farseers draws three) does not trigger
  it under the rule above. Instead it shows the fix working: you get the two
  leftovers and one of your own discards, where the old game gave you the
  first round's lead card. The shuffle-together case has its own tests.
- Games already in progress when this goes live keep their old single pile
  as the face-down pile until the chapter ends, so the old Farseers trick
  still works in them until then. This clears up on its own at the next
  chapter, and we play one game at a time, started after an update, so it
  does not arise. (Their first move after the update also could not be
  undone; fixed.)
- None of our ninety simulated games ever ran the face-down pile short, so
  that case is covered by dedicated tests only.

**How we checked.** Eleven new tests: where each kind of play goes, the
leftovers and the chapter reset, Farseers, the shuffle-together case for
Farseers and Call to Action, the mulligan, what each player's screen
receives, that the log never names a face-down card, that undo still stops
at a face-down draw, and that a game saved before the change still loads,
plays and can undo. They fail without the change.

**Result.** Eleven new tests; the suite is 389 tests, all passing.

### M8: action discard panel on screen

**What changed.** Players can now open an "Action discard" window from the
Court area. It shows how many cards are in the face-down pile (the number
only, never which cards) and lists the face-up cards by round, with who
played each and how (led, surpassed, pivoted).

**Merges.** The merge log line now also carries the face-up cards it
shuffled in, and the window shows them under "Last merge" (by round, with
who played each and how). They were face up, so nothing hidden is revealed.
After the shuffle those cards can't be told apart from the rest, and the
window says so. A merge older than the last 150 log entries stops being
shown.

**How we checked.** Three new tests (grouping, last-merge lookup, and the engine's merge entry), plus a browser
run on injected states: the list and count match; a face-down draw lowers
the count and leaves the face-up list unchanged; a merge empties the
list; no face-down card appears; the window opens and closes like the Court
discard one. No problems found in the M7 data.

**Also added at your request.**
- The log is no longer cut to the last 150 lines: every player's screen
  now gets the whole game log. (Screens carry a little more data late in a
  game; fine for a private group.)
- "Table history" now groups the log by chapter, round and whose turn it
  was, so you can see everything done in public turn by turn. Older saved
  games show their existing lines under "Earlier events".
- The Action discard window shows the total in the discard (face-up plus
  face-down) and a draw log: who drew how many cards from it and why
  (mulligan, Farseers, Call to Action), counts only. Call to Action's draw
  had no log line before; it does now.
- Table history opens at the newest turn.

**Result.** Six new tests; the suite is 397 tests, all passing.

### M9: small fixes and clearer text

**What changed.**
- Tyrant and Warlord now explain what Captives and Trophies are and when
  they go back to their owners. The mats have hover text saying the same.
- The "System details" window no longer drops to the generic rules page
  whenever the game updates.
- Catapult and Sprinter fleet selection now says "select ships, then
  confirm" instead of telling you to click a destination.
- Joining a table with a name already taken is refused.
- **Back buttons** on the ship-selection steps (move, Catapult, Sprinter
  Drives, including free moves) and on the destination step of a move's
  first hop (later hops have already moved ships, so they have none), re-roll selection, Prison Wardens,
  Guide ships (L16), Tycoon's trade (L28) and Relic Fence. Back changes
  nothing: nothing has been paid or spent at that point.
- The card library search now also finds FAQ and errata text. Cards with
  clarifications carry an "FAQ" badge, and card names mentioned in an FAQ
  open that card when you tap them.

**No Back on purpose.** Battle dice (the battle is already declared; you
can choose zero), Predictive Sensors (zero is allowed), Farseers (the card
is already discarded), and Galactic Rifles' re-roll (the dice are rolled).

**Problems found (fixed).** Back had to remember the exact earlier choice,
including a Warrior/Feastbringer bonus "must finish" flag, or it would have
let you keep the free bonus and skip the paid action. Tycoon's trade marks
the turn as having acted before its form opens; Back undoes that.

**Result.** 407 tests, all passing.


### M10: library close, setup preview, draft order strip

**What changed.**
- Closing a card you opened from the library (or the Court discard, the
  Action discard or the Players list) now takes you back to that list, with
  your tab, search and scroll position as you left them. A second close
  closes the list. Cards opened from the board still close to the board.
- Cards linked from another card's text now close back to the card you came
  from.
- The create-table form shows the setup card art. On "Random official setup"
  you see the four possible cards for your player count and can tap one to
  choose it; once chosen, you see it on its own.
- The Leaders & Lore draft shows a strip of pick chips in the real pick
  order, one per pick for every round of picking: who has picked and what
  they took, whose turn it is now, who is still waiting, and who holds
  initiative (picks last each round). The chip for an Archivist leader
  says they choose Lore privately after the draft.

**Rules check.** The rulebook (p.21) says picks start with the player to the
right of the initiative holder and go counterclockwise. The strip uses
exactly that order, and the draft tests check it against the game's own
turn at every pick.

**Choices you might want to revisit.** A linked card closes back one card at
a time (several closes if you followed several links). Escape no longer
closes everything at once; it peels one layer.

**Problems found.** The Archivist's private Lore choice happens after the
draft, so the strip only carries a note, not a hidden pick. Restoring the
library's scroll was undone by the dialog re-focusing its first control; fixed.
Two older problems fixed too: a React "unique key" console warning from the
shared board (the explore-mode preview markers had no id) and one script
file's formatting.

**Result.** 412 tests, all passing.

### M11: turn alerts, timer pop-ups and confirm steps

**What changed.**
- **Confirm steps.** Four one-click moves now stop for a small "Review &
  confirm" box in the command panel, like End turn: Pass initiative, any
  face-up card play (Lead, Pivot, Surpass), securing a Court card, and
  starting a battle (by clicking a system or from the list). Nothing is sent
  until you press Confirm. Cancel, Escape, or doing something else leaves the
  game and its Undo history exactly as they were. Confirming sends one move.
  Each box says what the move will do: Pass explains where the initiative
  goes and that it cannot be undone; a face-up play says everyone will see the
  card; Secure says whether a Vox effect runs first and that the Court
  refills; Battle says you pick dice next, that a roll cannot be undone, and
  whether the defender has Predictive Sensors or Railgun Arrays.
- **Timer pop-ups.** Every player now sees a pop-up when the host pauses,
  resumes, adds time or changes the timer, and when the AI takes over a turn.
  Pop-ups last nine seconds (three at most) and can be dismissed. If you were
  away or reconnect, you see only what you missed. "Timer activity" in the
  Turn timers window still keeps the history.
- **Tab title.** If the tab is in the background, its title flashes "Your
  turn" when it becomes your decision, and flashes the notice when a clock
  change or AI takeover is about you. It stops when you come back.
- **Chime.** The your-turn chime is now on by default. Settings has a button
  to mute it; your choice is remembered.
- Timer messages now read "1 minute" and "24 hours" instead of "1 minutes"
  and "1440 minutes".

**Choices you might want to revisit.**
- Copying the lead (played face down) has no confirm, since undoing it shows
  nobody anything. Placing an agent and Bold on the Court are not confirmed
  either (Undo covers them); Ransack is, since it takes the card and refills
  the Court just as Secure does.
- The chime and flash only happen for a change you watch happen. Opening or
  reloading the table on your own turn is silent.
- End turn's own review box still ignores Escape; the new ones obey it.

**Problems found.** The expanded map sits over the command panel, so a
confirm opened from it would have been invisible; opening a confirm now shrinks
the map. Browsers will not play the chime in a tab you have never clicked in;
the title flash still works there. Three older browser test scripts failed or
flaked on a clean checkout too; their stale steps are fixed, and two others
needed small updates for the new confirms (details in BUILD-PLAN.md
section 11).

**Laptop layout (added after review).** On laptop-sized windows the map was
only about 184 px tall however big the window, and on a 1280x700 window your
hand was below the fold. The hand now sits beside your player board instead of
under it, the "cards on the table" strip is shorter, and the player board
defaults to a wider share of the screen. The map is about 30 px taller on a
12-inch window (212 px, with the whole hand visible), 289 px on a 1440x790
window and 373 px on a 1512x880 window. Phones and big monitors are unchanged.
The Court still scrolls inside its box on the smallest windows. It is one
stylesheet (`src/laptop-fit.css`) and can be switched off by removing its
import. I could only test in Chrome, not Safari.

**Result.** 422 tests, all passing.

### M12: battle dice in the log and a battle record per chapter

**What changed.**
- **The roll is in the log.** The line "A rolls 3 dice against B" now ends with
  what came up, for example "assault intercept+hit; raid building+key,
  self+key". Dice are public, so everyone sees the same thing the roller sees.
- **Rerolls are in the log.** Each reroll says who did it, which ability
  allowed it, and each die's old and new face. Galactic Rifles now logs the
  dice it rolls (and any Empath's Vision reroll); before, it wrote nothing
  about the dice at all.
- **A raid that steals nothing says why.** When a raid ends by itself with
  nothing taken, the log says which of these it was: no attacking ship was
  left, no keys were left, nothing the defender holds costs that few keys, or
  the defender has nothing that can be stolen (including everything being
  protected).
- **Battle record for the whole game.** "Review latest battle dice" in the
  Table history now lists every battle, newest first, grouped by chapter. The
  current chapter is open and earlier chapters fold away. Each entry shows who
  fought whom, the round, the sector, whether it was Galactic Rifles, which
  abilities rerolled, and the final dice. It closes with Escape, the X or a
  click outside, like the other dialogs.

**Costs.** One longer line per roll (not an extra line), one line per reroll,
one for Rifles, and one when a raid comes to nothing. The log is uncapped, so
these add up a little for every player.

**Things to know.** If you press "Finish raid" yourself without taking
anything, that is logged too ("A ends the raid on B without stealing"). Games saved before this change show only their last battle in the
record until the next roll.

**Result.** 431 tests, all passing.

### M13: time bank

**What changed.**
- **Three timer settings instead of one.** The host can now set any mix of a
  turn limit (today's setting), a time bank that lasts each player the whole
  game, and an increment added to your bank each time your card turn starts.
  When both a turn limit and a bank are on, whichever runs out first applies.
- **Responses are cheap.** The first 10 seconds of each response you make in
  someone else's turn don't touch your bank, so nobody can drain your bank by
  making you answer lots of small prompts.
- **Draft picks never use the bank.** The leader and lore draft runs on the
  turn limit or, if there is none, 2 minutes per pick on a live table and
  24 hours on an asynchronous one.
- **When the bank runs out.** With an increment, you get just the increment
  each turn. Without one, the usual "when time runs out" setting takes over
  for each of your decisions: AI plays them, play stops until the host adds
  time, or you go into overtime with a negative bank. Everyone gets one
  pop-up when a player's bank is empty.
- **Host's "Add time"** goes to whichever limits are on, turn and bank
  alike. In the draft it only adds to the pick clock.
- **On screen.** The timer button shows which limit is counting ("turn 3:12"
  or "bank 24:50"). The Turn timers window shows each player's bank left with
  a bar, how much has been charged to it, and a brief "+0:30" when an
  increment or extra time arrives. The host form has a checkbox and value for
  each setting and a one-line summary ("5 min per turn, 40 min bank, +30 s").
- **Existing tables are unchanged.** A table saved with the old single
  setting behaves exactly as before; we checked this against the old code on
  thousands of random timelines.

**Choices made (agreed after review).** Changing the timer settings mid-game
keeps the time each player has already used, including time used before a
bank was turned on, so turning on a 40-minute bank in chapter 2 starts it
part-used; the pop-up says so. Increments already earned are kept. An
increment without a bank is not allowed. No pop-up for each increment.

**Also fixed.** A rejected timer setting used to show its error twice, in
the timer window and beside the table's controls; it now shows once, in the
timer window. Long times read like a clock ("23:59:59" rather than
"23h 59:59"). The host's settings form now shows the current settings if
they change while it is open. During a response's free 10 seconds the timer
button shows your bank as it is, with the free time counting down under it.

**Result.** 441 tests, all passing.

### M14: battle, turn and scoring tests, and a check on every Back button

**What changed.** Mostly tests; one small game fix (Relic Fence, below).
- **Battle.** New tests check, against the rulebook: hits go to buildings
  only once the defender's ships are gone; building hits skip ships; a raid
  only offers what its keys can pay for and stops when nothing else is
  affordable; rolling several intercepts still means one intercept; ships
  you lose to your own dice or an intercept become the defender's Trophies;
  a raid stops if none of your ships survive; raid dice need a defending
  building in the system, or none of the defender's anywhere; damaged ships
  still roll; and a player with a starport or no ships left in supply is not
  rebuilt at a gate.
- **Turns and scoring.** A 7 lets you declare any ambition and a 1 none; a 7
  Surpass seizes the initiative, but not after someone else seized that
  round; without a Surpass the initiative stays put; a player who runs out
  of cards is skipped; bonus city Power counts once per ambition, however
  many markers it has; the game ends early at 27, 30 or 33 Power; the
  ambition markers flip after chapters 1, 2 and 3; the Cartels and the
  Fuel-Drinker's Lavish discard after scoring; Outraged resources cannot be
  spent without the matching Loyal guild; the two-player "third player"
  scores and ties as the rulebook says; a city coming back from Trophies
  can force a discard; and the Catapult rules (own starports only, control
  checked before you enter, stop at a planet).
- **Existing tests made stricter.** The Elder, Warrior and Archivist scoring
  penalties now check ties and second place; taxing with an empty supply
  still captures; copy, pivot and surpass check suit, actions and face; and
  the end-of-game tie-break now tells "who holds the marker" apart from
  "first clockwise from the holder".
- **Every Back button.** After the Warrior/Feastbringer bug (M1), we now
  check that pressing Back always puts the table back exactly as it was,
  with nothing paid and nothing left waiting. This covers every special
  action (paid with a card's action or with a resource), the leader bonus
  prompts, moves and Catapults, rerolls, Tycoon's Charm and all six Vox
  cards, plus a random player that presses Back wherever it can in
  thousands of moves. To be sure the check works, we briefly put the old
  Warrior bug back: the random player found it straight away.

**Found and fixed.** Pressing Back after opening Relic Fence gave nothing
away and cost nothing, but the game still counted it as an action, so
abilities that must come "before any actions" (Lattice Spies, Tycoon's
Ambition, Galactic Bards, the Upstart's declaration) disappeared for that
turn. Now only actually using Relic Fence counts as an action.

**Also found.** Five older tests build a Vox card in a way that loses track
of the card for a moment. They pass, but would fail a stricter check we plan
to switch on in M16, so M16 will fix them first.

**Result.** 511 tests, all passing.

### M15: leader and lore card tests

Nothing in the game changed; this adds 24 tests for the leader and lore
cards, each checked against the card text, the rulebook, the FAQ and the
printed cards, not against what the game does today.

- **Leader setup.** Every leader's starting resources and the ships and
  buildings in boxes A, B and C are now checked, both that the game places
  them correctly and that the table of values matches what is printed on all
  16 cards (it does).
- **Leader abilities.** Demagogue's Bold and Paranoid (including Ransack),
  Noble's second influence, Shaper's Catapult rules, Rebel's two-ship limit,
  and Anarchist's tax on Rival cities. Warrior and Feastbringer: choosing "just
  battle" or "just secure" really takes no bonus, and Court Enforcers' Abduct
  works with the Warrior's move before or after, for one action.
- **Lore cards.** Hidden Harbors, Gate Ports and Gate Stations (including
  one building per gate and Outrage for every type in the cluster), Empath's
  Bond, Signal Breaker, Ancient Holdings, Survival Overrides and Tycoon's
  Charm's Outrage clear.
- **A test setup that could not happen in a real game** (Demagogue's
  "Guild needs two agents") now builds its table by real play.

**Found.** No disagreement between the game and the rules or cards. Two
things worth knowing: Empath's Bond still takes a Captive when you already
control the taxed city (kept on purpose, see the earlier review of claims),
and the leader setup values exist only as pictures on the cards, so the new
test is the only guard against a typo in them.

**Also checked.** Turning on the stricter check after every move would still
fail exactly eleven older tests, all of which M16 rebuilds first.

**Result.** 535 tests, all passing.

### M16: Guild, Vox, errata, FAQ and reconnect tests

This adds 62 tests and two small interface fixes (below), each checked against the card
text, the rulebook, the FAQ and the errata, not against what the game does
today.

- **The check after every move now covers every game test.** The last eleven
  older tests that built tables a real game cannot reach were rebuilt (the
  Farseers short pile, Guild Struggle, the four "resolve and discard" Vox cards
  and five Vox tests whose card was missing from the player's hand). From now
  on any test that leaves a card, piece or marker in two places, or nowhere,
  fails at the move that did it.
- **Vox cards.** Mass Uprising, Populist Demands, Outrage Spreads, Song of
  Freedom (including returning a Rival's city and the Rival choosing what to
  discard if their slots shrink), Guild Struggle (steal, Sworn Guardians, the
  Guild discards shuffled back even if you decline) and Call to Action each
  have their own test.
- **Guild cards.** The five Loyal guilds are kept on Outrage and let other
  resources be spent as their own; the Cartels make Rivals discard after scoring
  even if Tycoon was not scored, and their supply cannot be stolen or fenced;
  Lattice Spies really seizes and only before an action; Silver-Tongues steals
  a resource; Galactic Bards declare on Surpass or Pivot without the zero marker,
  any ambition on a 7, either order with seizing, once per round.
- **Errata and FAQ.** Upstart cannot tax a city it does not control even with
  Empath's Bond; Agitator reacts to Mirror Plating's intercept; Force Beams
  captures nothing at Gate Ports and cannot Catapult; a placed Union cannot be
  stolen; Noble's Connected and Populist Demands; Overseer's Ruthless (Outrage
  first, free repeat, once per turn); Cloud Cities (Outraged payment, one per
  planet); Keeper's Trust with the thief's Cartel; Raider Exosuits; Predictive
  Sensors; Tycoon's Ambition with nothing to discard; the Warrior's move as a
  Catapult; Corsair's single reroll.
- **Reconnecting.** A new server test plays until a player has a prompt open,
  drops their connection, shows that the table does not change and nobody can
  act for them, and that when they return they see the same revision and the
  same prompt. It also has the host add time to their clock while they are
  away, and checks that an unauthenticated connection is closed within about
  five seconds.

**Found.** No disagreement between the game and the rules, cards or FAQ. Three
things for you to know, none changed:

- Galactic Bards say "if an ambition has not been declared yet this round".
  The game takes that as "nobody has declared this round", so a lead's
  declaration (or Populist Demands, or Tycoon's Ambition) stops them. The
  other reading, "that ambition is not declared yet", is possible and the
  card and FAQ do not decide it.
- Guild Struggle shuffles the whole Court deck, so a Sworn Guardians stolen
  with it ("bury it") ends up anywhere in the deck instead of the bottom.

**Interface fixes, at your request.** Lattice Spies used to show up twice in
the list of choices while the initiative could be seized; it now shows once
(under "Before actions", or as a plain Prelude discard when it cannot seize).
The hint when leading a card was reworded to say you can declare after an
action too, until the turn reveals something new. Checked in Chrome
afterwards: that paragraph is hidden by the table layout and the guided
"Lead the round" prompt shows in its place, so the new wording is not
visible yet. Either the guided prompt gets the sentence or the paragraph
goes; open for your call.

**Checks run afterwards.** All ten browser scripts pass in Chrome, Lattice
Spies shows once in each case on the real page, and nineteen more deliberate
engine breakages each failed the matching new test.

**Result.** 597 tests, all passing.

### M17: a cleanup, fresh test states and a look at every screen

This milestone changes no rules. It removes code the game no longer used,
rebuilds the saved game states the browser checks run on, and then renders
every one of those states at four window sizes to look for anything broken
on screen.

- **Cleanup.** About 800 lines went: engine branches nothing could reach,
  styles for screens that no longer exist, unused imports and props on the
  client, an unused field in the server's clock view, an unwired script and
  two unused map images. Nothing you see or play changed.
- **Fresh saved states.** The browser checks render saved engine states. The
  old set predated the split discard piles and the time bank, so the engine
  and server carried code to read those old shapes. A new script
  (`npm run fixtures:ux`) rebuilds the set from the current engine, 48 states
  covering every kind of decision, and the old-shape code is gone. A game
  saved before a change is not expected to load after it; games start fresh
  after each deploy.
- **The screen sweep.** `npm run test:ux-sweep` opens every saved state on a
  14" MacBook window, a 13" one, a small 1280x720 window and a phone, from the
  acting seat and a waiting seat, then opens every dialog and panel on top. It
  checks for sideways overflow, page scrolling on a computer, console errors,
  missing art, clipped text, controls off the window or on top of each other,
  and whether the acting player can see their command panel; it saves a
  screenshot of each render for review.

**Fixed.**

- Decision tiles (choose a resource, Cloud Cities, gain a resource, the draft)
  showed a cropped sliver of card art, or the token pushed to the far right of
  the tile. An old style rule for a different list was restyling them.
- Card text in the command panel could show raw markup, for example
  ``per `symbol:hit` `` on Galactic Rifles. It shows the symbol now.
- "Your hand is empty. New cards arrive next chapter." wrapped one word per
  line on laptop windows.
- Setup cards in the card library were cropped to a portrait slice; they are
  landscape cards and now show whole.
- The Ambitions dialog's names did not line up because the glyphs differ in
  width.
- On a phone the "Choosing…" placeholder ran over the next seat's name, and
  the smallest buttons were hard to tap; every control the sweep flagged has
  a larger hit area now.
- On a 14" MacBook a long Prelude panel used to take the lower half of the
  screen and shrink the map to about 300px. The action area now stops at
  46% of the window, leaving the map about 370px; a longer panel scrolls, and
  the divider can still be dragged.

**Also done.** The archived review notes under `old-notes/`, superseded by
this document and the build plan, were removed.

**Looked at and left.** The Court's second row is cut by the dock and scrolls
inside the Court, as designed. The expanded board on a phone has empty space
above and below the map.

**Result.** 593 tests, all passing; every browser check and every sweep
render passes.
