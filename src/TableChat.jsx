import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MessageCircle,
  LockKeyhole,
  ArrowUp,
  ArrowLeft,
  Reply,
  X,
  Sparkles,
  BookOpen,
  RotateCcw,
  ChevronDown,
  AtSign,
  UserRound,
  Orbit,
} from "lucide-react";
import { cardImage } from "./Cards.jsx";
import { COLORS } from "../game/data.js";
import {
  chatMentionOptions,
  isPlayerMention,
  mentionQuery,
  filterMentions,
  mentionSegments,
} from "../game/chat-mentions.js";
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
        <BookOpen size={12} /> Sources · {sources.length}
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
      {["needs_clarification", "unsupported", "strategy"].includes(
        answer.status,
      ) && (
        <div className={`arcy-verdict ${answer.status}`}>
          {answer.status === "strategy"
            ? "Rules, not strategy"
            : answer.status === "needs_clarification"
              ? "One detail to clarify"
              : "Not settled by the sources"}
        </div>
      )}
      {answer.paragraphs.map((p, i) => (
        <div key={i} className="arcy-paragraph">
          <p>{p.text}</p>
        </div>
      ))}
      {!!answer.assumptions.length && (
        <div className="arcy-assumptions">
          <strong>Assuming</strong> {answer.assumptions.join(" ")}
        </div>
      )}
      {answer.followUp && <p className="arcy-followup">{answer.followUp}</p>}
      <SourceNotes
        evidence={answer.paragraphs.flatMap((p) => p.evidence)}
        onInspect={onInspect}
      />
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
    </div>
  );
}

function ReferenceSnapshot({ reference, game, onInspect }) {
  const rows = reference.rows,
    changed =
      reference.snapshot?.revision != null &&
      reference.snapshot.revision !== game?.revision;
  const renderRow = (r, i) => (
    <div className="chat-reference-row" key={i}>
      {r.cardId ? (
        <button onClick={() => onInspect(r.cardId)}>
          <img src={cardImage(r.cardId)} alt="" />
          <span>
            <small>{r.label}</small>
            <strong>{r.value}</strong>
          </span>
          <span aria-hidden="true">↗</span>
        </button>
      ) : (
        <>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </>
      )}
    </div>
  );
  return (
    <section
      className="chat-state-card"
      aria-label={`${reference.title} snapshot`}
    >
      <header>
        <Orbit size={14} />
        <strong>{reference.title}</strong>
        <span>Table snapshot</span>
      </header>
      <dl>{rows.slice(0, 6).map(renderRow)}</dl>
      {rows.length > 6 && (
        <details>
          <summary>{rows.length - 6} more details</summary>
          <dl>{rows.slice(6).map(renderRow)}</dl>
        </details>
      )}
      <footer>
        {reference.snapshot?.chapter
          ? `Chapter ${reference.snapshot.chapter} · Round ${reference.snapshot.round}`
          : "Lobby"}
        {changed ? " · Earlier position" : ""} · No AI
      </footer>
    </section>
  );
}

