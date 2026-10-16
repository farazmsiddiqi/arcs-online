# Arcs Online

An unofficial browser implementation of **Arcs base game and Leaders & Lore**, for 2–4 players. A server-authoritative rules engine powers a shared map, physical-style player boards, guided turns, card inspection, battle explanations, undo/redo within supported decision windows, and configurable turn clocks with automatic legal play on timeout.

The repository includes the card images, board and piece artwork, fonts, and card/FAQ/errata reference data used by the game. **No separate asset download, import, API key, or existing installation is needed.** The implementation is MIT licensed; publisher artwork, card text, and trademarks retain their owners' rights and are not covered by MIT. See [third-party notices](THIRD_PARTY_NOTICES.md).

This is an independent, unofficial implementation. The official rules remain the authority. The Blighted Reach campaign is outside scope.

## Quick start

Requires **Node.js 24** and npm. No external AI service or API key is required.

```sh
npm ci
npm run build
npm start
```

Open `http://localhost:3001`. Saved games are written to `var/` by default. For development, run `PORT=4317 npm start` and `npm run dev` in separate terminals; Vite serves `http://localhost:5173` and proxies the game API to port 4317.

Create a table, share its invitation link, and join from separate browsers. Seat credentials are stored in the joining browser. Keep invitation links and browser storage private. Practice opponents and timeout resolution use a local heuristic policy; they are not expert players.

## Updating an existing checkout

```sh
git pull
npm ci
npm run build
npm start
```

Stop the previous local server before restarting. Existing saved tables and turn timers are upgraded automatically. Before the first upgrade, the server keeps a SQLite snapshot at `DATA_DIR/backups/before-save-v1.sqlite` (locally, `var/backups/before-save-v1.sqlite`). Keep that backup private. Cards, artwork, and reference data are bundled and work locally without contacting a publisher server. Your own games are saved locally; private games and credentials from other installations are never included in this repository.

`npm run verify:assets` checks every bundled asset against its recorded checksum and confirms all 115 card images are present. This check also runs before tests, builds, and the development server.

For a plain-language overview of the October 2026 review and the eighteen milestones built from it, see [CHANGES.md](CHANGES.md).

## Validation

```sh
npm run check                  # Rules/server tests and production build
npm run test:simulation        # Additional legal-play simulations
npm run test:timeout-simulations
```

Browser checks require a running local server and Playwright Chromium:

```sh
npx playwright install chromium
npm run test:browser
npm run test:player-table
npm run test:shared-board
```

The other browser checks (`test:ux`, `test:ux-states`, `test:ux-flows`, `test:controls`, `test:learning`, `test:resources`, `test:tools`) run the same way; set `PW_CHANNEL=chrome` to use an installed Chrome instead of Playwright's Chromium. The saved engine states they render come from `tests/fixtures/ux-states.json.gz`, regenerated from the current engine with `npm run fixtures:ux`.

`npm run test:ux-sweep` is the UI regression check: it renders every saved state at four window sizes (14" and 13" laptops, a 1280x720 window, a phone), from the acting and a waiting seat, and with each dialog open, screenshots each render to `work/ux-sweep/`, and fails on overflow, page scroll on a computer, console errors, broken artwork, clipped text, controls off the window or overlapping, or a command panel the actor cannot see. `STATES=card,dice SIZES=desktop` narrows a run; `LAYERS=0 SHOTS=0` skips dialogs and screenshots.

`TEST_URL` defaults to the local development server. Run browser checks only against disposable test instances: some create tables or take actions. Screenshots and generated reports belong in ignored `work/`. Automated coverage is substantial but does not prove every possible card interaction correct.

## Hosting

The Dockerfile builds and tests on Node 24. Configure `PORT` (default `3001`) and a persistent `DATA_DIR` (the Docker default is `/data`). Health check: `/api/health`. On Railway, deploy from this repository or Dockerfile and attach a volume at `/data`.

Keep **one replica**: SQLite storage and the live WebSocket registry run in one process. Back up the persistent volume securely. Never publish saved-game databases, seat credentials, journals, environment files, or hosting configuration containing account identifiers.

## Project layout

- `game/`: rules, map and card metadata, legal decisions, scoring, practice policy.
- `server/`: room API, WebSockets, SQLite persistence, turn history and clocks.
- `src/`: React interface, map controls, player boards and guided decisions.
- `tests/`: rule regressions, synthetic game states, simulations and server tests.
- `scripts/`: asset verification, browser checks and simulations.

## Credits and rules

Arcs was designed by Cole Wehrle and illustrated by Kyle Ferrin. Arcs names and publisher materials belong to their respective owners. This is an unofficial fan implementation, not an endorsed release.

- [Official base rulebook](https://buriedgiant.com/arcs/Arcs_Base_Rulebook.pdf)
- [Official player aid](https://buriedgiant.com/arcs/Arcs_Aid_Booklet.pdf)
- [Publisher card library](https://cards.buriedgiant.com/)
- [Searchable official rules](https://rules.buriedgiant.com/?product=arcs&locale=en-US&printing=p1)
- [HRF reference implementation](https://github.com/haunt-roll-fail/haunt-roll-fail), used to cross-check rules, map, setup and dice; its MIT notice is preserved in `docs/HRF-LICENSE.txt`.

Fraunces and Source Sans 3 fonts are bundled under the SIL Open Font License, with their license files in `public/assets/fonts/`.
