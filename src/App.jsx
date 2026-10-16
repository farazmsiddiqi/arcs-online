import PlayChoices from "./PlayChoices.jsx";
import { setupImage, setupsFor } from "./setupPreview.js";
import { draftOrder } from "./draftOrder.js";
import PlayerBoardResize, { clampPlayerWidth } from "./PlayerBoardResize.jsx";
import PlayerTable from "./PlayerTable.jsx";
import DockResize from "./DockResize.jsx";
import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import {
  Orbit,
  Plus,
  ArrowUpRight,
  BookOpen,
  Users,
  Settings,
  ChevronRight,
  X,
  Copy,
  Check,
  Radio,
  Trophy,
  Swords,
  Layers,
  Search,
  Shield,
  Flag,
  Ship,
  Download,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  MAP,
  SETUPS,
  COLORS,
  CARDS,
  ACTION_CARDS,
  AMBITIONS,
  SUITS,
  RESOURCES,
} from "../game/data.js";
import errata from "../data/errata.json";
import faq from "../data/faq.json";
import Board, { sprite } from "./Board.jsx";
import TurnTimers, { ClockChip } from "./TurnTimers.jsx";
import BattleGuide from "./BattleGuide.jsx";
import BattleRecord, { battleList } from "./BattleRecord.jsx";
import CommandPanel from "./CommandPanel.jsx";
import { Card, ActionCard, cardImage } from "./Cards.jsx";
import { discardPanelModel } from "./discardPanel.js";
import { groupTurns } from "./turnHistory.js";
import {
  clarificationsFor,
  clarificationSearchText,
  hasClarifications,
  linkParts,
} from "./clarifications.js";
import { useTableTools } from "./tableTools.js";
import { confirmFor } from "./confirmStep.js";
import { rulesText } from "./tableContext.js";
import { affectsSeat } from "./notices.js";
import NoticeToasts, { useNoticeToasts } from "./NoticeToasts.jsx";
import { chime, flashTitle, readSound, writeSound } from "./attention.js";
import { RoundStory, TurnBeacon } from "./TableStory.jsx";
import SharedBoard, { AmbitionIcon, AmbitionMarker } from "./SharedBoard.jsx";
const clarificationSources = { errata, faq };
const cardIdByName = (name) =>
  Object.values(CARDS).find((c) => c.name === name)?.id;
