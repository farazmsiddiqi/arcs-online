import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MessageCircle,
  Send,
  X,
  Sparkles,
  BookOpen,
  RotateCcw,
  ChevronDown,
} from "lucide-react";
import { COLORS } from "../game/data.js";
import "./table-chat.css";

function SourceNotes({ evidence, onInspect }) {
  const groups = new Map();
  evidence.forEach((e) => {
    if (!groups.has(e.sourceId)) groups.set(e.sourceId, { ...e, quotes: [] });
    const quotes = groups.get(e.sourceId).quotes;
    if (!quotes.includes(e.quote)) quotes.push(e.quote);
  });
  const sources = [...groups.values()];
  if (!sources.length) return null;
  return (
    <details className="arcy-evidence">
      <summary>
        <BookOpen size={12} />{" "}
        {sources.length === 1
          ? sources[0].title
          : `${sources.length} supporting sources`}
      </summary>
      {sources.map((e) => (
        <div key={e.sourceId}>
          {e.quotes.map((quote) => (
            <blockquote key={quote}>{quote}</blockquote>
          ))}
          <a href={e.url} target="_blank" rel="noopener noreferrer">
            {e.title} ↗
          </a>
          {e.cardId && (
            <button onClick={() => onInspect(e.cardId)}>Inspect card</button>
          )}
        </div>
      ))}
    </details>
  );
}

function Ruling({ message, game, onInspect }) {
  const { answer, snapshot } = message;
  const changed =
    snapshot?.revision != null && game?.revision !== snapshot.revision;
  return (
    <div className="arcy-ruling">
      {snapshot?.chapter && (
        <div className="arcy-snapshot">
          Chapter {snapshot.chapter} · Round {snapshot.round}
          {changed && (
            <span title="The table has changed since this question. Ask @arcy again for the current position.">
              Earlier position
            </span>
          )}
        </div>
      )}
      <div className={`arcy-verdict ${answer.status}`}>
        {answer.status === "context"
          ? "At your table"
          : answer.status === "needs_clarification"
            ? "One detail to clarify"
            : answer.status === "unsupported"
              ? "Not settled by the sources"
              : "The ruling"}
      </div>
      {answer.paragraphs.map((p, i) => (
        <div key={i} className="arcy-paragraph">
          <p>{p.text}</p>
          <SourceNotes evidence={p.evidence} onInspect={onInspect} />
        </div>
      ))}
      {!!answer.assumptions.length && (
        <div className="arcy-assumptions">
          <strong>Assuming</strong> {answer.assumptions.join(" ")}
        </div>
      )}
      {answer.followUp && <p className="arcy-followup">{answer.followUp}</p>}
    </div>
  );
}

