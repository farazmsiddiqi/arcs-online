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

## Independent timer controls

Open **Turn timers** as the host at any stage, including during a battle, draft, expired turn, or after the game ends. **Start timer** uses the previous settings (or a five-minute turn timer initially). **Restart timers** refills all time banks and the current turn allowance; **Remove timer** immediately continues untimed. Neither operation changes the board, hands, current decision, or undo history. A timer configured without an active decision waits for one. **Pause table** still explicitly pauses both play and clocks.

Timer controls have their own revision, so game activity cannot make a timer request stale or clear a player's selection. Adding a bank starts it full rather than charging earlier untimed play. Editing an existing bank keeps its usage; Restart explicitly refills it. Timer configuration and elapsed time persist in the same saved room across redeploys. AI timeout completion is unchanged.

## Table chat and @arcy

Open **Chat @arcy** in a table to talk with the other players. Mention `@arcy` anywhere in a message to ask the referee, for example: `@arcy Why is the lead 0, and what can I do now?` Everyone sees the answer and its supporting rule excerpts. Type `@` to pick Arcy, another player, or references such as `@draft`, `@board`, `@lead`, `@turn`, `@ambitions`, `@court`, and `@battle`; arrow keys navigate and Enter/Tab insert. Include `@arcy` when you want the referee to answer. Open a reply thread to keep follow-ups together; Arcy follows replies in its threads without another mention. It sees the actual public Leader and Lore draft options. Arcy explains rules and legality but refuses move recommendations, rankings, tactical hints, and strategy. The panel can be resized from its left edge; Enter sends and Shift+Enter adds a line.

Player chat works without an API key. To enable the optional GPT referee, set `OPENAI_API_KEY` **on the server only**. On Railway, add it to the service's production variables. For local use, copy `.env.example` to `.env`, add the key there, and run `node --env-file=.env server/index.js`. Never put secrets in a `VITE_` variable, client code, or a commit.

Arcy uses the OpenAI Responses API with `gpt-6-astra` by default (`ARCY_MODEL` overrides it). It retrieves publisher rules, card text, FAQ and errata from the bundled corpus, can search further for related rules, and checks its draft in a separate review pass. Supporting quotes and source IDs are validated before an answer is shown. It sees **only the public board**, recent public events and recent shared chat, captured at question time. It never sees hands, face-down cards, deck order, seat keys, or undo snapshots. Chat and public game information are sent to OpenAI only on invocation, with `store: false`; provider retention policies still apply. Never post private information in shared chat.

Answers identify their chapter/round and flag when the board has changed. Ambiguous or unsupported questions should get a clarification rather than a confident guess. Arcy cannot change play or pause timers. It is an unofficial AI rules helper, not a guarantee of correctness; the publisher rules remain authoritative.

Defaults limit Arcy to one active question per table, four across the server, 60 questions per table per rolling 24 hours and 300 across the server. Set `ARCY_TABLE_DAILY_LIMIT` and `ARCY_DAILY_LIMIT` to change the daily caps. Limits survive restarts; retries count. Configure an OpenAI project budget separately. Chat persists in the same private SQLite database as games. A server restart turns an interrupted question into a retryable message instead of charging automatically again.

Run `node --test tests/arcy.test.js tests/chat-server.test.js` for offline checks. `node --env-file=.env scripts/arcy-eval.mjs` runs **paid** evaluations on synthetic game states and writes answers to ignored `work/arcy-live-eval.json`; inspect their meaning, not just the automated source/status checks. See [Arcy architecture and verification](docs/arcy-referee.md) for corpus provenance, limits and maintenance.

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