const cap = (s) => s?.[0]?.toUpperCase() + s?.slice(1);
const demo = {
  chapter: 1,
  round: 1,
  initiative: 0,
  current: 0,
  phase: "card",
  clusters: [1, 2, 4, 5, 6],
  players: ["You", "Player 2", "Player 3", "Player 4"].map((name, i) => ({
    id: i,
    name,
    power: 0,
    color: COLORS[i],
    resources:
      i === 0 ? ["relic", "psionic", null] : ["material", "fuel", null],
    hand:
      i === 0
        ? [
            "construction-3",
            "administration-2",
            "aggression-5",
            "mobilization-4",
            "administration-6",
            "construction-7",
          ]
        : 6,
    cards: [],
    trophies: [],
    captives: [],
    outrage: [],
  })),
  pieces: SETUPS["4SETUP01"].positions.flatMap((pos, owner) =>
    pos.flatMap((system, j) => [
      { id: `${owner}-${j}a`, owner, type: "ship", system, damaged: false },
      { id: `${owner}-${j}b`, owner, type: "ship", system, damaged: false },
      ...(j < 2
        ? [
            {
              id: `${owner}-${j}c`,
              owner,
              type: "ship",
              system,
              damaged: false,
            },
            {
              id: `${owner}-${j}d`,
              owner,
              type: j === 0 ? "city" : "starport",
              system,
              damaged: false,
            },
          ]
        : []),
    ]),
  ),
  court: ["BC02", "BC08", "BC22", "BC31"].map((id) => ({
    id,
    agents: [0, 0, 0, 0],
  })),
  markers: [
    { id: 2, high: 5, low: 3 },
    { id: 1, high: 3, low: 2 },
    { id: 0, high: 2, low: 0 },
  ],
  courtDeckCount: 27,
  log: [],
  turn: null,
  me: 0,
};
const parseStart = () => {
  const id = location.pathname.match(/^\/table\/([A-F0-9]+)/)?.[1];
  return {
    id,
    key: id ? localStorage.getItem(`arcs-seat-${id}`) : null,
    invite: new URLSearchParams(location.hash.slice(1)).get("invite"),
  };
};
const initial = parseStart();
export default function App() {
  const [room, setRoom] = useState(null),
    [credentials, setCredentials] = useState(initial),
    [selected, setSelected] = useState(null),
    [selectedPieces, setSelectedPieces] = useState([]),
    [battleDice, setBattleDice] = useState({
      skirmish: 0,
      assault: 0,
      raid: 0,
    }),
    [draggedCard, setDraggedCard] = useState(null),
    [modal, setModal] = useState(
      initial.id && !initial.key ? "join" : initial.key ? null : "welcome",
    ),
    [detailStack, setDetailStack] = useState([]),
    [name, setName] = useState(localStorage.getItem("arcs-name") ?? ""),
    [count, setCount] = useState(4),
    [leaders, setLeaders] = useState(false),
    [doubleLore, setDoubleLore] = useState(false),
    [setup, setSetup] = useState("random"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [error, setError] = useState(""),
    // Timer-control errors show only in the Turn timers dialog.
    [timerError, setTimerError] = useState(""),
    [picked, setPicked] = useState(null),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false),
    [invite, setInvite] = useState(""),
    [copied, setCopied] = useState(false),
    [fullMap, setFullMap] = useState(false),
    [playerDetail, setPlayerDetail] = useState(null),
    [sound, setSound] = useState(readSound),
    // The one-click choice waiting for its confirm step (C-6), as the id of a
    // choice at one revision. Any new revision drops it.
    [pendingConfirm, setPendingConfirm] = useState(null);
  const [dockHeight, setDockHeight] = useState(() => {
    const v = Number(localStorage.getItem("arcs-dock-height"));
    return v >= 180 ? Math.min(v, Math.max(180, innerHeight - 400)) : null;
  });
  useEffect(() => {
    const clamp = () =>
      setDockHeight((h) =>
        h === null ? null : Math.min(h, Math.max(180, innerHeight - 400)),
      );
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);
  const [playerWidth, setPlayerWidth] = useState(() => {
    const value = Number(localStorage.getItem("arcs-player-board-width"));
    return value >= 20 && value <= 80 && innerWidth > 1000
      ? clampPlayerWidth(value)
      : null;
  });
  const resizePlayerBoard = (value) => {
    setPlayerWidth(value);
    if (value === null) localStorage.removeItem("arcs-player-board-width");
    else localStorage.setItem("arcs-player-board-width", String(value));
  };
  useEffect(() => {
    const resize = () => {
      if (innerWidth > 1000)
        setPlayerWidth((value) =>
          value === null ? null : clampPlayerWidth(value),
        );
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const [resourceFocus, setResourceFocus] = useState(null);
  const [autoDockHeight, setAutoDockHeight] = useState(null);
  const resizeDock = (value) => {
    setDockHeight(value);
    if (value === null) localStorage.removeItem("arcs-dock-height");
    else localStorage.setItem("arcs-dock-height", String(value));
  };
  // Card detail is a stack so a linked card (`$link:X$`) closes back to the
  // card that linked it, then to the library/board it was opened from.
  const detail = detailStack.at(-1) ?? null,
    setDetail = (id) => setDetailStack(id == null ? [] : [id]),
    pushDetail = (id) =>
      setDetailStack((stack) => (stack.at(-1) === id ? stack : [...stack, id])),
    modalRef = useRef(null),
    modalScroll = useRef(0);
  // Close the topmost layer only: card > commander details > modal > a
  // pending confirm step > the expanded map. The modal underneath (library,
  // discard piles, players...) stays as it was.
  const closeTop = () => {
    if (detailStack.length) setDetailStack((stack) => stack.slice(0, -1));
    else if (playerDetail !== null) setPlayerDetail(null);
    else if (modal) setModal(null);
    else if (pendingConfirm) setPendingConfirm(null);
    else setFullMap(false);
  };
  const layer = detail ? "card" : playerDetail !== null ? "player" : "modal";
  useLayoutEffect(() => {
    modalScroll.current = 0;
  }, [modal]);
  useLayoutEffect(() => {
    if (layer === "modal" && modalRef.current)
      modalRef.current.scrollTop = modalScroll.current;
  }, [layer]);
  const closeTopRef = useRef(closeTop);
  closeTopRef.current = closeTop;
  const previousActor = useRef(null),
    watching = useRef(false),
    logRef = useRef(null),
    commandRef = useRef(null);
  const game = room?.game ?? demo,
    me = game.players[game.me ?? 0],
    live = !!room?.game;
  const effectiveDockHeight = dockHeight ?? autoDockHeight;
  // Every player sees each new timer notice as a toast; the player it is
  // about also gets the tab title flashed while the tab is in the background.
  const { toasts, dismiss: dismissToast } = useNoticeToasts(room, (fresh) => {
    const mine = affectsSeat(fresh, room.me);
    if (mine.length) flashTitle(mine.at(-1).text);
  });
  useEffect(() => {
    if (dockHeight !== null) return;
    const content = commandRef.current?.querySelector(".command-live");
    if (!content) return;
    const measure = () => {
      if (innerWidth <= 1000) {
        setAutoDockHeight(null);
        return;
      }
      const base = innerHeight <= 800 ? 250 : 300;
      setAutoDockHeight(
        Math.min(
          // The dock never takes more than 46% of a tall window, so the map
          // keeps about 370px on a 14" MacBook and 330px at 900px tall; a
          // longer panel scrolls, and the dock can still be dragged taller.
          // Short windows keep the old 400px reserve for the map.
          Math.min(
            500,
            Math.max(
              180,
              Math.min(innerHeight - 400, Math.round(innerHeight * 0.46)),
            ),
          ),
          Math.max(
            base,
            Math.ceil(content.scrollHeight) + 20,
            (document.querySelector(".player-table-inner")?.scrollHeight ?? 0) +
              38,
          ),
        ),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    const personal = document.querySelector(".player-table-inner");
    if (personal) observer.observe(personal);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [dockHeight, live, game.revision, picked]);
  const request = async (path, method = "GET", body) => {
    const key = credentials.key;
    const r = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json();
    if (!r.ok) {
      if (data.game) setRoom(data);
      throw new Error(data.error ?? "Connection failed.");
    }
    return data;
  };
  useEffect(() => {
    if (!credentials.id || !credentials.key) return;
    let active = true,
      ws,
      timer;
    const refresh = () =>
      request(`/api/rooms/${credentials.id}`)
        .then((data) => {
          if (active) setRoom(data);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    refresh();
    const connect = () => {
      ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/socket`,
      );
      ws.onopen = () => ws.send(JSON.stringify(credentials));
      ws.onmessage = (e) => {
        if (active) {
          setRoom(JSON.parse(e.data));
          setConnected(true);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (active) timer = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    const poll = setInterval(refresh, 15000);
    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(poll);
      ws?.close();
    };
  }, [credentials.id, credentials.key]);
  useEffect(() => {
    if (!live) {
      watching.current = false;
      return;
    }
    setPicked(null);
    setPendingConfirm(null);
    const f = game.decision?.form;
    setSelectedPieces(
      game.interaction?.kind === "moveSelect" && f?.options.length <= f?.max
        ? f.options.map((o) => o.id)
        : [],
    );
    setDraggedCard(null);
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    const actor = game.decision?.actor;
    // Only a change seen while watching counts, so loading or reconnecting
    // onto your own turn stays quiet. The chime can be muted in Settings;
    // the title flash only runs while the tab is in the background.
    if (
      watching.current &&
      actor === game.me &&
      previousActor.current !== actor
    ) {
      if (sound) chime();
      flashTitle("Your turn");
    }
    previousActor.current = actor;
    watching.current = true;
  }, [game.revision, live]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") closeTopRef.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!modal && !detail && playerDetail === null) return;
    const previous = document.activeElement;
    const dialog = document.querySelector('[role="dialog"]');
    const focusable = () =>
      [
        ...dialog.querySelectorAll(
          'button:not(:disabled),a[href],input,select,[tabindex="0"]',
        ),
      ].filter((el) => el.getClientRects().length);
    // preventScroll: keep the library where the reader left it.
    focusable()[0]?.focus({ preventScroll: true });
    const trap = (e) => {
      if (e.key !== "Tab") return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener("keydown", trap);
    return () => {
      dialog.removeEventListener("keydown", trap);
      previous?.focus({ preventScroll: true });
    };
  }, [modal, detail, playerDetail]);
  async function create(practice = false) {
    setError("");
    setBusy(true);
    try {
      const data = await request("/api/rooms", "POST", {
        name,
        players: count,
        practice,
        options: {
          leaders,
          doubleLore: leaders && doubleLore,
          ...(setup !== "random" ? { setupId: setup } : {}),
        },
      });
      localStorage.setItem(`arcs-seat-${data.id}`, data.key);
      localStorage.setItem("arcs-name", name);
      localStorage.setItem(`arcs-invite-${data.id}`, data.invite);
      history.pushState({}, "", `/table/${data.id}`);
      setCredentials({ id: data.id, key: data.key });
      setRoom(data);
      setInvite(data.invite);
      setModal(practice ? null : "lobby");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function join() {
    setBusy(true);
    setError("");
    try {
      const data = await request(`/api/rooms/${credentials.id}/join`, "POST", {
        name,
        invite: credentials.invite,
      });
      localStorage.setItem(`arcs-seat-${credentials.id}`, data.key);
      localStorage.setItem("arcs-name", name);
      history.replaceState({}, "", `/table/${credentials.id}`);
      setCredentials({ ...credentials, key: data.key });
      setRoom(data);
      setModal("lobby");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setBusy(true);
    setError("");
    try {
      const data = await request(
        `/api/rooms/${credentials.id}/start`,
        "POST",
        {},
      );
      setRoom(data);
      setModal(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function selectBoard(system) {
    setSelected(system);

    if (!live || busy || room.clock?.blocked || game.decision.actor !== game.me)
      return;
    if (
      game.interaction?.kind === "moveSelect" &&
      game.interaction.destinations?.includes(system)
    ) {
      const f = game.decision.form;
      if (selectedPieces.length < f.min) {
        setError("Select at least one ship to move.");
        return;
      }
      actOrConfirm({ value: selectedPieces, destination: system });
      return;
    }
    const c = game.decision.choices?.find(
      (c) =>
        c.system === system &&
        ["moveFrom", "moveTo", "continue"].includes(c.op),
    );
    if (c) actOrConfirm({ choice: c.id });
    else {
      const targets = game.decision.choices.filter((c) => c.system === system);
      if (
        targets.length === 1 &&
        [
          "battleTarget",
          "taxTarget",
          "buildTarget",
          "repairTarget",
          "hit",
        ].includes(targets[0].op)
      )
        actOrConfirm({ choice: targets[0].id });
    }
  }
  function togglePiece(id) {
    if (busy || room.clock?.blocked || game.decision?.actor !== game.me) return;
    const f = game.decision?.form;
    if (f?.kind !== "pieces" || !f.options.some((o) => o.id === id)) return;
    setSelectedPieces((values) => {
      if (values.includes(id)) return values.filter((v) => v !== id);
      const option = f.options.find((o) => o.id === id);
      if (
        values.length >= f.max ||
        (option.system &&
          f.maxPerSystem &&
          f.options.filter(
            (o) => o.system === option.system && values.includes(o.id),
          ).length >= f.maxPerSystem)
      )
        return values;
      return [...values, id];
    });
  }
  function dropCard(e) {
    e.preventDefault();
    const id = e.dataTransfer.getData("application/x-arcs-card");
    setDraggedCard(null);
    if (
      !busy &&
      game.phase === "card" &&
      game.decision?.actor === game.me &&
      Array.isArray(me.hand) &&
      me.hand.includes(id)
    ) {
      setPicked(id);
      commandRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }
  async function control(kind, input) {
    if (busy) return;
    const fail = kind === "timer" ? setTimerError : setError;
    setBusy(true);
    fail("");
    try {
      const data = await request(
        `/api/rooms/${credentials.id}/${kind}`,
        "POST",
        { revision: room.game?.revision ?? room.revision, ...input },
      );
      setRoom(data);
    } catch (e) {
      fail(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (modal !== "timers") setTimerError("");
  }, [modal]);
  async function act(input) {
    if (busy) return { ok: false, error: "Another command is in progress." };
    const target = game.decision.choices?.find(
      (c) => c.id === input.choice,
    )?.system;
    if (target) setSelected(target);
    setBusy(true);
    setError("");
    try {
      const data = await request(
        `/api/rooms/${credentials.id}/action`,
        "POST",
        { revision: game.revision, ...input },
      );
      setRoom(data);
      return { ok: true, revision: data.game.revision, phase: data.game.phase };
    } catch (e) {
      setError(e.message);
      return { ok: false, error: e.message };
    } finally {
      setBusy(false);
    }
  }
  // C-6: every click or button in the interface sends its choice through
  // here. One-click choices that commit or reveal a card (see confirmStep.js)
  // wait for a confirm step in the command panel; everything else, and any
  // input that is not a plain choice (forms, Back, resource arrangement),
  // goes straight to `act`. The table tools below keep the raw `act`: a tool
  // call is itself a deliberate submission at a stated revision.
  function actOrConfirm(input) {
    const choice =
      live && game.decision?.actor === game.me && input.choice !== undefined
        ? game.decision.choices?.find((c) => c.id === input.choice)
        : null;
    if (!confirmFor(choice, game)) {
      setPendingConfirm(null);
      return act(input);
    }
    if (busy || room.clock?.blocked)
      return Promise.resolve({
        ok: false,
        error: "Another command is in progress.",
      });
    setError("");
    setPendingConfirm({ revision: game.revision, choice: choice.id });
    // The confirm lives in the command panel, so clear whatever covers it:
    // dialogs, and the expanded map, which is drawn over the whole screen.
    setDetailStack([]);
    setPlayerDetail(null);
    setModal(null);
    setFullMap(false);
    return Promise.resolve({ ok: false, pending: true });
  }
  const confirmPending = () => {
    if (pendingConfirm?.revision !== game.revision) return;
    const { choice } = pendingConfirm;
    return act({ choice });
  };
  useTableTools(game, live, act, room);
  const inviteLink = credentials.id
    ? `${location.origin}/table/${credentials.id}#invite=${invite || localStorage.getItem(`arcs-invite-${credentials.id}`) || ""}`
    : "";
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Select and copy the invitation link below.");
    }
  };
  async function exportJournal() {
    try {
      const data = await request(`/api/rooms/${credentials.id}/export`);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `arcs-${credentials.id}-journal.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    }
  }
  const library = Object.values(CARDS)
    .filter((c) => category === "all" || c.kind === category)
    .filter((c) =>
      (
        c.name +
        " " +
        c.tags.join(" ") +
        " " +
        (c.text ?? "") +
        " " +
        clarificationSearchText(c, c.id, clarificationSources)
      )
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  // Table history opens at the newest turn; later updates leave the scroll
  // position alone.
  useEffect(() => {
    if (modal === "journal" && logRef.current)
      logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [modal]);
  const detailCard = detail ? (CARDS[detail] ?? ACTION_CARDS[detail]) : null;
  return (
    <div
      className="app"
      style={
        effectiveDockHeight
          ? { "--dock-height": `${effectiveDockHeight}px` }
          : undefined
      }
    >
      <header className="topbar">
        <button className="wordmark" onClick={() => setModal("settings")}>
          ARCS<span>CONFLICT & COLLAPSE IN THE REACH</span>
        </button>
        <div className="table-title">
          <span className="game-progress">
            Chapter {game.chapter} · Round {game.round}
          </span>
          <span className={`status-dot ${connected ? "online" : ""}`} />{" "}
          {room ? `Table ${room.id}` : "Private table"}{" "}
          <span className="tag">
            {room ? (connected ? "CONNECTED" : "RECONNECTING") : "EXPLORE"}
          </span>
        </div>
        <nav>
          <button onClick={() => setModal("players")} aria-label="Players">
            <Users size={16} />
            <span>Players</span>
          </button>
          <button onClick={() => setModal("standings")} aria-label="Ambitions">
            <Trophy size={16} />
            <span>Ambitions</span>
          </button>
          <button
            onClick={() => setModal("journal")}
            aria-label="Table history"
          >
            <Layers size={16} />
            <span>History</span>
          </button>
          {room && (
            <ClockChip clock={room.clock} onClick={() => setModal("timers")} />
          )}
          <button aria-label="Card library" onClick={() => setModal("library")}>
            <BookOpen size={17} />
            <span>Card library</span>
          </button>
          <button aria-label="Rules" onClick={() => setModal("rules")}>
            <Layers size={17} />
            <span>Rules</span>
          </button>
          <button
            className="icon-button"
            aria-label="Table settings"
            onClick={() => setModal("settings")}
          >
            <Settings size={18} />
          </button>
        </nav>
      </header>
      <NoticeToasts toasts={toasts} onDismiss={dismissToast} />
      <RoundStory
        game={game}
        onInspect={setDetail}
        onPlayer={setPlayerDetail}
      />
      {live && (
        <TurnBeacon
          game={game}
          connected={connected}
          onJump={() =>
            commandRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            })
          }
        />
      )}
      <main className="workspace">
        <SharedBoard
          game={game}
          onAmbition={(a) => setModal(`ambition:${a}`)}
        />
        <section
          className={`board-area ${fullMap ? "expanded-board" : ""} ${draggedCard ? "card-drop-active" : ""}`}
          onDragOver={(e) => {
            if (draggedCard) e.preventDefault();
          }}
          onDrop={dropCard}
        >
          {draggedCard && (
            <div className="card-drop-hint">
              Drop to select this card · choose its play beside your hand
            </div>
          )}
          <div className="map-heading">
            <span>
              <span className="eyebrow">TACTICAL MAP</span>
              <strong>The Reach</strong>
            </span>
            {live && (
              <div className="resource-bank" aria-label="Resource supply">
                {RESOURCES.map((r) => {
                  const cartel = game.players.find((p) =>
                    p.cards.includes(
                      r === "material" ? "BC03" : r === "fuel" ? "BC06" : "",
                    ),
                  );
                  return (
                    <span
                      key={r}
                      title={`${cap(r)}: ${game.supply[r]} in supply${cartel ? ` · held by ${cartel.name}'s Cartel` : ""}`}
                    >
                      <img src={`/assets/${r}.webp`} alt={cap(r)} />
                      <b>{game.supply[r]}</b>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="map-controls">
              <span className="map-hint">
                {game.interaction
                  ? "Select ships and highlighted systems"
                  : "Select a system to inspect"}
              </span>
              <button
                className="icon-button"
                aria-label={fullMap ? "Close expanded board" : "Expand board"}
                onClick={() => setFullMap(!fullMap)}
              >
                {fullMap ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </div>
          {game.phase === "draft" && game.draft ? (
            <div className="draft-board">
              <p>
                Draft in reverse turn order. Choose one leader and{" "}
                {game.options.doubleLore ? "two lore cards" : "one lore card"}.
              </p>
              {(() => {
                const order = draftOrder(game);
                return (
                  <ol className="draft-order" aria-label="Draft pick order">
                    {order.chips.map((c) => {
                      const pl = game.players[c.seat];
                      return (
                        <li
                          key={c.index}
                          className={`draft-chip ${c.state} ${c.pass % 2 ? "alt" : ""}`}
                          style={{ "--player": pl.color }}
                          aria-current={
                            c.state === "current" ? "step" : undefined
                          }
                          title={
                            c.archivist
                              ? "Archivist: also chooses Lore privately after the draft"
                              : undefined
                          }
                        >
                          <span className="draft-chip-pick">
                            Pick {c.index + 1}
                          </span>
                          <b>
                            {pl.name}
                            {c.seat === game.me ? " (you)" : ""}
                          </b>
                          <span className="draft-chip-what">
                            {c.state === "done"
                              ? (CARDS[c.card]?.name ?? "Taken")
                              : c.state === "current"
                                ? "Picking now"
                                : "Waiting"}
                          </span>
                          {c.initiative && (
                            <span className="draft-chip-note">
                              Initiative · picks last each pass
                            </span>
                          )}
                          {c.archivist && (
                            <span className="draft-chip-note">
                              Archivist: chooses Lore privately after the draft
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                );
              })()}
              {["leaders", "lore"].map((kind) => (
                <section key={kind}>
                  <h3>
                    {kind === "leaders"
                      ? "Available leaders"
                      : "Available lore"}
                  </h3>
                  <div className="draft-row">
                    {game.draft[kind].map((id) => {
                      const choice = game.decision.choices.find(
                        (c) => c.op === "draft" && c.card === id,
                      );
                      return (
                        <div key={id}>
                          <Card id={id} onClick={() => setDetail(id)} />
                          {choice && (
                            <button
                              className="draft-pick"
                              disabled={busy}
                              onClick={() =>
                                actOrConfirm({ choice: choice.id })
                              }
                            >
                              Draft {CARDS[id].name}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <Board
              key={live ? room.id : "preview"}
              game={game}
              selected={selected}
              onSelect={selectBoard}
              selectedPieces={selectedPieces}
              onPiece={togglePiece}
              onAction={actOrConfirm}
              onInspect={() => setModal("system")}
              interactive={!busy && !room?.clock?.blocked}
            />
          )}
          <div className="court">
            <div className="court-heading">
              <span className="eyebrow">THE COURT</span>
              <span>Influence. Secure. Shape the Reach.</span>
              <span className="deck-count">
                {game.courtDeckCount} cards in deck
              </span>
              <button
                className="court-discard-link"
                onClick={() => setModal("court-discard")}
                aria-label={`Inspect Court discard pile: ${game.courtDiscard?.length ?? 0} cards`}
              >
                <Layers size={12} /> {game.courtDiscard?.length ?? 0} discarded
              </button>
              <button
                className="court-discard-link action-discard-link"
                onClick={() => setModal("action-discard")}
                aria-label="Inspect action discard piles"
              >
                <Layers size={12} /> Action discard
              </button>
            </div>
            <div className="court-row">
              {game.court.map((c, index) => (
                <div className="court-slot" key={`${index}-${c.id}`}>
                  {c.id ? (
                    <>
                      <Card
                        id={c.id}
                        onClick={() => {
                          const target =
                            game.decision?.actor === game.me &&
                            game.decision?.choices?.find(
                              (v) =>
                                v.card === c.id &&
                                [
                                  "influenceTarget",
                                  "secureTarget",
                                  "bold",
                                  "ransack",
                                ].includes(v.op),
                            );
                          if (target && !busy && !room?.clock?.blocked)
                            actOrConfirm({ choice: target.id });
                          else setDetail(c.id);
                        }}
                      />
                      {game.decision?.choices?.some(
                        (v) =>
                          v.card === c.id &&
                          [
                            "influenceTarget",
                            "secureTarget",
                            "bold",
                            "ransack",
                          ].includes(v.op),
                      ) && (
                        <span className="court-action-hint">
                          {game.decision.choices
                            .find(
                              (v) =>
                                v.card === c.id &&
                                [
                                  "influenceTarget",
                                  "secureTarget",
                                  "bold",
                                  "ransack",
                                ].includes(v.op),
                            )
                            .op.match(/influenceTarget|bold/)
                            ? "Place agent"
                            : game.decision.choices.some(
                                  (v) => v.card === c.id && v.op === "ransack",
                                )
                              ? "Ransack card"
                              : "Secure card"}{" "}
                          ↗
                        </span>
                      )}
                    </>
                  ) : (
                    <div className="empty-court">Court deck empty</div>
                  )}
                  <div className="influence-dots">
                    {game.players.map((p, i) => (
                      <span
                        key={i}
                        style={{ color: p.color }}
                        title={`${p.name}: ${c.agents[i]} agents`}
                      >
                        ● <b>{c.agents[i]}</b>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer
        className="hand-area"
        aria-label="Your hand and actions"
        style={{
          "--player-width":
            playerWidth === null ? undefined : `${playerWidth}%`,
        }}
      >
        <DockResize
          height={effectiveDockHeight}
          onChange={resizeDock}
          onReset={() => {
            resizeDock(null);
            resizePlayerBoard(null);
          }}
        />
        <PlayerBoardResize width={playerWidth} onChange={resizePlayerBoard} />
        <PlayerTable
          game={game}
          live={live}
          busy={busy || room?.clock?.blocked}
          onInspect={setDetail}
          onAction={actOrConfirm}
          resourceFocus={resourceFocus}
          onResource={(index) => {
            setResourceFocus({
              index,
              revision: game.revision,
              stamp: Date.now(),
            });
            if (innerWidth <= 1000)
              commandRef.current?.scrollIntoView({
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
                block: "start",
              });
          }}
        >
          <div className="hand-cards">
            {Array.isArray(me.hand) &&
              me.hand.map((id) => (
                <ActionCard
                  id={id}
                  key={id}
                  selected={picked === id}
                  draggable={
                    live &&
                    !busy &&
                    game.phase === "card" &&
                    game.decision?.actor === game.me
                  }
                  onDragStart={() => setDraggedCard(id)}
                  onDragEnd={() => setDraggedCard(null)}
                  onClick={() => {
                    setPicked(id);
                    setDetail(id);
                  }}
                  onInspect={() => setDetail(id)}
                />
              ))}
            {live && Array.isArray(me.hand) && !me.hand.length && (
              <p className="empty-hand">
                {game.phase === "draft"
                  ? "Choose your leader and lore to begin."
                  : "Your hand is empty. New cards arrive next chapter."}
              </p>
            )}
          </div>
        </PlayerTable>
        <aside
          className="action-panel"
          ref={commandRef}
          id="command-panel"
          tabIndex={-1}
        >
          <div className="action-status">
            <span className="eyebrow">COMMAND DECK</span>
            <span className="live-indicator">
              <Radio size={12} /> {live ? "LIVE" : "EXPLORE"}
            </span>
          </div>
          {live ? (
            <CommandPanel
              game={game}
              room={room}
              resourceFocus={resourceFocus}
              onAction={actOrConfirm}
              onBattleGuide={(dice) => {
                setBattleDice(dice);
                setModal("dice-guide");
              }}
              values={selectedPieces}
              setValues={setSelectedPieces}
              onHistory={(direction) => control("history", { direction })}
              onTimers={() => setModal("timers")}
              picked={detail && ACTION_CARDS[detail] ? null : picked}
              selected={selected}
              busy={busy}
              error={error}
              onInspect={setDetail}
              onClearCard={() => setPicked(null)}
              onClearSystem={() => setSelected(null)}
              confirming={
                pendingConfirm?.revision === game.revision
                  ? pendingConfirm.choice
                  : null
              }
              onConfirm={confirmPending}
              onCancelConfirm={() => setPendingConfirm(null)}
            />
          ) : (
            <div className="turn-message">
              <span className="turn-emblem">
                <Orbit size={31} />
              </span>
              <h2>The Reach awaits.</h2>
              <p>
                Create a private table, invite your friends, and begin your
                first chapter.
              </p>
              <button
                className="primary full"
                onClick={() => setModal(room ? "lobby" : "welcome")}
              >
                {room ? "Open lobby" : "Create a table"} <Plus size={16} />
              </button>
            </div>
          )}
        </aside>
      </footer>
      {(modal || detail || playerDetail !== null) && (
        <div className="modal-backdrop" onClick={closeTop}>
          <section
            ref={modalRef}
            onClickCapture={(e) => {
              // Remember the modal's own scroll before a click can open a card
              // over it, so closing the card returns to the same place.
              if (layer === "modal")
                modalScroll.current = e.currentTarget.scrollTop;
            }}
            className={`modal ${modal === "library" ? "library-modal" : modal === "dice-guide" ? "dice-guide-modal" : ""} ${detail ? "card-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              detail
                ? (detailCard?.name ?? detail)
                : playerDetail !== null
                  ? "Commander details"
                  : modal
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={closeTop}
            >
              <X size={20} />
            </button>
            {detail ? (
              <>
                <img
                  className="detail-art"
                  src={cardImage(detail)}
                  alt={detailCard?.name ?? detail}
                />
                <div>
                  <span className="eyebrow">
                    {detailCard?.tags?.join(" · ") ?? "ACTION CARD"}
                  </span>
                  <h2>
                    {detailCard?.name ??
                      `${cap(detailCard?.suit)} ${detailCard?.rank}`}
                  </h2>
                  <p className="rules-text">
                    {(detailCard?.text ? rulesText(detailCard.text) : null) ??
                      `${detailCard?.pips} action pips. ${SUITS[detailCard?.suit]?.map(cap).join(", ")}. ${detailCard?.ambition ? `May declare ${detailCard.ambition} when leading.` : detailCard?.rank === 7 ? "May declare any ambition when leading." : "No ambition."}`}
                  </p>
                  {ACTION_CARDS[detail] &&
                    live &&
                    game.phase === "card" &&
                    game.decision?.actor === game.me &&
                    Array.isArray(me.hand) &&
                    me.hand.includes(detail) && (
                      <section
                        className="inspection-plays"
                        aria-label="Play this inspected card"
                      >
                        <h3>How would you like to play it?</h3>
                        <PlayChoices
                          choices={game.decision.choices.filter(
                            (c) => c.op === "play" && c.card === detail,
                          )}
                          game={game}
                          busy={busy || room?.clock?.blocked}
                          onPlay={async (c) => {
                            const result = await actOrConfirm({ choice: c.id });
                            if (result.ok) setDetail(null);
                          }}
                        />
                        {error && (
                          <p className="error" role="alert">
                            {error}
                          </p>
                        )}
                      </section>
                    )}
                  {(() => {
                    const extra = clarificationsFor(
                      detailCard,
                      detail,
                      clarificationSources,
                    );
                    const linked = (text) =>
                      linkParts(text, cardIdByName).map((part, k) =>
                        part.id ? (
                          <button
                            key={k}
                            className="rules-link"
                            onClick={() => pushDetail(part.id)}
                          >
                            {rulesText(part.text)}
                          </button>
                        ) : (
                          <React.Fragment key={k}>
                            {rulesText(part.text)}
                          </React.Fragment>
                        ),
                      );
                    return (
                      <>
                        {extra.errata.map((e, i) => (
                          <div className="errata" key={i}>
                            <strong>Publisher clarification</strong>
                            {e.errata.map((x, j) => (
                              <p key={j}>{linked(x.text)}</p>
                            ))}
                          </div>
                        ))}
                        {extra.faq.map((f, i) => (
                          <details className="card-faq" key={i}>
                            <summary>{linked(f.q)}</summary>
                            <p>{linked(f.a)}</p>
                          </details>
                        ))}
                      </>
                    );
                  })()}
                  <span className="card-credit">
                    Game: Cole Wehrle · Artwork: Kyle Ferrin
                    <br />
                    Arcs © Buried Giant Studios
                  </span>
                </div>
              </>
            ) : playerDetail !== null ? (
              <>
                <span className="eyebrow gold">COMMANDER</span>
                <h2 style={{ color: game.players[playerDetail].color }}>
                  {game.players[playerDetail].name}
                </h2>
                <p>
                  {game.players[playerDetail].power} Power ·{" "}
                  {game.players[playerDetail].trophies.length} Trophies ·{" "}
                  {game.players[playerDetail].captives.length} Captives
                </p>
                {live && (
                  <div className="supply-list">
                    {Object.entries(game.supplies[playerDetail]).map(
                      ([type, n]) => (
                        <span key={type}>
                          <img src={sprite(playerDetail, type)} alt="" />
                          {n} {type}
                          {n === 1 ? "" : "s"} in supply
                        </span>
                      ),
                    )}
                  </div>
                )}
                <p>
                  Outrage:{" "}
                  {game.players[playerDetail].outrage.join(", ") || "none"}
                </p>
                {live && (
                  <div className="resource-detail">
                    {game.players[playerDetail].resources.map((r, index) => (
                      <span key={index}>
                        {r ? (
                          <img src={`/assets/${r}.webp`} alt={r} />
                        ) : (
                          <span>Empty</span>
                        )}
                        <small>
                          Slot {index + 1} ·{" "}
                          {game.resourceKeys[playerDetail][index]} keys
                        </small>
                      </span>
                    ))}
                  </div>
                )}
                {["trophies", "captives"].map((kind) => (
                  <details className="card-faq" key={kind}>
                    <summary>
                      {cap(kind)} · {game.players[playerDetail][kind].length}
                    </summary>
                    {game.players.map((owner) => {
                      const pieces = game.players[playerDetail][kind].filter(
                        (x) => x.owner === owner.id,
                      );
                      return pieces.length ? (
                        <p key={owner.id} style={{ color: owner.color }}>
                          {owner.name}:{" "}
                          {["ship", "city", "starport", "agent"]
                            .map((type) => ({
                              type,
                              n: pieces.filter((x) => x.type === type).length,
                            }))
                            .filter((x) => x.n)
                            .map(
                              (x) => `${x.n} ${x.type}${x.n === 1 ? "" : "s"}`,
                            )
                            .join(", ")}
                        </p>
                      ) : null;
                    })}
                  </details>
                ))}
                <div className="player-catalogue">
                  {[
                    game.players[playerDetail].leader,
                    ...game.players[playerDetail].cards,
                  ]
                    .filter(Boolean)
                    .map((id) => (
                      <Card key={id} id={id} onClick={() => setDetail(id)} />
                    ))}
                </div>
              </>
            ) : modal === "welcome" ? (
              <>
                <span className="eyebrow gold">
                  YOUR PRIVATE CORNER OF THE GALAXY
                </span>
                <h1>Gather your rivals.</h1>
                <p>
                  Command a fleet. Influence the Court.
                  <br />
                  Write the next chapter of the Reach together.
                </p>
                <label>
                  Your name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Commander name"
                    maxLength={32}
                  />
                </label>
                <fieldset className="choice-field">
                  <legend>Players</legend>
                  <div className="segmented">
                    {[2, 3, 4].map((n) => (
                      <button
                        key={n}
                        aria-pressed={count === n}
                        className={count === n ? "selected" : ""}
                        onClick={() => {
                          setCount(n);
                          setSetup("random");
                        }}
                      >
                        {n} players
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="choice-field">
                  <legend>Game mode</legend>
                  <div className="segmented">
                    <button
                      aria-pressed={!leaders}
                      className={!leaders ? "selected" : ""}
                      onClick={() => setLeaders(false)}
                    >
                      Base game
                    </button>
                    <button
                      aria-pressed={leaders}
                      className={leaders ? "selected" : ""}
                      onClick={() => setLeaders(true)}
                    >
                      Leaders & Lore
                    </button>
                  </div>
                </fieldset>
                {leaders && (
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={doubleLore}
                      onChange={(e) => setDoubleLore(e.target.checked)}
                    />{" "}
                    Draft two lore per player · advanced variant
                  </label>
                )}
                <details className="setup-settings">
                  <summary>Setup options</summary>
                  <label>
                    Setup card
                    <select
                      value={setup}
                      onChange={(e) => setSetup(e.target.value)}
                    >
                      <option value="random">Random official setup</option>
                      {setupsFor(count).map(([id, s]) => (
                        <option key={id} value={id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {setup === "random" ? (
                    <div
                      className="setup-preview setup-preview-grid"
                      aria-label="Setup cards that can be drawn"
                    >
                      {setupsFor(count).map(([id, s]) => (
                        <button
                          key={id}
                          type="button"
                          title={`Choose ${s.name}`}
                          onClick={() => setSetup(id)}
                        >
                          <img src={setupImage(id)} alt={s.name} />
                          <span>{s.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    SETUPS[setup] && (
                      <figure className="setup-preview">
                        <img
                          src={setupImage(setup)}
                          alt={`${SETUPS[setup].name} setup card`}
                        />
                        <figcaption>{SETUPS[setup].name}</figcaption>
                      </figure>
                    )
                  )}
                </details>
                <button
                  className="primary full"
                  disabled={busy || !name.trim()}
                  onClick={() => create(false)}
                >
                  Create private table <Plus size={17} />
                </button>
                <button
                  className="subtle full"
                  disabled={busy || !name.trim()}
                  onClick={() => create(true)}
                >
                  Practice with simple rivals
                </button>
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <button className="subtle full" onClick={() => setModal(null)}>
                  Explore the table
                </button>
                <span className="modal-footnote">
                  An unofficial private play companion. Base game + all Leaders
                  & Lore.
                </span>
              </>
            ) : modal === "join" ? (
              <>
                <span className="eyebrow gold">
                  YOU HAVE A SEAT AT THE TABLE
                </span>
                <h1>Enter the Reach.</h1>
                <p>Join your friends at table {credentials.id}.</p>
                <label>
                  Your name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Commander name"
                    maxLength={32}
                  />
                </label>
                <button
                  className="primary full"
                  disabled={busy || !name.trim()}
                  onClick={join}
                >
                  Join table <Users size={17} />
                </button>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
              </>
            ) : modal === "lobby" ? (
              <>
                <span className="eyebrow gold">YOUR PRIVATE TABLE</span>
                <h2>Gather your commanders.</h2>
                <p>
                  {room?.seats.length} / {room?.capacity} seats filled ·{" "}
                  {room?.options.leaders ? "Leaders & Lore" : "Base game"}
                </p>
                <div className="lobby-seats">
                  {Array.from({ length: room?.capacity ?? 4 }, (_, i) => (
                    <div key={i}>
                      <span style={{ background: COLORS[i] }} />
                      {room?.seats[i]?.name ?? "Waiting for a friend…"}
                      {room?.seats[i]?.connected && <small>Connected</small>}
                    </div>
                  ))}
                </div>
                {room?.host && (
                  <>
                    <button className="subtle full" onClick={copyInvite}>
                      {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
                      {copied ? "Invitation copied" : "Copy invitation link"}
                    </button>
                    <input
                      className="invite-input"
                      aria-label="Invitation link"
                      value={inviteLink}
                      readOnly
                      onFocus={(e) => e.target.select()}
                    />
                  </>
                )}
                {room?.status === "lobby" ? (
                  room.host ? (
                    <button
                      className="primary full"
                      disabled={busy || room.seats.length !== room.capacity}
                      onClick={start}
                    >
                      Begin the game
                    </button>
                  ) : (
                    <p>The host will begin once everyone has joined.</p>
                  )
                ) : (
                  <button
                    className="primary full"
                    onClick={() => setModal(null)}
                  >
                    Return to the game
                  </button>
                )}
                {error && <p className="error">{error}</p>}
                <span className="modal-footnote">
                  Keep this browser to keep your seat. The invitation lets
                  friends claim their own seats.
                </span>
              </>
            ) : modal === "library" ? (
              <>
                <span className="eyebrow gold">
                  ORIGINAL CARDS & PUBLISHER CLARIFICATIONS
                </span>
                <h2>The archives</h2>
                <div className="search">
                  <Search size={18} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search cards, leaders, lore, and abilities…"
                  />
                </div>
                <div className="library-tabs">
                  {[
                    "all",
                    "guild",
                    "vox",
                    "leader",
                    "lore",
                    "action",
                    "reference",
                  ].map((c) => (
                    <button
                      key={c}
                      className={category === c ? "selected" : ""}
                      onClick={() => setCategory(c)}
                    >
                      {c === "all" ? "All cards" : cap(c)}
                    </button>
                  ))}
                </div>
                <p>
                  {category === "action" ? 28 : library.length} cards · Base
                  game + Leaders & Lore
                </p>
                <div className="library-grid">
                  {category === "action"
                    ? Object.keys(ACTION_CARDS)
                        .filter((id) => id.includes(query.toLowerCase()))
                        .map((id) => (
                          <button
                            className="court-card"
                            key={id}
                            onClick={() => setDetail(id)}
                          >
                            <img src={cardImage(id)} alt={id} />
                          </button>
                        ))
                    : library.map((c) => (
                        <Card
                          key={c.id}
                          id={c.id}
                          onClick={() => setDetail(c.id)}
                          badge={
                            hasClarifications(c, c.id, clarificationSources)
                              ? "FAQ"
                              : null
                          }
                        />
                      ))}
                </div>
              </>
            ) : modal === "court-discard" ? (
              <>
                <span className="eyebrow gold">PUBLIC PILE</span>
                <h2>Court discard</h2>
                <p>
                  Discarded Court cards are public. Select a card to inspect it.
                </p>
                <div className="library-grid">
                  {[...(game.courtDiscard ?? [])].reverse().map((id, index) => (
                    <Card
                      key={`${id}-${index}`}
                      id={id}
                      onClick={() => setDetail(id)}
                    />
                  ))}
                </div>
                {!game.courtDiscard?.length && (
                  <p>No Court cards have been discarded.</p>
                )}
              </>
            ) : modal === "action-discard" ? (
              (() => {
                const pile = discardPanelModel(game);
                return (
                  <>
                    <span className="eyebrow gold">ACTION DISCARD</span>
                    <h2>Action discard</h2>
                    <p>
                      Face-up cards are public. They are drawn only when the
                      face-down pile runs short: then they are shuffled into it.
                      Face-down cards stay hidden; only their count is known.
                    </p>
                    <p className="discard-down-count">
                      In the discard: <strong>{pile.total}</strong>{" "}
                      {pile.total === 1 ? "card" : "cards"} · face-up{" "}
                      <strong>{pile.faceUpCount}</strong> · face-down{" "}
                      <strong>{pile.faceDownCount}</strong>
                    </p>
                    {pile.rounds.map((r) => (
                      <section className="discard-round" key={r.round}>
                        <h3>Round {r.round}</h3>
                        <div className="library-grid">
                          {r.cards.map((c, i) => (
                            <div
                              className="discard-up-item"
                              key={`${c.card}-${i}`}
                            >
                              <ActionCard
                                id={c.card}
                                onClick={() => setDetail(c.card)}
                                onInspect={() => setDetail(c.card)}
                              />
                              <span className="discard-up-by">
                                {c.playerName} · {c.modeLabel}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                    {!pile.faceUpCount && <p>No face-up cards in the pile.</p>}
                    {pile.merge && (
                      <section className="discard-merge">
                        <h3>
                          Last merge · round {pile.merge.round} (event{" "}
                          {String(pile.merge.eventId).padStart(2, "0")})
                        </h3>
                        <p>
                          {pile.merge.count} face-up{" "}
                          {pile.merge.count === 1 ? "card was" : "cards were"}{" "}
                          shuffled into the face-down pile and can no longer be
                          told apart from it. The counts above are current.
                        </p>
                        {pile.merge.rounds.map((r) => (
                          <div key={r.round}>
                            <h4>Played in round {r.round}</h4>
                            <div className="library-grid">
                              {r.cards.map((c, i) => (
                                <div
                                  className="discard-up-item"
                                  key={`${c.card}-${i}`}
                                >
                                  <ActionCard
                                    id={c.card}
                                    onClick={() => setDetail(c.card)}
                                    onInspect={() => setDetail(c.card)}
                                  />
                                  <span className="discard-up-by">
                                    {c.playerName} · {c.modeLabel}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </section>
                    )}
                    {pile.draws.length > 0 && (
                      <section className="discard-draws">
                        <h3>Draw log</h3>
                        <p>
                          Draws from the discard, oldest first. Counts only: the
                          cards drawn are never shown.
                        </p>
                        <ul>
                          {pile.draws.map((d) => (
                            <li key={d.eventId}>
                              <span>{String(d.eventId).padStart(2, "0")}</span>
                              Chapter {d.chapter} · round {d.round} ·{" "}
                              {d.playerName} drew {d.count}{" "}
                              {d.count === 1 ? "card" : "cards"} ({d.viaLabel})
                              {d.merged &&
                                " after the face-up pile was shuffled in"}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </>
                );
              })()
            ) : modal?.startsWith("ambition:") ? (
              <>
                <span className="eyebrow gold">AMBITION</span>
                <h2>{cap(modal.split(":")[1])}</h2>
                <div className="ambition-detail-pieces">
                  <AmbitionIcon ambition={modal.split(":")[1]} />
                  {game.markers
                    .filter((m) => m.ambition === modal.split(":")[1])
                    .map((m) => (
                      <AmbitionMarker key={m.id} marker={m} />
                    ))}
                </div>
                <p>
                  {
                    {
                      tycoon:
                        "Most Material and Fuel icons, from resources and Guild cards.",
                      tyrant:
                        "Most Captives. Captives are rival agents you take by taxing their cities or securing Court cards they have agents on, plus a few card abilities such as Abduct and Gate Ports. If Tyrant is scored at chapter end, every player's Captives go back to their owners' supplies. If it was not declared, they stay and carry over.",
                      warlord:
                        "Most Trophies. Trophies are rival ships, cities, starports and agents you destroyed, plus agents taken by Ransacking the Court and Captives executed with Prison Wardens. If Warlord is scored at chapter end, every player's Trophies go back: ships and starports to their owner's supply, cities to their owner's player board (which can cover a resource slot and force a discard). If it was not declared, they stay and carry over.",
                      keeper:
                        "Most Relic icons, from resources and Guild cards.",
                      empath:
                        "Most Psionic icons, from resources and Guild cards.",
                    }[modal.split(":")[1]]
                  }
                </p>
                <p className="ambition-scoring-note">
                  {game.markers.some((m) => m.ambition === modal.split(":")[1])
                    ? `${game.markers.filter((m) => m.ambition === modal.split(":")[1]).reduce((n, m) => n + m.high, 0)} Power for first · ${game.markers.filter((m) => m.ambition === modal.split(":")[1]).reduce((n, m) => n + m.low, 0)} for second, before leader effects and city bonuses.`
                    : "Undeclared: this ambition currently awards no Power."}
                </p>
                {game.ambitionValues && (
                  <>
                    <p className="ambition-projection-label">
                      Current count <span>Power if scored now</span>
                    </p>
                    <div className="lobby-seats">
                      {game.players.map((p, i) => (
                        <div key={i}>
                          <span style={{ background: p.color }} />
                          {p.name}
                          <b>{game.ambitionValues[modal.split(":")[1]][i]}</b>
                          <small className="projected-award">
                            +
                            {game.ambitionAwards?.[modal.split(":")[1]]?.[i] ??
                              0}{" "}
                            Power
                          </small>
                        </div>
                      ))}
                      {game.players.length === 2 && (
                        <div>
                          Neutral opponent
                          <b>{game.neutral[modal.split(":")[1]]}</b>
                        </div>
                      )}
                    </div>
                  </>
                )}
                <p className="shared-scoring-explanation">
                  The preview includes ties, the neutral opponent in two-player
                  games, city bonuses, and Leader penalties. Standings may
                  change before the chapter ends.
                </p>
                <p>
                  Tied for first: all tied players get second-place Power. Tied
                  for second: no Power. A score of zero never qualifies. City
                  bonuses apply only to an outright first place.
                </p>
              </>
            ) : modal === "dice-guide" ? (
              <BattleGuide game={game} dice={battleDice} />
            ) : modal === "battle" ? (
              <BattleRecord game={game} />
            ) : modal === "scores" ? (
              <>
                <span className="eyebrow gold">CHAPTER RESULTS</span>
                <h2>Power earned</h2>
                {[...(game.scoreHistory ?? [])].reverse().map((chapter) => (
                  <section className="score-chapter" key={chapter.chapter}>
                    <h3>Chapter {chapter.chapter}</h3>
                    {chapter.ambitions.length ? (
                      <div className="score-table-wrap">
                        <table className="score-table">
                          <thead>
                            <tr>
                              <th>Ambition</th>
                              {game.players.map((p) => (
                                <th key={p.id}>{p.name}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {chapter.ambitions.map((a) => (
                              <tr key={a.ambition}>
                                <th>{cap(a.ambition)}</th>
                                {a.awards.map((n, i) => (
                                  <td key={i}>
                                    <strong>+{n}</strong>
                                    <small>{a.values[i]} ambition value</small>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p>No ambitions scored.</p>
                    )}
                  </section>
                ))}
              </>
            ) : modal === "players" ? (
              <aside className="players-panel">
                <div className="panel-heading">
                  COMMANDERS <span>{game.players.length} / 4</span>
                </div>
                {game.players.map((p, i) => (
                  <div
                    key={i}
                    className={`player-panel ${i === (game.decision?.actor ?? game.current) ? "active" : ""}`}
                    style={{ "--player": p.color }}
                  >
                    <button
                      className="player-top"
                      onClick={() => setPlayerDetail(i)}
                    >
                      <div className="player-icon">
                        <Flag size={18} />
                      </div>
                      <div>
                        <strong>
                          {p.name}
                          {i === game.me && live ? " · you" : ""}
                        </strong>
                        <small>
                          {p.leader
                            ? CARDS[p.leader].name
                            : i === game.initiative
                              ? "Holds initiative"
                              : "Commander"}
                          {p.leader && i === game.initiative
                            ? " · initiative"
                            : ""}
                        </small>
                      </div>
                      <span className="power">
                        {p.power}
                        <small>POWER</small>
                      </span>
                    </button>
                    <div className="resource-row">
                      {p.resources.map((r, j) => (
                        <span
                          key={j}
                          className={`resource ${r ?? "empty"}`}
                          title={`${r ?? "Empty slot"} · ${game.resourceKeys?.[i]?.[j] ?? [3, 1, 1, 2, 1, 3, 4][j]} raid keys`}
                        >
                          {r ? <img src={`/assets/${r}.webp`} alt={r} /> : "·"}
                        </span>
                      ))}
                    </div>
                    <div className="player-stats">
                      <span>
                        <Layers size={13} />
                        {typeof p.hand === "number"
                          ? p.hand
                          : p.hand.length}{" "}
                        cards
                      </span>
                      <span title="Trophies">
                        <Trophy size={13} />
                        {p.trophies.length}
                      </span>
                      <span title="Captives">
                        <Users size={13} />
                        {p.captives.length}
                      </span>
                      {p.outrage.length > 0 && (
                        <span
                          title={`Outrage: ${p.outrage.join(", ")}`}
                          className="outrage-small"
                        >
                          !
                        </span>
                      )}
                    </div>
                    {p.outrage.length > 0 && (
                      <div className="outrage-label">
                        Outrage · {p.outrage.map(cap).join(", ")}
                      </div>
                    )}
                    {(p.leader || p.cards.length > 0) && (
                      <div className="player-card-links">
                        {[p.leader, ...p.cards].filter(Boolean).map((id) => (
                          <button
                            key={id}
                            onClick={() => setDetail(id)}
                            title={CARDS[id].name}
                          >
                            <img src={cardImage(id)} alt={CARDS[id].name} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="table-note">
                  <Shield size={19} />
                  <span>
                    {live
                      ? "Your game saves after every action."
                      : "Private rooms. Original cards."}
                    <br />
                    {live
                      ? "Reconnect here to resume."
                      : "Play together in your browser."}
                  </span>
                </div>
                <button
                  className="subtle full"
                  onClick={() => setModal(room ? "lobby" : "welcome")}
                >
                  <Users size={16} />
                  {room ? "Table & invitation" : "Create a table"}
                </button>
              </aside>
            ) : modal === "standings" ? (
              <>
                <h2>Ambitions & Power</h2>
                <div className="table-toolbar">
                  <div className="chapter">
                    <span className="eyebrow">CHAPTER</span>
                    <strong>
                      0{game.chapter}
                      <span> / 05</span>
                    </strong>
                  </div>
                  <div className="chapter-round">
                    <span className="eyebrow">ROUND {game.round}</span>
                    <span>
                      {game.phase === "draft"
                        ? "Leaders & Lore draft"
                        : game.phase === "over"
                          ? "The Reach has a victor"
                          : live
                            ? game.options.leaders
                              ? "Leaders & Lore"
                              : "Base game"
                            : "Explore the table"}
                    </span>
                  </div>
                  <div className="ambitions">
                    {AMBITIONS.map((a, i) => {
                      const marks = game.markers.filter(
                        (m) => m.ambition === a,
                      );
                      return (
                        <button
                          className={`ambition ${marks.length ? "declared" : ""}`}
                          key={a}
                          onClick={() => setModal(`ambition:${a}`)}
                        >
                          <span className="ambition-glyph">
                            {["◇", "♙", "⚔", "✦", "◈"][i]}
                          </span>
                          <span>
                            {cap(a)}
                            <small>
                              {marks.length
                                ? `${marks.reduce((n, m) => n + m.high, 0)} first · ${marks.reduce((n, m) => n + m.low, 0)} second`
                                : "Not declared"}
                            </small>
                            {live && (
                              <span className="ambition-count">
                                You: {game.ambitionValues?.[a]?.[game.me] ?? 0}{" "}
                                · view standings
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="markers">
                    <span className="eyebrow">AVAILABLE</span>
                    <div>
                      {game.markers
                        .filter((m) => !m.ambition)
                        .sort((a, b) => b.high - a.high)
                        .map((m, i) => (
                          <span key={i} className="marker">
                            {m.high}
                            <small>/{m.low}</small>
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              </>
            ) : modal === "journal" ? (
              <>
                <h2>Table history</h2>{" "}
                <p>Everything done in public, grouped by whose turn it was.</p>
                {live && battleList(game).length > 0 && (
                  <button
                    className="score-recap-button"
                    onClick={() => setModal("battle")}
                  >
                    <Swords size={15} /> Review latest battle dice{" "}
                    <ChevronRight size={14} />
                  </button>
                )}
                {live && game.scoreHistory?.length > 0 && (
                  <button
                    className="score-recap-button"
                    onClick={() => setModal("scores")}
                  >
                    <Trophy size={15} /> Chapter{" "}
                    {game.scoreHistory.at(-1).chapter} results{" "}
                    <ChevronRight size={14} />
                  </button>
                )}
                <div className="activity">
                  <div className="panel-heading">
                    TABLE LOG{" "}
                    <span>{live ? `${game.log.length} EVENTS` : "LIVE"}</span>
                  </div>
                  <div className="log-entries" ref={logRef}>
                    {game.log.length ? (
                      groupTurns(game).map((turn) => (
                        <section className="turn-group" key={turn.key}>
                          <h4>
                            {turn.legacy
                              ? "Earlier events"
                              : `Chapter ${turn.chapter} · round ${turn.round} · ${turn.name}'s turn`}
                          </h4>
                          {turn.entries.map((entry) => (
                            <p key={entry.id}>
                              <span>
                                {entry.id.toString().padStart(2, "0")}
                              </span>
                              {entry.automatic && (
                                <small className="automatic-move">AI · </small>
                              )}
                              {entry.text}
                            </p>
                          ))}
                        </section>
                      ))
                    ) : (
                      <>
                        <p>Every action tells a story.</p>
                        <span>Your game’s history will appear here.</span>
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : modal === "system" && selected ? (
              <>
                {" "}
                {selected && (
                  <div className="inspect">
                    <button
                      className="inspect-close"
                      onClick={() => {
                        setSelected(null);
                        setModal(null);
                      }}
                      aria-label="Close system inspection"
                    >
                      <X size={13} />
                    </button>
                    <span className="eyebrow">SYSTEM SELECTED</span>
                    <h3>
                      Sector {MAP[selected].cluster} ·{" "}
                      {cap(MAP[selected].symbol)}
                    </h3>
                    {live && (
                      <p>
                        {game.controls?.[selected] == null
                          ? "Uncontrolled"
                          : `Controlled by ${game.players[game.controls[selected]].name}`}
                      </p>
                    )}
                    <p>
                      {cap(
                        game.overrides?.[selected] ?? MAP[selected].resource,
                      ) ?? "Transit gate"}
                      {MAP[selected].slots
                        ? ` · ${MAP[selected].slots} building slots`
                        : ""}
                    </p>
                    {game.players
                      .filter((p) =>
                        game.pieces.some(
                          (v) => v.owner === p.id && v.system === selected,
                        ),
                      )
                      .map((p) => (
                        <div
                          key={p.id}
                          className="inspect-force"
                          style={{ color: p.color }}
                        >
                          <Ship size={16} />
                          {p.name}
                          <div className="force-breakdown">
                            {["ship", "city", "starport"].map((type) => {
                              const pieces = game.pieces.filter(
                                (v) =>
                                  v.owner === p.id &&
                                  v.system === selected &&
                                  v.type === type,
                              );
                              if (!pieces.length) return null;
                              return (
                                <span key={type}>
                                  <img src={sprite(p.id, type)} alt="" />
                                  <b>
                                    {pieces.length}{" "}
                                    {type === "city"
                                      ? pieces.length === 1
                                        ? "city"
                                        : "cities"
                                      : `${type}${pieces.length === 1 ? "" : "s"}`}
                                  </b>
                                  <small>
                                    {pieces.filter((v) => v.damaged).length}{" "}
                                    damaged
                                  </small>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    <p className="control-help">
                      Control requires strictly more fresh ships than each
                      rival. Ties leave the system uncontrolled.
                    </p>
                    {!game.pieces.some((v) => v.system === selected) && (
                      <p className="empty-system">No pieces in this system.</p>
                    )}
                  </div>
                )}
              </>
            ) : modal === "timers" && room ? (
              <TurnTimers
                room={room}
                onControl={(input) => control("timer", input)}
                busy={busy}
                error={timerError}
              />
            ) : modal === "settings" ? (
              <>
                <span className="eyebrow gold">YOUR TABLE</span>
                <h2>Table settings</h2>
                <button
                  className="reference-link full"
                  aria-pressed={sound}
                  onClick={() => {
                    setSound(!sound);
                    writeSound(!sound);
                  }}
                >
                  {sound ? "Your-turn chime: on" : "Your-turn chime: muted"}
                  {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
                {room && (
                  <>
                    <button
                      className="reference-link full"
                      onClick={() => setModal("lobby")}
                    >
                      Table & invitation
                      <Users size={18} />
                    </button>
                    <button
                      className="reference-link full"
                      onClick={() => setModal("timers")}
                    >
                      Turn timers <span>◷</span>
                    </button>
                    <button
                      className="reference-link full"
                      onClick={exportJournal}
                    >
                      Download your game journal
                      <Download size={18} />
                    </button>
                  </>
                )}
                <button
                  className="reference-link full"
                  onClick={() => setModal("welcome")}
                >
                  Create another table
                  <Plus size={18} />
                </button>
                <p className="credits">
                  Unofficial, independent implementation for private play. Arcs
                  was designed by Cole Wehrle and illustrated by Kyle Ferrin.
                  Game artwork © Buried Giant Studios. Rules data cross-checked
                  with the official rulebook, card library, and MIT-licensed HRF
                  implementation.
                </p>
              </>
            ) : (
              <>
                <span className="eyebrow gold">THE PLAYER AID</span>
                <h2>A guide to the Reach</h2>
                <div className="rule-grid">
                  {Object.entries(SUITS).map(([s, a]) => (
                    <div key={s} className={`rule-suit ${s}`}>
                      <strong>{cap(s)}</strong>
                      <span>{a.map(cap).join(" · ")}</span>
                    </div>
                  ))}
                </div>
                <p>
                  Lead with any card. Surpass with a higher card matching the
                  lead suit to use all its pips. Copy with a face-down card for
                  one lead-suit action, or pivot to a different suit for one
                  action.
                </p>
                <p>
                  Declare or seize before taking actions. Spend resources and
                  use Prelude abilities before spending your first action pip.
                  The most fresh ships controls a system; ties mean no control.
                </p>
                <p>
                  On the map, inspect a system to see its forces. Use the
                  command panel to choose legal targets. During combat, the
                  attacker chooses dice and assigns every hit; defenders are
                  prompted only for their own card abilities.
                </p>
                <a
                  className="reference-link"
                  href="https://buriedgiant.com/arcs/Arcs_Base_Rulebook.pdf"
                  target="_blank"
                  rel="noreferrer"
                >
                  Base rulebook <ArrowUpRight size={18} />
                </a>
                <a
                  className="reference-link"
                  href="https://buriedgiant.com/arcs/Arcs_Aid_Booklet.pdf"
                  target="_blank"
                  rel="noreferrer"
                >
                  Official player aid <ArrowUpRight size={18} />
                </a>
                <a
                  className="reference-link"
                  href="https://rules.buriedgiant.com/?product=arcs&locale=en-US&printing=p1"
                  target="_blank"
                  rel="noreferrer"
                >
                  Searchable rules & clarifications <ArrowUpRight size={18} />
                </a>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
