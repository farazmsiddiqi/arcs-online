import { cardImage } from "./Cards.jsx";
// Decorative transfers are anchored to actual rendered pieces and player areas.
// They never intercept clicks, alter state, or expose private card identities.
export function tokenMotion(changes, events, game, scope) {
  if (!scope || matchMedia("(prefers-reduced-motion: reduce)").matches)
    return () => {};
  const scopeRoot = scope.closest("[data-animation-scope]") ?? scope;
  const all = (selector) =>
    [...scope.querySelectorAll(selector)].filter(
      (el) => el.closest("[data-animation-scope]") === scopeRoot,
    );
  const point = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? [r.x + r.width / 2, r.y + r.height / 2] : null;
  };
  const player = (owner) => {
    const els = all(`[data-player-area="${owner}"]`);
    return (
      els.find((el) => {
        const r = el.getBoundingClientRect();
        return (
          !el.classList.contains("round-seat") &&
          r.bottom > 0 &&
          r.y < innerHeight
        );
      }) ?? els[0]
    );
  };
  const tasks = [];
  const tax = events
    .filter((e) => e.animation?.kind === "tax")
    .map((e) => e.animation);
  for (const e of tax)
    if (e.resource && e.gained !== false)
      tasks.push({
        from:
          all(`[data-piece="${e.piece}"]`)[0] ??
          all(`[data-system="${e.system}"]`)[0],
        to: player(e.owner),
        src: `/assets/${e.resource}.webp`,
        reverse: game._replay?.direction < 0,
      });
  for (const c of changes) {
    if (
      c.kind === "play" &&
      c.cardMove &&
      c.played &&
      (c.returning || !game._replay || game._replay.direction > 0)
    ) {
      const seat = c.played.player;
      tasks.push({
        from: player(seat),
        to: all(`.round-seat[data-player-area="${seat}"]`)[0],
        src:
          c.played.faceup && c.played.card
            ? cardImage(c.played.card)
            : "/assets/card-back.webp",
        card: true,
        reverse: !!c.returning,
      });
    }

    if (
      c.kind === "resource" &&
      !tax.some((t) => t.owner === c.owner && t.resource === c.resource)
    )
      tasks.push({
        from:
          c.delta > 0
            ? all(`[data-supply-resource="${c.resource}"]`)[0]
            : player(c.owner),
        to:
          c.delta > 0
            ? player(c.owner)
            : all(`[data-supply-resource="${c.resource}"]`)[0],
        src: `/assets/${c.resource}.webp`,
      });
    if (c.kind === "influence")
      tasks.push({
        from: player(c.owner),
        to: all(`[data-court-slot="${c.index}"]`)[0],
        src: `/assets/${["r", "y", "b", "w"][c.owner]}-agent.webp`,
        reverse: c.delta < 0,
      });
  }
  for (const e of events)
    if (e.animation?.kind === "secure")
      tasks.push({
        from: all(`[data-court-slot="${e.animation.index}"]`)[0],
        to: player(e.animation.owner),
        src: cardImage(e.animation.card),
        card: true,
        reverse: game._replay?.direction < 0,
      });
  const cleanup = [];
  for (const task of tasks.slice(0, 12)) {
    let from = point(task.from),
      to = point(task.to);
    if (!from || !to) continue;
    if (task.reverse) [from, to] = [to, from];
    const img = document.createElement("img");
    img.src = task.src;
    img.alt = "";
    img.className = `table-token-flight ${task.card ? "card-transfer" : ""}`;
    img.setAttribute("aria-hidden", "true");
    document.body.appendChild(img);
    const transform = (p, scale, rotate) =>
      `translate(${p[0]}px,${p[1]}px) translate(-50%,-50%) scale(${scale}) rotate(${rotate}deg)`;
    const animation = img.animate(
      [
        { transform: transform(from, 0.7, -12), opacity: 0 },
        { transform: transform(from, 1.25, 0), opacity: 1, offset: 0.18 },
        {
          transform: transform(
            [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 55],
            1.2,
            10,
          ),
          opacity: 1,
          offset: 0.55,
        },
        { transform: transform(to, 0.65, 0), opacity: 0 },
      ],
      { duration: 1450, easing: "cubic-bezier(.2,.7,.3,1)" },
    );
    const remove = () => {
      animation.cancel();
      img.remove();
    };
    animation.onfinish = remove;
    cleanup.push(remove);
  }
  return () => cleanup.forEach((fn) => fn());
}
