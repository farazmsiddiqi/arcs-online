import { useEffect, useRef, useState } from "react";
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
import "./replay.css";

export default function ReplayViewer({ room, request, onClose }) {
  const [frames, setFrames] = useState([]),
    [index, setIndex] = useState(-1);
  const [game, setGame] = useState(null),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(true),
    [target, setTarget] = useState(null);
  const [speed, setSpeed] = useState(1700),
    [player, setPlayer] = useState(room.me);
  const [selected, setSelected] = useState(null),
    [detail, setDetail] = useState(null);
  const [retry, setRetry] = useState(0);
  const root = useRef(null),
    cache = useRef(new Map()),
    serial = useRef(0),
    latestIndex = useRef(-1);
  const requestRef = useRef(request);
  requestRef.current = request;
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const seekRef = useRef(null);
  async function seek(next, animate = true) {
    const frame = framesRef.current[next];
    if (!frame) return;
    const ticket = ++serial.current;
    setLoading(true);
    setError("");
    try {
      let position = cache.current.get(frame.revision);
      if (!position) {
        position = (
          await requestRef.current(
            `/api/rooms/${room.id}/replay/${frame.revision}`,
          )
        ).game;
        cache.current.set(frame.revision, position);
        if (cache.current.size > 80)
          cache.current.delete(cache.current.keys().next().value);
      }
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
      setIndex(next);
      setDetail(null);
    } catch (e) {
      if (ticket === serial.current) {
        setError(e.message);
        setTarget(null);
      }
    } finally {
      if (ticket === serial.current) setLoading(false);
    }
  }
  seekRef.current = seek;
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        let after = framesRef.current.at(-1)?.revision ?? -1;
        const added = [];
        do {
          const page = await requestRef.current(
            `/api/rooms/${room.id}/replay?after=${after}`,
          );
          if (cancelled) return;
          added.push(...page.frames);
          after = page.nextAfter;
        } while (after !== null);
        if (!added.length) {
          if (!framesRef.current.length) setLoading(false);
          return;
        }
        const all = [
          ...new Map(
            [...framesRef.current, ...added].map((f) => [f.revision, f]),
          ).values(),
        ].sort((a, b) => a.revision - b.revision);
        framesRef.current = all;
        setFrames(all);
        if (latestIndex.current < 0)
          await seekRef.current(all.length - 1, false);
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
    seek(index + direction);
  };
  const turns = frames.filter((f, i) => !i || f.turn !== frames[i - 1].turn);
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
            disabled={loading || index <= 0}
            onClick={() => {
              setTarget(null);
              seek(0, false);
            }}
          >
            <ChevronsLeft />
          </button>
          <button
            aria-label="Previous action"
            disabled={loading || index <= 0}
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
            disabled={loading || index >= frames.length - 1}
            onClick={() => step(1)}
          >
            <ChevronRight />
          </button>
          <button
            aria-label="Latest recorded position"
            disabled={loading || index >= frames.length - 1}
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
          value={Math.max(0, index)}
          disabled={!frames.length}
          onChange={(e) => {
            setTarget(null);
            seek(Number(e.target.value), false);
          }}
        />
        <div className="replay-turn-controls">
          <button
            disabled={loading || index <= 0}
            onClick={() => setTarget(turnDestination(frames, index, -1))}
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
            disabled={loading || index >= frames.length - 1}
            onClick={() => setTarget(turnDestination(frames, index, 1))}
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
                if (index >= 0) seek(index, false);
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
              <Board
                game={game}
                actionEffects={motion.effects}
                selected={selected}
                onSelect={setSelected}
                onInspect={() => setDetail("system")}
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
          <PlayerTable
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
