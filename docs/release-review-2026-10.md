# October 2026 release review

Reviewed PR #1, original head `d50030d71d5246406a7ba1919714f566a233e079`, against `efcda4fbd71b6333ba5a5e8e0f8b59ec09cc28be`.

## Findings and corrections

1. **Existing saves failed to load.** The new engine requires split discard arrays and battle history, but the server was still loading old JSON directly. Added a versioned loader for current state, undo/redo snapshots and pending rollback states. Existing discard order stays private and unchanged. No hands, pieces, score, RNG state or seat credentials are reset. Legacy unpaid bonus prompts are upgraded to the corrected flow.
2. **Existing turn limits silently disappeared.** Old clocks store `seconds`; the new clock reads `turn`. Added a migration that preserves elapsed time, bonuses, pause state and expiry behavior, plus support for legacy client settings requests.
3. **Elder received an unsupported rules advantage.** The PR removed the Battle condition from Elder's Ransack protection. Restored it: the printed card says "when they battle you", and the Galactic Rifles FAQ excludes abilities that modify Battle. Tests now cover both actual Battle and Rifles damage. This was a leader-specific advantage, not an account-specific one; intent cannot be inferred from the code.

A consistent private SQLite backup is created before an old database is upgraded. Startup fails if that backup cannot be created. Completed backups are retained across restarts.

## Security and fairness review

- Reviewed production engine, server, clock, history, timeout policy and client changes, plus dependency, build and test changes.
- No new external telemetry/exfiltration endpoints, privileged player-name checks, hardcoded access credentials, authentication bypass or changed dependency versions were found.
- Server-derived seat identity, revision checks, host-only timer controls and per-seat hand/decision filtering remain in place.
- Added independent tests that permute player names (including the contributor and repository owner) through complete Base and Leaders & Lore games. Strategic state, legal choices and timeout inputs remain identical.
- Added independent checks that rivals cannot see another hand, copied card, hidden discard contents, Court draw order, RNG state or pending decision stack.
- Gitleaks found no secrets in the contributed commit or the staged release corrections.

This is evidence from review and tests, not a proof that every possible vulnerability or rule interaction has been excluded.

## Validation

- `npm run check`: 605 passing tests and production build.
- 36 games produced with the previous engine were migrated mid-game and played to completion (20,931 subsequent decisions).
- All 40 prior saved decision fixtures loaded successfully for every seat after migration.
- Real browser multiplayer checks passed for Base and Leaders & Lore (30 UI transitions each); the guided UX flow suite also passed.
- HTTP regression coverage includes restoring a legacy table, keeping hands private, preserving its turn clock, persisting the upgraded state and verifying the pre-upgrade database backup.

## Intentional gameplay variation

The PR uses the official split-discard tournament variant for all players. Face-up discards are public; face-down cards remain hidden. It also follows the rulebook's lenient declare/seize timing until information is revealed. These changes apply uniformly; they are not player-specific advantages.

Sources: [official rulebook, Fine Print](https://buriedgiant.com/arcs/Arcs_Base_Rulebook.pdf#page=22), Elder and Galactic Rifles records in `data/cards.json`, and the Galactic Rifles entry in the bundled publisher `data/faq.json`.