export default function TableChat({
  room,
  game,
  request,
  onInspect,
  onReveal,
}) {
  const [open, setOpen] = useState(false),
    [messages, setMessages] = useState([]),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [thread, setThread] = useState(null),
    [privateMode, setPrivateMode] = useState(false),
    [mentionNotices, setMentionNotices] = useState([]),
    [threadCounts, setThreadCounts] = useState({}),
    [pages, setPages] = useState({}),
    [threadLoading, setThreadLoading] = useState(false),
    [loadingOlder, setLoadingOlder] = useState(false),
    [width, setWidth] = useState(() =>
      Math.max(
        320,
        Math.min(600, Number(localStorage.getItem("arcs-chat-width")) || 400),
      ),
    ),
    [unread, setUnread] = useState(0),
    [mention, setMention] = useState(null),
    [mentionIndex, setMentionIndex] = useState(0);
  const input = useRef(null),
    feed = useRef(null),
    nearBottom = useRef(true),
    previousIds = useRef(null),
    button = useRef(null),
    clientId = useRef(null),
    previousDraft = useRef(""),
    drafts = useRef({}),
    currentThread = useRef(null);
  const channelKey = privateMode ? "private" : "table";
  const pageKey = thread ?? channelKey;
  const older = pages[pageKey]?.hasOlder ?? false;
  const threadHasArcy =
    privateMode || (thread !== null && threadCounts[thread]?.arcy);
  const visibleMessages = messages
    .filter((m) => !!m.private === privateMode)
    .filter((m) =>
      thread !== null
        ? m.id === thread || m.threadId === thread
        : m.threadId == null || (m.role === "arcy" && m.replyTo === m.threadId),
    );
  const enabled = room.chat?.enabled ?? false;
  const mentionOptions = chatMentionOptions(room.seats);
  const suggestions = mention
    ? filterMentions(mentionOptions, mention.query)
    : [];
  const updateMention = (el) => {
    const query =
      el.selectionStart === el.selectionEnd
        ? mentionQuery(el.value, el.selectionStart)
        : null;
    setMention(query);
    setMentionIndex(0);
  };
  const chooseMention = (option) => {
    if (!mention) return;
    const text =
      draft.slice(0, mention.start) +
      option.token +
      " " +
      draft.slice(mention.end);
    const caret = mention.start + option.token.length + 1;
    setDraft(text);
    setMention(null);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(caret, caret);
    });
  };
  useEffect(() => {
    if (suggestions.length)
      document
        .getElementById(`chat-mention-${mentionIndex}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [mentionIndex, mention?.query]);
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
    setThreadCounts((current) => ({ ...current, ...room.chat?.threadCounts }));
    if (previousIds.current === null)
      setPages((current) => ({ ...current, table: room.chat }));
    const signatures = new Set(incoming.map((m) => `${m.id}:${m.status}`));
    const seenKey = `arcs-mentions:${room.id}:${room.me}`;
    let lastSeen = Number(localStorage.getItem(seenKey));
    if (!lastSeen)
      lastSeen =
        previousIds.current === null
          ? Math.max(0, ...incoming.map((m) => m.id))
          : 0;
    const mentions = incoming.filter(
      (m) => m.id > lastSeen && isPlayerMention(m, room.me, room.seats),
    );
    if (mentions.length)
      setMentionNotices((current) => [...current, ...mentions].slice(-5));
    localStorage.setItem(
      seenKey,
      String(Math.max(lastSeen, ...incoming.map((m) => m.id))),
    );
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
    setMention(null);
    input.current?.focus();
  };
  async function showThread(id) {
    drafts.current[currentThread.current ?? channelKey] = draft;
    currentThread.current = id;
    setThread(id);
    setDraft(drafts.current[id ?? channelKey] ?? "");
    setMention(null);
    setError("");
    nearBottom.current = true;
    input.current?.focus();
    if (id === null) {
      setThreadLoading(false);
      return;
    }
    setThreadLoading(true);
    try {
      const result = await request(`/api/rooms/${room.id}/chat?thread=${id}`);
      merge(result.messages);
      setThreadCounts((current) => ({ ...current, ...result.threadCounts }));
      setPages((current) => ({ ...current, [id]: result }));
    } catch (e) {
      if (currentThread.current === id) setError(e.message);
    } finally {
      if (currentThread.current === id) setThreadLoading(false);
    }
  }
  async function send(event) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    const text = draft.trim();
    const sentThread = thread;
    // Keep a failed request's ID: retrying after a lost response cannot double
    // post or bill the same question twice.
    if (
      !clientId.current ||
      previousDraft.current !== `${channelKey}:${thread}:${text}`
    )
      clientId.current = crypto.randomUUID();
    previousDraft.current = `${channelKey}:${thread}:${text}`;
    setBusy(true);
    setError("");
    try {
      const result = await request(`/api/rooms/${room.id}/chat`, "POST", {
        text,
        clientId: clientId.current,
        replyTo: sentThread,
        private: privateMode,
      });
      merge(result.messages);
      setThreadCounts((current) => ({ ...current, ...result.threadCounts }));
      if (currentThread.current === sentThread)
        setDraft((current) => (current.trim() === text ? "" : current));
      else if (drafts.current[sentThread ?? channelKey]?.trim() === text)
        drafts.current[sentThread ?? channelKey] = "";
      setMention(null);
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
        `/api/rooms/${room.id}/chat?scope=${channelKey}&before=${pages[pageKey]?.nextBefore}${thread !== null ? `&thread=${thread}` : ""}`,
      );
      merge(result.messages);
      setPages((current) => ({ ...current, [pageKey]: result }));
      setThreadCounts((current) => ({ ...current, ...result.threadCounts }));
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
  async function switchChannel(value) {
    drafts.current[currentThread.current ?? channelKey] = draft;
    currentThread.current = null;
    setThread(null);
    setPrivateMode(value);
    setMention(null);
    setError("");
    setDraft(drafts.current[value ? "private" : "table"] ?? "");
    nearBottom.current = true;
    try {
      const key = value ? "private" : "table";
      const result = await request(`/api/rooms/${room.id}/chat?scope=${key}`);
      merge(result.messages);
      setPages((p) => ({ ...p, [key]: result }));
      setThreadCounts((p) => ({ ...p, ...result.threadCounts }));
    } catch (e) {
      setError(e.message);
    }
    input.current?.focus();
  }
  const openMention = (message) => {
    onReveal?.();
    setOpen(true);
    setPrivateMode(false);
    setUnread(0);
    setMentionNotices((ns) => ns.filter((n) => n.id !== message.id));
    showThread(message.threadId ?? message.id);
  };
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
      {!!mentionNotices.length &&
        createPortal(
          <div
            className="chat-mention-notices"
            aria-label="Chat mentions"
            role="status"
          >
            {mentionNotices.map((m) => (
              <div key={m.id} className="chat-mention-notice">
                <button className="mention-open" onClick={() => openMention(m)}>
                  <span className="mention-seal">
                    <AtSign size={20} />
                  </span>
                  <span>
                    <strong>
                      {room.seats[m.seat]?.name ?? "A player"} mentioned you
                    </strong>
                    <small>{m.text}</small>
                    <em>Table message · Open conversation ↗</em>
                  </span>
                </button>
                <button
                  className="mention-dismiss"
                  aria-label="Dismiss mention"
                  onClick={() =>
                    setMentionNotices((ns) => ns.filter((n) => n.id !== m.id))
                  }
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
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
                <h2>{privateMode ? "Consult Arcy" : "Table chat"}</h2>
                <span className="chat-eyebrow">
                  {enabled
                    ? "Arcy is here for rules · no strategy advice"
                    : "Player chat · Arcy is offline"}
                </span>
              </div>
              <button aria-label="Close table chat" onClick={close}>
                <X size={19} />
              </button>
            </div>
            <div className="chat-channel-switch" aria-label="Chat visibility">
              <button
                aria-pressed={!privateMode}
                onClick={() => switchChannel(false)}
              >
                <MessageCircle size={14} /> Table
              </button>
              <button
                aria-pressed={privateMode}
                onClick={() => switchChannel(true)}
              >
                <LockKeyhole size={14} /> Consult Arcy privately
              </button>
            </div>
            {privateMode && (
              <div className="chat-private-banner">
                <LockKeyhole size={12} /> Only you and Arcy · Rules, never move
                advice
              </div>
            )}
            {thread !== null && (
              <div className="chat-thread-heading">
                <button
                  onClick={() => showThread(null)}
                  aria-label={
                    privateMode
                      ? "Back to private consultations"
                      : "Back to table chat"
                  }
                >
                  <ArrowLeft size={17} />
                </button>
                <div>
                  <strong>Thread</strong>
                  <small>
                    {privateMode
                      ? "Private consultation · visible only to you"
                      : threadHasArcy
                        ? "Arcy follows replies here · shared with the table"
                        : "Replies stay together · shared with the table"}
                  </small>
                </div>
              </div>
            )}
            <div
              className="chat-feed"
              ref={feed}
              role="log"
              aria-label={
                privateMode
                  ? "Private Arcy consultations"
                  : "Shared table messages"
              }
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
              {threadLoading && (
                <p className="chat-thread-loading">Loading thread…</p>
              )}
              {!visibleMessages.length && thread === null && (
                <div className="chat-empty">
                  <MessageCircle size={28} />
                  <h3>What’s the rule?</h3>
                  <p>
                    {privateMode
                      ? "Ask a rules question discreetly. Other players cannot see this consultation, even when you reference them. Arcy answers automatically."
                      : "Message your table, or mention @arcy for a rules explanation with sources. You make the moves."}
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
              {visibleMessages.map((m) => (
                <article
                  key={m.id}
                  className={`chat-message ${m.role === "arcy" ? "from-arcy" : m.seat === room.me ? "from-me" : "from-player"}`}
                  aria-label={`${m.role === "arcy" ? "Arcy referee" : (room.seats[m.seat]?.name ?? "Player")} message`}
                >
                  <div className="chat-byline">
                    {m.role === "arcy" ? (
                      <Sparkles size={16} className="arcy-message-icon" />
                    ) : (
                      <span
                        className="chat-seat"
                        style={{
                          background:
                            m.role === "arcy" ? "#c2b4e5" : COLORS[m.seat],
                        }}
                      />
                    )}
                    <strong>
                      {m.role === "arcy"
                        ? "Arcy"
                        : (room.seats[m.seat]?.name ?? `Player ${m.seat + 1}`)}
                    </strong>
                    <time dateTime={new Date(m.created).toISOString()}>
                      {new Date(m.created).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  {m.role === "arcy" && m.seat !== room.me && (
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
                      {m.role === "player"
                        ? mentionSegments(m.text, mentionOptions).map(
                            (segment, i) =>
                              segment.mention ? (
                                <span
                                  className="chat-inline-mention"
                                  key={i}
                                  title={segment.mention.description}
                                >
                                  {segment.text}
                                </span>
                              ) : (
                                segment.text
                              ),
                          )
                        : m.text}
                    </p>
                  )}
                  {m.references?.map((reference) => (
                    <ReferenceSnapshot
                      key={reference.id}
                      reference={reference}
                      game={game}
                      onInspect={onInspect}
                    />
                  ))}
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
                  {thread === null && m.threadId == null && (
                    <button
                      className="chat-thread-link"
                      onClick={() => showThread(m.threadId ?? m.id)}
                    >
                      <Reply size={13} />{" "}
                      {threadCounts[m.threadId ?? m.id]?.count
                        ? `${threadCounts[m.threadId ?? m.id].count} ${threadCounts[m.threadId ?? m.id].count === 1 ? "reply" : "replies"} · Open thread`
                        : "Reply in thread"}
                    </button>
                  )}
                </article>
              ))}
            </div>
            <form className="chat-compose" onSubmit={send}>
              <div className="chat-input-row">
                {mention && (
                  <div className="chat-mention-picker">
                    <div className="chat-mention-heading">
                      <AtSign size={14} /> Add a reference{" "}
                      <small>↑↓ to navigate · ↵ to insert</small>
                    </div>
                    <div
                      role="listbox"
                      id="chat-mentions"
                      aria-label="Mention suggestions"
                      className="chat-mention-options"
                    >
                      {suggestions.map((option, i) => (
                        <React.Fragment key={option.id}>
                          {(i === 0 ||
                            suggestions[i - 1].kind !== option.kind) && (
                            <div
                              className="chat-mention-group"
                              role="presentation"
                            >
                              {option.kind === "referee"
                                ? "Referee"
                                : option.kind === "player"
                                  ? "Players"
                                  : "Game references"}
                            </div>
                          )}
                          <button
                            type="button"
                            role="option"
                            id={`chat-mention-${i}`}
                            aria-selected={i === mentionIndex}
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setMentionIndex(i)}
                            onClick={() => chooseMention(option)}
                          >
                            {option.kind === "referee" ? (
                              <Sparkles size={17} />
                            ) : option.kind === "player" ? (
                              <UserRound size={17} />
                            ) : (
                              <Orbit size={17} />
                            )}
                            <span>
                              <strong>{option.label}</strong>
                              <small>{option.description}</small>
                            </span>
                            <code>{option.token}</code>
                          </button>
                        </React.Fragment>
                      ))}
                      {!suggestions.length && (
                        <p className="chat-mention-empty">
                          No matching reference. Try a player’s name, board, or
                          turn.
                        </p>
                      )}
                    </div>
                    <div className="chat-mention-hint">
                      {threadHasArcy
                        ? "Arcy follows replies in this thread. References add context."
                        : "References show instant table data. Mention @arcy for rules."}
                    </div>
                  </div>
                )}
                <label className="chat-sr-only" htmlFor="chat-message">
                  {privateMode ? "Ask Arcy privately" : "Message the table"}
                </label>
                <textarea
                  id="chat-message"
                  ref={input}
                  value={draft}
                  maxLength={1500}
                  rows={2}
                  placeholder={
                    privateMode
                      ? "Ask Arcy privately… no @ needed"
                      : threadHasArcy
                        ? "Reply to Arcy… no @ needed"
                        : thread !== null
                          ? "Reply in thread, or ask @arcy"
                          : "Message the table, or ask @arcy"
                  }
                  aria-autocomplete="list"
                  aria-controls={mention ? "chat-mentions" : undefined}
                  aria-activedescendant={
                    suggestions.length
                      ? `chat-mention-${mentionIndex}`
                      : undefined
                  }
                  onChange={(e) => {
                    setDraft(e.target.value);
                    updateMention(e.target);
                  }}
                  onClick={(e) => updateMention(e.target)}
                  onKeyUp={(e) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                    )
                      updateMention(e.target);
                  }}
                  onKeyDown={(e) => {
                    if (mention && !e.nativeEvent.isComposing) {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        setMention(null);
                        return;
                      }
                      if (
                        suggestions.length &&
                        ["ArrowDown", "ArrowUp"].includes(e.key)
                      ) {
                        e.preventDefault();
                        setMentionIndex(
                          (i) =>
                            (i +
                              (e.key === "ArrowDown" ? 1 : -1) +
                              suggestions.length) %
                            suggestions.length,
                        );
                        return;
                      }
                      if (
                        suggestions.length &&
                        (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey))
                      ) {
                        e.preventDefault();
                        chooseMention(suggestions[mentionIndex]);
                        return;
                      }
                    }
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
                <div className="chat-compose-tools">
                  <button
                    type="button"
                    className="chat-reference"
                    aria-label="Add a reference"
                    title="Reference a player or part of the game"
                    onClick={() => {
                      const text =
                        draft + (draft && !/\s$/.test(draft) ? " " : "") + "@";
                      setDraft(text);
                      setMention(mentionQuery(text));
                      setMentionIndex(0);
                      requestAnimationFrame(() => {
                        input.current?.focus();
                        input.current?.setSelectionRange(
                          text.length,
                          text.length,
                        );
                      });
                    }}
                  >
                    <AtSign size={17} />
                  </button>
                  <button
                    type="button"
                    className="chat-mention"
                    onClick={() =>
                      ask(draft.includes("@arcy") ? draft : `@arcy ${draft}`)
                    }
                  >
                    <Sparkles size={14} /> Ask Arcy
                  </button>
                  <button
                    className="chat-send"
                    type="submit"
                    disabled={!draft.trim() || busy}
                    aria-label="Send message"
                  >
                    <ArrowUp size={19} />
                  </button>
                </div>
              </div>
              {error && (
                <p role="alert" className="chat-error">
                  {error}
                </p>
              )}
              <details className="chat-privacy">
                <summary>
                  <ChevronDown size={12} />{" "}
                  {privateMode
                    ? "Private · Only you can read this"
                    : "Everyone at this table can read this"}
                </summary>
                <p>
                  When you ask Arcy, your question, this thread and the public
                  board are sent to OpenAI. Hidden hands and face-down cards are
                  excluded. Arcy cites the publisher’s rules, can make mistakes,
                  and never changes play or pauses the timer.
                </p>
              </details>
            </form>
          </aside>,
          document.body,
        )}
    </>
  );
}
