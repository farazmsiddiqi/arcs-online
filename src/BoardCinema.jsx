import { Component, useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { cinematicPlan, scenePhase } from "./cinematicPlan.js";
import { useCinematics, writeCinematics } from "./useCinematics.js";
import { playCue } from "./gameAudio.js";
const sprite = (p) =>
  `/assets/${["r", "y", "b", "w"][p.owner]}-${p.type}${p.damaged ? "-damaged" : ""}.webp`;

function CinemaDirector({ game, enabled = true }) {
  const preference = useCinematics(),
    previous = useRef(game),
    [scene, setScene] = useState(null),
    [step, setStep] = useState(0);
  useEffect(() => {
    const before = previous.current;
    previous.current = game;
    if (
      !enabled ||
      !preference ||
      document.hidden ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setScene(null);
      return;
    }
    const next = cinematicPlan(before, game);
    // Replace rather than queue: rapid moves can never leave a stale movie backlog.
    if (next) {
      setStep(0);
      setScene(next);
    } else if (game._replay || game.log?.at(-1)?.history) setScene(null);
  }, [game.revision, enabled, preference]);
  useEffect(() => {
    if (!scene) return;
    const timers = [
      setTimeout(() => setStep(1), scene.duration * 0.23),
      setTimeout(() => setStep(2), scene.duration * 0.7),
      setTimeout(() => setScene(null), scene.duration),
    ];
    // Accent lands with the visual impact, using the existing mute/volume bus.
    if (["battle", "destroy", "damage"].includes(scene.kind))
      timers.push(
        setTimeout(
          () => playCue(scene.kind === "destroy" ? "destroy" : "battle"),
          scene.duration * 0.3,
        ),
      );
    const dismiss = (e) => {
      if (e.type === "visibilitychange" && !document.hidden) return;
      if (e.type === "keydown" && e.key !== "Escape") return;
      if (e.type === "keydown") {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      setScene(null);
    };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    document.addEventListener("keydown", dismiss, true);
    document.addEventListener("visibilitychange", dismiss);
    reduced.addEventListener("change", dismiss);
    return () => {
      timers.forEach(clearTimeout);
      document.removeEventListener("keydown", dismiss, true);
      document.removeEventListener("visibilitychange", dismiss);
      reduced.removeEventListener("change", dismiss);
    };
  }, [scene]);
  if (!scene) return null;
  return createPortal(
    <section
      className={`board-cinema cinema-${scene.kind}`}
      aria-label={`${scene.title} cinematic`}
      style={{
        "--scene-time": `${scene.duration}ms`,
        "--fleet-color": scene.color,
      }}
    >
      <CinematicStage key={scene.id} scene={scene} />
      <div className="cinema-vignette" />
      <header className="cinema-heading">
        <span>
          {scene.system
            ? `SECTOR ${scene.system.replace("-", " · ").toUpperCase()}`
            : "THE COURT · THE REACH"}
        </span>
        <h2>{scene.title}</h2>
        <p>
          {scene.name}
          {scene.kind === "battle" && scene.rival ? ` vs ${scene.rival}` : ""}
        </p>
      </header>
      <div className="cinema-controls">
        <button
          onClick={() => {
            writeCinematics(false);
            setScene(null);
          }}
        >
          Quick effects
        </button>
        <button onClick={() => setScene(null)}>
          Skip scene <kbd>Esc</kbd>
        </button>
      </div>
      <footer className="cinema-caption">
        <span key={step}>{scenePhase(scene, step)}</span>
        {step === 2 && <p>{scene.summary}</p>}
        <small>Live play continues · No input required for this scene</small>
        <div className="cinema-progress" key={scene.id} />
      </footer>
    </section>,
    document.body,
  );
}
function CinematicStage({ scene: s }) {
  const uid = useId().replace(/:/g, ""),
    battle = ["battle", "damage", "destroy"].includes(s.kind),
    industry = ["build", "repair"].includes(s.kind);
  const left = s.pieces
      .filter((p) => p.owner === s.owner && p.type === "ship")
      .slice(0, 8),
    right = s.pieces
      .filter((p) => p.owner === s.defender)
      .sort(
        (a, b) => Number(b.id === s.target?.id) - Number(a.id === s.target?.id),
      )
      .slice(0, 8);
  const ships =
    s.kind === "move"
      ? s.pieces.slice(0, 12)
      : s.owner === s.defender
        ? []
        : left;
  const target = s.target ?? right[0];
  return (
    <svg
      className="cinema-stage"
      viewBox="0 0 1440 800"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${uid}nebula`}>
          <stop stopColor={s.world?.color ?? s.color} stopOpacity=".35" />
          <stop offset="1" stopColor="#0a1014" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}blast`}>
          <stop stopColor="#fff6ce" />
          <stop offset=".25" stopColor="#ffc873" />
          <stop offset="1" stopColor="#e35429" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${uid}planet`}>
          <circle cx="1060" cy="480" r="285" />
        </clipPath>
      </defs>
      <rect width="1440" height="800" fill="#0a1014" />
      <ellipse
        cx="1000"
        cy="460"
        rx="880"
        ry="600"
        fill={`url(#${uid}nebula)`}
      />
      <g className="cinema-starfield">
        {Array.from({ length: 55 }, (_, i) => (
          <circle
            key={i}
            cx={(i * 197 + 43) % 1440}
            cy={(i * 131 + 17) % 800}
            r={i % 7 === 0 ? 2 : 1}
            fill="#e9d9b3"
            opacity={0.15 + (i % 5) * 0.1}
          />
        ))}
      </g>
      {s.world && (
        <g className="cinema-world">
          <circle
            cx="1060"
            cy="480"
            r="298"
            fill="none"
            stroke={s.world.color}
            strokeWidth="2"
            opacity=".4"
          />
          <g clipPath={`url(#${uid}planet)`}>
            <svg
              x="775"
              y="195"
              width="570"
              height="570"
              viewBox={`${s.world.x - 115} ${s.world.y - 115} 230 230`}
            >
              <image
                href="/assets/map-no-slots.webp"
                width="2528"
                height="1776"
              />
            </svg>
            <circle cx="1140" cy="480" r="295" fill="#070c12" opacity=".38" />
          </g>
          <ellipse
            cx="1060"
            cy="480"
            rx="385"
            ry="100"
            transform="rotate(-25 1060 480)"
            stroke={s.world.color}
            strokeWidth="2"
            fill="none"
            opacity=".25"
          />
        </g>
      )}
      <g className="cinema-shot">
        {(battle || s.kind === "move") && (
          <>
            <g
              className={
                s.kind === "move" ? "cinema-transit" : "cinema-attack-fleet"
              }
            >
              {ships.map((p, i) => (
                <g
                  key={p.id}
                  transform={`translate(${210 + (i % 3) * 120} ${330 + Math.floor(i / 3) * 100})`}
                >
                  <path
                    className="cinema-engine"
                    d="M-40 0L-190 -18L-135 0L-190 18Z"
                    fill="#a8deed"
                  />
                  <image
                    href={sprite(p)}
                    x="-55"
                    y="-46"
                    width="110"
                    height="94"
                  />
                </g>
              ))}
            </g>
            {battle && (
              <g className="cinema-defend-fleet">
                {right.map((p, i) => (
                  <g
                    key={p.id}
                    transform={`translate(${1010 + (i % 3) * 90} ${400 + Math.floor(i / 3) * 90})`}
                  >
                    <image
                      className={
                        s.kind === "destroy" && p.id === s.target?.id
                          ? "cinema-destroyed"
                          : undefined
                      }
                      href={sprite(p)}
                      x="-50"
                      y="-43"
                      width="100"
                      height="86"
                    />
                  </g>
                ))}
              </g>
            )}
            {battle &&
              s.owner !== s.defender &&
              (s.kind === "battle"
                ? s.dice.length > 0 && ships.length > 0
                : ships.length > 0) && (
                <g className="cinema-volley">
                  {Array.from(
                    { length: Math.min(15, ships.length * 3) },
                    (_, i) => (
                      <path
                        key={i}
                        className="cinema-bolt"
                        style={{ animationDelay: `${0.7 + i * 0.105}s` }}
                        d={`M${250 + ((i % ships.length) % 3) * 120} ${330 + Math.floor((i % ships.length) / 3) * 100} L${1010 + ((i % Math.max(1, right.length)) % 3) * 90} ${400 + Math.floor((i % Math.max(1, right.length)) / 3) * 90}`}
                        pathLength="100"
                        fill="none"
                        stroke={i % 3 ? "#f6d69b" : "#c1e6ed"}
                        strokeWidth={i % 3 ? 4 : 7}
                      />
                    ),
                  )}
                  <ellipse
                    className="cinema-shield"
                    cx="1010"
                    cy="400"
                    rx="210"
                    ry="170"
                    fill="none"
                    stroke="#9cd6e3"
                    strokeWidth="3"
                  />
                </g>
              )}
            {s.kind === "move" && (
              <g className="cinema-speedlines">
                {Array.from({ length: 18 }, (_, i) => (
                  <path
                    key={i}
                    d={`M${i * 97} ${180 + ((i * 67) % 440)}h${90 + i * 7}`}
                    stroke="#b7d7d5"
                    strokeWidth="2"
                    opacity=".24"
                  />
                ))}
              </g>
            )}
          </>
        )}
        {["destroy", "damage"].includes(s.kind) && (
          <g transform="translate(1010 400)">
            {target && !right.some((p) => p.id === target.id) && (
              <image
                className={s.kind === "destroy" ? "cinema-destroyed" : ""}
                href={sprite(target)}
                x="-85"
                y="-85"
                width="170"
                height="170"
              />
            )}
            <circle
              className="cinema-impact"
              r="190"
              fill={`url(#${uid}blast)`}
            />
            <circle
              className="cinema-shockwave"
              r="80"
              fill="none"
              stroke="#f6d6a1"
              strokeWidth="7"
            />
            {s.kind === "destroy" &&
              Array.from({ length: 20 }, (_, i) => (
                <g key={i} transform={`rotate(${i * 137.5})`}>
                  <path
                    className="cinema-debris"
                    d="M20 0L70 0"
                    stroke={i % 2 ? "#ffc285" : "#d78962"}
                    strokeWidth={3 + (i % 4)}
                  />
                </g>
              ))}
          </g>
        )}
        {industry && s.target && (
          <g transform="translate(600 410)">
            <ellipse
              className="cinema-dock-ring"
              rx="240"
              ry="90"
              cy="90"
              stroke="#a9dedc"
              strokeWidth="3"
              fill="#8fbbce10"
            />
            <path
              className="cinema-scaffold"
              d="M-170 110V-160H170V110 M-170 -80H170 M-170 10H170 M-85 -160V110 M85 -160V110"
              stroke="#9cc8cc"
              strokeWidth="3"
              fill="none"
            />
            <image
              className="cinema-fabricated"
              href={sprite(s.target)}
              x="-135"
              y="-120"
              width="270"
              height="240"
            />
            <path
              className="cinema-weld"
              d="M-190 0H190"
              stroke="#c3f2ed"
              strokeWidth="7"
            />
            {Array.from({ length: 10 }, (_, i) => (
              <circle
                key={i}
                className="cinema-weld-spark"
                cx={-160 + i * 35}
                cy={(i % 3) * 45 - 50}
                r="5"
                fill="#ffdf9a"
                style={{ animationDelay: `${i * 0.13}s` }}
              />
            ))}
          </g>
        )}
        {["tax", "raid"].includes(s.kind) && (
          <g className="cinema-extraction">
            <path d="M900 570L480 180H720L1110 570Z" fill="#e7c58a14" />
            <path
              className="cinema-beam"
              d="M920 555L515 210 M1070 555L685 210"
              stroke="#e6cf9c"
              strokeWidth="3"
            />
            {Array.from({ length: Math.min(5, s.cargoCount) }, (_, i) => (
              <image
                key={i}
                className="cinema-cargo"
                style={{ animationDelay: `${i * 0.12}s` }}
                href={
                  s.resource
                    ? `/assets/${s.resource}.webp`
                    : "/assets/card-back.webp"
                }
                x={890 + i * 48}
                y="480"
                width="80"
                height="80"
              />
            ))}
            <path
              d="M430 170L610 130L760 170L625 200Z"
              fill="#37484c"
              stroke="#dfcba2"
              strokeWidth="3"
            />
          </g>
        )}
        {s.card && (
          <g className="cinema-court-card">
            <image
              href={`/assets/cards/${s.card.id}.webp`}
              x="610"
              y="175"
              width="220"
              height="330"
            />
            {s.kind === "influence" &&
              Array.from({ length: Math.min(6, s.count ?? 1) }, (_, i) => (
                <image
                  className="cinema-agent"
                  key={i}
                  href={sprite({ owner: s.owner, type: "agent" })}
                  x={500 + i * 50}
                  y="480"
                  width="55"
                  height="70"
                />
              ))}
          </g>
        )}
        {["score", "ambition", "reshape"].includes(s.kind) && (
          <g className="cinema-emblem" transform="translate(720 390)">
            <circle
              r="150"
              stroke="#dfc58f"
              strokeWidth="2"
              strokeDasharray="2 14"
              fill="#dfc58f08"
            />
            <path
              d="M0 -100L28 -28L100 0L28 28L0 100L-28 28L-100 0L-28 -28Z"
              fill="#e5c78f"
            />
          </g>
        )}
      </g>
      {s.dice.length > 0 && (
        <g className="cinema-dice">
          {s.dice.map((d, i) => (
            <g
              key={i}
              transform={`translate(${720 - s.dice.length * 58 + i * 116} 580)`}
            >
              <rect
                x="-48"
                y="-32"
                width="96"
                height="100"
                rx="10"
                fill="#17232b"
                stroke={
                  d.type === "raid"
                    ? "#bb929d"
                    : d.type === "assault"
                      ? "#ccad85"
                      : "#94b6c3"
                }
                strokeWidth="2"
              />
              <text textAnchor="middle" y="-5" fill="#d6c8ad" fontSize="13">
                {d.type.toUpperCase()}
              </text>
              {(d.faces.length ? d.faces : ["blank"]).map((face, j) => (
                <text
                  key={j}
                  textAnchor="middle"
                  y={18 + j * 17}
                  fill="#fff0d0"
                  fontSize="13"
                >
                  {{
                    hit: "Ship hit",
                    self: "Self hit",
                    building: "Building hit",
                    intercept: "Intercept",
                    key: "Raid key",
                    blank: "Blank",
                  }[face] ?? face}
                </text>
              ))}
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

// A presentation failure must never take the game or its controls down.
class CinemaBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.warn("Cinematic skipped after a presentation error", error);
  }
  componentDidUpdate(previous) {
    if (this.state.failed && previous.revision !== this.props.revision)
      this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export default function BoardCinema(props) {
  return (
    <CinemaBoundary revision={props.game.revision}>
      <CinemaDirector {...props} />
    </CinemaBoundary>
  );
}
