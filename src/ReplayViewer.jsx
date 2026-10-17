import { useEffect, useRef, useState, useMemo, useCallback, memo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Play,
  Pause,
  Radio,
  History,
} from "lucide-react";
import Board from "./Board.jsx";
import SharedBoard from "./SharedBoard.jsx";
import { RoundStory } from "./TableStory.jsx";
import PlayerTable from "./PlayerTable.jsx";
import SystemDetails from "./SystemDetails.jsx";
import { Card, cardImage } from "./Cards.jsx";
import { useActionAnimations } from "./ActionAnimations.jsx";
import { replayPresentation, turnDestination } from "./replayModel.js";
import { createReplayCache, replayBatch } from "./replayCache.js";
import "./replay.css";

const ReplayBoard = memo(Board);
const ReplayPlayerTable = memo(PlayerTable);

export default function ReplayViewer({ room, request, onClose, sessionRef }) {
  const localSession = useRef(null);
  const holder = sessionRef ?? localSession;
  const scope = `${room.id}:${room.me}`;
  if (holder.current?.scope !== scope)
    holder.current = {
      scope,
      frames: [],
      cache: createReplayCache(),
      index: -1,
    };
  const session = holder.current;
  const [frames, setFrames] = useState(session.frames),
    [index, setIndex] = useState(-1),
    [cursor, setCursor] = useState(session.index);
  const [game, setGame] = useState(null),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(true),
    [target, setTarget] = useState(null);
  const [speed, setSpeed] = useState(1700),
    [player, setPlayer] = useState(room.me);
  const [selected, setSelected] = useState(null),
    [detail, setDetail] = useState(null);
  const [retry, setRetry] = useState(0);
  const inspectSystem = useCallback(() => setDetail("system"), []);
  const root = useRef(null),
    serial = useRef(0),
    latestIndex = useRef(-1),
    wanted = useRef(session.index),
    scrubTimer = useRef(null);
  const requestRef = useRef(request);
  requestRef.current = request;
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const seekRef = useRef(null);
  const fetchPositions = (revisions) =>
    requestRef.current(
      `/api/rooms/${room.id}/replay/positions?revisions=${revisions.join(",")}`,
    );
  function warm(next) {
    // Only cross a batch boundary when it is within a few taps of the cursor.
    for (const i of [next - 5, next + 5]) {
      if (i >= 0 && i < framesRef.current.length)
        session.cache
          .load(replayBatch(framesRef.current, i), fetchPositions)
          .catch(() => {});
    }
  }
  function seek(next, animate = true, debounce = false) {
    const frame = framesRef.current[next];
    if (!frame) return;
    clearTimeout(scrubTimer.current);
    const ticket = ++serial.current;
    wanted.current = next;
    setCursor(next);
    setError("");
    function show(position) {
      if (ticket !== serial.current) return;
      const previous = latestIndex.current;
      setGame(
        replayPresentation(position, room.me, {
          sequence: ticket,
          animate: animate && Math.abs(next - previous) === 1,
          direction: next < previous ? -1 : 1,
          label:
            animate && next === previous - 1
              ? framesRef.current[previous]?.label
              : frame.label,
        }),
      );
      latestIndex.current = next;
      session.index = next;
      setIndex(next);
      setDetail(null);
      setLoading(false);
      warm(next);
    }
    const cached = session.cache.get(frame.revision);
    if (cached && !debounce) {
      show(cached);
      return;
    }
    setLoading(!cached);
    async function load() {
      try {
        if (!session.cache.get(frame.revision))
          await session.cache.load(
            replayBatch(framesRef.current, next),
            fetchPositions,
          );
        if (ticket !== serial.current) return;
        const position = session.cache.get(frame.revision);
        if (!position)
          throw new Error(
            "This replay position is not available. Please retry.",
          );
        show(position);
      } catch (e) {
        if (ticket === serial.current) {
          setError(e.message);
          setTarget(null);
          setLoading(false);
        }
      }
    }
    // Coalesce slider movement; the thumb moves immediately, the board settles
    // on the newest position rather than fetching every pixel crossed.
    if (debounce) scrubTimer.current = setTimeout(load, 60);
    else load();
  }
  seekRef.current = seek;
  useEffect(() => {
    let cancelled = false;
    if (latestIndex.current < 0 && session.frames.length)
      seekRef.current(
        session.index >= 0 ? session.index : session.frames.length - 1,
        false,
      );
    async function refresh() {
      try {
        let after = framesRef.current.at(-1)?.revision ?? -1;
        do {
          const page = await requestRef.current(
            `/api/rooms/${room.id}/replay?after=${after}${after < 0 ? "&bootstrap=1" : ""}`,
          );
          if (cancelled) return;
          if (page.positions) session.cache.seed(page.positions);
          const all = [
            ...new Map(
              [...framesRef.current, ...page.frames].map((f) => [
                f.revision,
                f,
              ]),
            ).values(),
          ].sort((a, b) => a.revision - b.revision);
          session.frames = all;
          framesRef.current = all;
          setFrames(all);
          after = page.nextAfter;
        } while (after !== null);
        if (latestIndex.current < 0 && framesRef.current.length)
          seekRef.current(framesRef.current.length - 1, false);
        else if (!framesRef.current.length) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      }
    }
    refresh();
    return () => {
      cancelled = true;
    };
  }, [room.id, room.game?.revision, retry]);
  useEffect(
    () => () => {
      serial.current++;
      clearTimeout(scrubTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (target === null || loading || index < 0) return;
    if (target === index) {
      setTarget(null);
      return;
    }
    const timer = setTimeout(
      () => seekRef.current(index + Math.sign(target - index)),
      speed,
    );
    return () => clearTimeout(timer);
  }, [target, index, loading, speed]);
  const fallback = room.game;
  const motion = useActionAnimations(
    game ?? fallback,
    `replay-${room.id}`,
    root,
  );
  const frame = frames[index];
  const step = (direction) => {
    setTarget(null);
    seek(wanted.current + direction);
  };
  const turns = useMemo(
    () => frames.filter((f, i) => !i || f.turn !== frames[i - 1].turn),
    [frames],
  );
  return (
    <div className="replay-viewer" data-animation-scope="replay" ref={root}>
      <div className="replay-console">
        <header className="replay-heading">
          <div>
            <span className="eyebrow">
              <History size={14} /> PERSONAL REPLAY · READ ONLY
            </span>
            <h2>Watch the table unfold</h2>
            <p>Only your view changes. Live play and timers continue.</p>
          </div>
          <button className="primary" onClick={onClose}>
            <Radio size={15} /> Return to live game
          </button>
        </header>
        {room.game?.decision?.actor === room.me && (
          <div className="replay-live-alert">
            It’s your turn in the live game. Return to live to act; replay does
            not pause your timer.
          </div>
        )}
        <div className="replay-controls" aria-label="Replay navigation">
          <button
            aria-label="First recorded position"
            disabled={!frames.length || cursor <= 0}
            onClick={() => {
              setTarget(null);
              seek(0, false);
            }}
          >
            <ChevronsLeft />
          </button>
          <button
            aria-label="Previous action"
            disabled={!frames.length || cursor <= 0}
            onClick={() => step(-1)}
          >
            <ChevronLeft />
          </button>
          <button
            aria-label={target === null ? "Play replay" : "Pause replay"}
            disabled={
              !frames.length || (target === null && index === frames.length - 1)
            }
            onClick={() =>
              setTarget(target === null ? frames.length - 1 : null)
            }
          >
            {target === null ? <Play /> : <Pause />}
          </button>
          <button
            aria-label="Next action"
            disabled={!frames.length || cursor >= frames.length - 1}
            onClick={() => step(1)}
          >
            <ChevronRight />
          </button>
          <button
            aria-label="Latest recorded position"
            disabled={!frames.length || cursor >= frames.length - 1}
            onClick={() => {
              setTarget(null);
              seek(frames.length - 1, false);
            }}
          >
            <ChevronsRight />
          </button>
          <label>
            Playback
            <select
              aria-label="Replay speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={2600}>Slow</option>
              <option value={1700}>Normal</option>
              <option value={950}>Fast</option>
            </select>
          </label>
          <span>
            {index >= 0
              ? `${index + 1} / ${frames.length} positions`
              : "Loading history…"}
          </span>
        </div>
        <input
          className="replay-scrubber"
          type="range"
          aria-label="Replay position"
          min={0}
          max={Math.max(0, frames.length - 1)}
          value={Math.max(0, cursor)}
          disabled={!frames.length}
          onChange={(e) => {
            setTarget(null);
            seek(Number(e.target.value), false, true);
          }}
        />
        <div className="replay-turn-controls">
          <button
            disabled={!frames.length || cursor <= 0}
            onClick={() => {
              setTarget(null);
              seek(turnDestination(frames, wanted.current, -1), false);
            }}
          >
            ← Previous turn
          </button>
          <select
            aria-label="Jump to turn"
            value={frame?.turn ?? 0}
            onChange={(e) => {
              setTarget(null);
              seek(
                frames.findIndex((f) => f.turn === Number(e.target.value)),
                false,
              );
            }}
          >
            {turns.map((f) => (
              <option key={f.turn} value={f.turn}>
                Ch. {f.chapter} · Round {f.round} ·{" "}
                {room.seats[f.player]?.name ?? "Setup"}
              </option>
            ))}
          </select>
          <button
            disabled={!frames.length || cursor >= frames.length - 1}
            onClick={() => {
              setTarget(null);
              seek(turnDestination(frames, wanted.current, 1), false);
            }}
          >
            Next turn →
          </button>
        </div>
        <div className="replay-caption" aria-live="polite">
          <strong>
            {game?._replay.animate && game?._replay.direction < 0
              ? "Rewinding · "
              : ""}
            {game?._replay.label ??
              frame?.label ??
              "Loading recorded positions"}
          </strong>
          {loading && <small>Loading…</small>}
        </div>
        {error && (
          <p role="alert">
            {error}{" "}
            <button
              onClick={() => {
                setError("");
                setRetry((n) => n + 1);
                if (wanted.current >= 0) seek(wanted.current, false);
              }}
            >
              Retry
            </button>
          </p>
        )}
        {frames[0]?.revision > 0 && (
          <p className="replay-coverage">
            This table predates replay recording. Visual history starts at
            chapter {frames[0].chapter}, round {frames[0].round}; earlier events
            remain in Table history.
          </p>
        )}
        {!loading && !frames.length && (
          <p>Replay recording begins when this game starts.</p>
        )}
      </div>
      {game && (
        <>
          <RoundStory game={game} onInspect={setDetail} onPlayer={setPlayer} />
          <div
            className="replay-supply"
            aria-label="Historical resource supply"
          >
            <span>SUPPLY</span>
            {Object.entries(game.supply).map(([resource, count]) => (
              <span
                key={resource}
                data-supply-resource={resource}
                title={`${resource}: ${count} in supply`}
              >
                <img src={`/assets/${resource}.webp`} alt={resource} />
                {count}
              </span>
            ))}
          </div>
          <div className="replay-board-grid">
            <SharedBoard
              game={game}
              onAmbition={(a) => setDetail(`ambition:${a}`)}
            />
            <div className="replay-map">
              <ReplayBoard
                game={game}
                actionEffects={motion.effects}
                selected={selected}
                onSelect={setSelected}
                onInspect={inspectSystem}
                interactive={false}
              />
            </div>
          </div>
          <div className="replay-court">
            {game.court.map((c, i) => (
              <div key={c.id} data-court-slot={i}>
                <Card id={c.id} onClick={() => setDetail(c.id)} />
                <div>
                  {game.players.map((p) => (
                    <span key={p.id} style={{ color: p.color }}>
                      {p.name}: {c.agents[p.id] ?? 0}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <nav className="replay-players" aria-label="Replay player areas">
            {game.players.map((p) => (
              <button
                key={p.id}
                aria-pressed={player === p.id}
                onClick={() => setPlayer(p.id)}
              >
                {p.name} · {p.power} Power
              </button>
            ))}
          </nav>
          <ReplayPlayerTable
            game={game}
            playerId={player}
            readOnly
            live={false}
            busy
            onInspect={setDetail}
          />
          {detail && (
            <aside className="replay-inspection">
              <button onClick={() => setDetail(null)}>Close inspection</button>
              {detail.startsWith("ambition:") ? (
                <>
                  <h3>{detail.split(":")[1]} · historical standings</h3>
                  {game.players.map((p) => (
                    <p key={p.id}>
                      {p.name}:{" "}
                      {game.ambitionValues[detail.split(":")[1]][p.id]} held
                    </p>
                  ))}
                  <p>These counts belong to the selected replay position.</p>
                </>
              ) : detail === "system" && selected ? (
                <SystemDetails
                  game={game}
                  systemId={selected}
                  onPlayer={(p) => {
                    setPlayer(p);
                    setDetail(null);
                  }}
                  onClose={() => setDetail(null)}
                />
              ) : (
                <img src={cardImage(detail)} alt="Historical card" />
              )}
            </aside>
          )}
        </>
      )}
    </div>
  );
}