export default function TableChat({ room, game, request, onInspect }) {
  const [open, setOpen] = useState(false),
    [messages, setMessages] = useState([]),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [older, setOlder] = useState(false),
    [loadingOlder, setLoadingOlder] = useState(false),
    [width, setWidth] = useState(() =>
      Math.max(
        320,
        Math.min(600, Number(localStorage.getItem("arcs-chat-width")) || 400),
      ),
    ),
    [unread, setUnread] = useState(0);
  const input = useRef(null),
    feed = useRef(null),
    nearBottom = useRef(true),
    previousIds = useRef(null),
    button = useRef(null),
    clientId = useRef(null),
    previousDraft = useRef("");
  const enabled = room.chat?.enabled ?? false;
  const merge = (incoming) =>
    setMessages((current) => {
      const byId = new Map(current.map((m) => [m.id, m]));
      incoming.forEach((m) => {
        if ((byId.get(m.id)?.updated ?? -1) <= m.updated) byId.set(m.id, m);
      });
      return [...byId.values()].sort((a, b) => a.id - b.id);
    });
  useEffect(() => {
    const incoming = room.chat?.messages ?? [];
    merge(incoming);
    if (previousIds.current === null) setOlder(!!room.chat?.hasOlder);
    const signatures = new Set(incoming.map((m) => `${m.id}:${m.status}`));
    if (previousIds.current && !open)
      setUnread(
        (n) =>
          n +
          incoming.filter(
            (m) =>
              !previousIds.current.has(`${m.id}:${m.status}`) &&
              m.status !== "pending" &&
              (m.role === "arcy" || m.seat !== room.me),
          ).length,
      );
    previousIds.current = signatures;
  }, [room.chat]);
  useEffect(() => {
    if (open) {
      setUnread(0);
      input.current?.focus();
    }
  }, [open]);
  useEffect(() => {
    if (open && nearBottom.current && feed.current)
      feed.current.scrollTop = feed.current.scrollHeight;
  }, [messages, open]);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const ask = (text) => {
    setDraft(text);
    input.current?.focus();
  };
  async function send(event) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    const text = draft.trim();
    // Keep a failed request's ID: retrying after a lost response cannot double
    // post or bill the same question twice.
    if (!clientId.current || previousDraft.current !== text)
      clientId.current = crypto.randomUUID();
    previousDraft.current = text;
    setBusy(true);
    setError("");
    try {
      const result = await request(`/api/rooms/${room.id}/chat`, "POST", {
        text,
        clientId: clientId.current,
      });
      merge(result.messages);
      setDraft((current) => (current.trim() === text ? "" : current));
      clientId.current = null;
      nearBottom.current = true;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }
  async function retry(id) {
    setError("");
    setBusy(true);
    try {
      merge(
        (await request(`/api/rooms/${room.id}/chat/${id}/retry`, "POST", {}))
          .messages,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function loadOlder() {
    setLoadingOlder(true);
    setError("");
    nearBottom.current = false;
    const height = feed.current?.scrollHeight ?? 0;
    try {
      const result = await request(
        `/api/rooms/${room.id}/chat?before=${messages[0].id}`,
      );
      merge(result.messages);
      setOlder(result.hasOlder);
      requestAnimationFrame(() => {
        if (feed.current)
          feed.current.scrollTop += feed.current.scrollHeight - height;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingOlder(false);
    }
  }
  const resize = (value) => {
    const w = Math.max(320, Math.min(600, innerWidth - 32, value));
    setWidth(w);
    localStorage.setItem("arcs-chat-width", String(w));
  };
  return (
    <>
      <button
        ref={button}
        className={`chat-toggle ${unread ? "has-unread" : ""}`}
        aria-label={`Table chat${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        aria-controls="table-chat"
        onClick={() => {
          setOpen((v) => !v);
          setUnread(0);
        }}
      >
        <MessageCircle size={17} />
        <span>
          Chat <small>@arcy</small>
        </span>
        {unread > 0 && <b className="chat-unread">{Math.min(unread, 99)}</b>}
      </button>
      {open &&
        createPortal(
          <aside
            id="table-chat"
            className="table-chat"
            aria-label="Table chat and Arcy referee"
            style={{ "--chat-width": `${width}px` }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                close();
              }
            }}
          >
            <div
              className="chat-resizer"
              role="separator"
              tabIndex={0}
              aria-label="Resize table chat"
              aria-orientation="vertical"
              aria-valuenow={Math.round(width)}
              aria-valuemin={320}
              aria-valuemax={600}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  resize(width + (e.key === "ArrowLeft" ? 20 : -20));
                }
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                e.currentTarget.dataset.startX = e.clientX;
                e.currentTarget.dataset.width = width;
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  resize(
                    Number(e.currentTarget.dataset.width) +
                      Number(e.currentTarget.dataset.startX) -
                      e.clientX,
                  );
              }}
              onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
              }}
            />
            <div className="chat-heading">
              <div>
                <span className="chat-eyebrow">COMMS · YOUR TABLE</span>
                <h2>Across the Reach</h2>
              </div>
              <button aria-label="Close table chat" onClick={close}>
                <X size={19} />
              </button>
            </div>
            <div className="arcy-presence">
              <span className="arcy-avatar">
                <Sparkles size={18} />
              </span>
              <div>
                <strong>
                  Arcy <span>Rules referee</span>
                </strong>
                <small>
                  {enabled
                    ? "Mention @arcy for a ruling, with sources."
                    : "Referee not connected · player chat is open."}
                </small>
              </div>
            </div>
            <div
              className="chat-feed"
              ref={feed}
              role="log"
              aria-label="Shared table messages"
              aria-live="polite"
              aria-relevant="additions text"
              onScroll={() => {
                const el = feed.current;
                nearBottom.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
            >
              {older && (
                <button
                  className="chat-older"
                  disabled={loadingOlder}
                  onClick={loadOlder}
                >
                  {loadingOlder ? "Loading…" : "Earlier messages"}
                </button>
              )}
              {!messages.length && (
                <div className="chat-empty">
                  <MessageCircle size={28} />
                  <h3>A seat for every question.</h3>
                  <p>
                    Talk to the table, settle a rules question, or ask Arcy to
                    explain what’s happening.
                  </p>
                  <div className="chat-starters">
                    {[
                      "@arcy Explain what’s happening this turn.",
                      "@arcy Why does declaring an ambition make the lead 0?",
                      "@arcy What’s the difference between a raid and a battle?",
                    ].map((q, i) => (
                      <button key={q} onClick={() => ask(q)}>
                        {
                          [
                            "Explain this turn",
                            "Why is the lead 0?",
                            "Raids & battles",
                          ][i]
                        }
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m) => (
                <article
                  key={m.id}
                  className={`chat-message ${m.role === "arcy" ? "from-arcy" : ""}`}
                  aria-label={`${m.role === "arcy" ? "Arcy referee" : (room.seats[m.seat]?.name ?? "Player")} message`}
                >
                  <div className="chat-byline">
                    <span
                      className="chat-seat"
                      style={{
                        background:
                          m.role === "arcy" ? "#c2b4e5" : COLORS[m.seat],
                      }}
                    />
                    <strong>
                      {m.role === "arcy"
                        ? "Arcy"
                        : (room.seats[m.seat]?.name ?? `Player ${m.seat + 1}`)}
                    </strong>
                    <span>
                      {m.role === "arcy"
                        ? "REFEREE"
                        : m.seat === room.me
                          ? "YOU"
                          : `SEAT ${m.seat + 1}`}
                    </span>
                    <time dateTime={new Date(m.created).toISOString()}>
                      {new Date(m.created).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  {m.role === "arcy" && (
                    <div className="chat-reply-to">
                      Replying to {room.seats[m.seat]?.name ?? "a player"}
                    </div>
                  )}
                  {m.answer ? (
                    <Ruling message={m} game={game} onInspect={onInspect} />
                  ) : (
                    <p
                      className={m.status === "pending" ? "arcy-thinking" : ""}
                    >
                      {m.status === "pending" && (
                        <span className="arcy-pulse" />
                      )}
                      {m.text}
                    </p>
                  )}
                  {m.status === "error" &&
                    (m.seat === room.me || room.host) &&
                    enabled && (
                      <button
                        className="chat-retry"
                        disabled={busy}
                        onClick={() => retry(m.id)}
                      >
                        <RotateCcw size={12} /> Retry with current board
                      </button>
                    )}
                </article>
              ))}
            </div>
            <form className="chat-compose" onSubmit={send}>
              <div className="chat-compose-label">
                <label htmlFor="chat-message">Message the table</label>
                <button
                  type="button"
                  onClick={() =>
                    ask(draft.includes("@arcy") ? draft : `@arcy ${draft}`)
                  }
                >
                  <Sparkles size={12} /> Ask Arcy
                </button>
              </div>
              <div className="chat-input-row">
                <textarea
                  id="chat-message"
                  ref={input}
                  value={draft}
                  maxLength={1500}
                  rows={2}
                  placeholder="Say something, or ask @arcy…"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      send(e);
                    }
                  }}
                />
                <button
                  className="chat-send"
                  type="submit"
                  disabled={!draft.trim() || busy}
                  aria-label="Send message"
                >
                  <Send size={18} />
                </button>
              </div>
              {error && (
                <p role="alert" className="chat-error">
                  {error}
                </p>
              )}
              <details className="chat-privacy">
                <summary>
                  <ChevronDown size={12} /> Shared with everyone at this table
                </summary>
                <p>
                  When you mention @arcy, your question, recent chat and the
                  public board are sent to OpenAI. Hidden hands and face-down
                  cards are excluded. Arcy cites the publisher’s rules, can make
                  mistakes, and never changes play or pauses the timer.
                </p>
              </details>
            </form>
          </aside>,
          document.body,
        )}
    </>
  );
}
