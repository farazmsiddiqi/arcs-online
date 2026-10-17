# Shared action feedback

Every connected seat animates changes from its authenticated game view. No extra
animation socket or raw command stream is exposed. Hand identities and decision
options are never used as animation data.

- Move: ships fly between systems along a local arc. Independent flights survive
  subsequent updates, and the destination fleet becomes visible on arrival.
- Build: the new ship/building materializes at its system/building slot.
- Repair: a green restoration pulse marks the repaired piece.
- Tax: a resource rises at the taxed system; resource gains/spending highlight the
  supply and player area and show signed token counts in the activity strip.
- Battle: a system pulse accompanies dice updates; existing hit, destruction and
  raid effects remain, with overlapping effects retained until their own expiry.
- Influence/Secure: the affected Court slot and changed player area animate.
- Play/Copy/Seize: the played-card row and affected seat animate. Face-down card
  identities remain hidden.
- Draft, owned cards, trophies, captives, Outrage, hand counts and resource
  arrangements: the affected player's visible play area/seat highlights.
- Ambition, Power and chapter changes: the shared-board track highlights.
- Other abilities: public action-log text appears in a compact activity strip;
  map and player changes also receive their corresponding effects. Removed pieces
  are labelled Removed, not falsely described as destroyed.

The activity strip opens full history. Controls remain available during all
animations. Effects expire independently, with a bounded cap for rapid catch-up.
Initial connections do not replay historical actions. Undo/redo broadcasts carry
an explicit history marker and do not produce misleading new-action effects.
Reduced-motion preferences replace movement with the updated fleet and static
highlights; the action text remains readable.

Supply tokens open a field guide with the physical resource artwork, Prelude
use, action explanation, ambition contribution, slot/raid/Outrage help, and a
publisher rules link. Information is based on the bundled publisher resource and
action rules; card and Leader exceptions remain governed by the game engine.

Validation: action-diff tests cover map changes, Court, resources, captured pieces,
scoring, private hand redaction, duplicate/rollback snapshots, and 960 legal
transitions with identical animation cues across two seats. Also run the full
suite and 200 seeded games before release; inspect actual remote-seat updates in
a disposable two-player room.
