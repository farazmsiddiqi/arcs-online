// Shared mention vocabulary. References never expose anything outside the public snapshot.
export const STATE_MENTIONS = [
  [
    "draft",
    "Draft options",
    "Available Leaders and Lore in the shared draft",
    ["draft"],
  ],
  ["board", "Board", "Public map, pieces, and control", ["systems", "pieces"]],
  [
    "turn",
    "Current turn",
    "Whose turn, current stage, and remaining pips",
    ["currentPlayer", "activity", "turn"],
  ],
  [
    "lead",
    "Lead card",
    "The lead, zero marker, and cards played",
    ["lead", "played"],
  ],
  [
    "ambitions",
    "Ambitions",
    "Declarations, markers, and current standings",
    ["markers", "ambitionValues", "ambitionAwards", "neutralAmbitionRival"],
  ],
  ["court", "Court", "Face-up Court cards and agents", ["court", "cardNames"]],
  [
    "battle",
    "Battle",
    "Current or most recent public battle",
    ["battle", "lastBattle"],
  ],
  [
    "resources",
    "Resources",
    "Stored resources and common supply",
    ["players", "supply"],
  ],
  ["scores", "Scores", "Current public Power totals", ["players"]],
];
export function chatMentionOptions(players = []) {
  const fixed = [
    {
      id: "arcy",
      token: "@arcy",
      label: "Arcy",
      kind: "referee",
      description: "Rules referee · no strategy advice",
    },
    ...STATE_MENTIONS.map(([id, label, description, fields]) => ({
      id,
      token: `@${id}`,
      label,
      description,
      fields,
      kind: "state",
    })),
  ];
  const reserved = new Set([
    ...fixed.map((x) => x.token.toLowerCase()),
    ...players.map((p, i) => `@player${(p.id ?? i) + 1}`),
  ]);
  const seats = players.map((p, i) => {
    const id = p.id ?? i,
      name = p.name ?? `Player ${id + 1}`;
    const token =
      reserved.has(`@${name}`.toLowerCase()) ||
      name.includes("@") ||
      /^arcy(?:[^\p{L}\p{N}_]|$)/iu.test(name)
        ? `@player${id + 1}`
        : `@${name}`;
    reserved.add(token.toLowerCase());
    return {
      id: `player-${id}`,
      playerId: id,
      token,
      label: name,
      description: `Player ${id + 1} · public play area`,
      kind: "player",
    };
  });
  return [fixed[0], ...seats, ...fixed.slice(1)];
}
export function mentionQuery(text, caret = text.length) {
  const match = text.slice(0, caret).match(/(?:^|[\s([{])@([^\s@]*)$/u);
  return match
    ? { start: caret - match[1].length - 1, end: caret, query: match[1] }
    : null;
}
export function filterMentions(options, query) {
  const q = query.toLowerCase();
  return options.filter((o) =>
    `${o.token} ${o.label} ${o.description}`.toLowerCase().includes(q),
  );
}
export function mentionSegments(text, options) {
  const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])(${options
      .map((o) => escaped(o.token))
      .sort((a, b) => b.length - a.length)
      .join("|")})(?![\\p{L}\\p{N}_])`,
    "giu",
  );
  const byToken = new Map(options.map((o) => [o.token.toLowerCase(), o]));
  const out = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], mention: byToken.get(m[0].toLowerCase()) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
export function resolveChatMentions(text, players) {
  return [
    ...new Map(
      mentionSegments(text, chatMentionOptions(players))
        .filter((s) => s.mention)
        .map((s) => [s.mention.id, s.mention]),
    ).values(),
  ];
}

export function isPlayerMention(message, seat, players) {
  return (
    !message.private &&
    message.role === "player" &&
    message.seat !== seat &&
    resolveChatMentions(message.text, players).some(
      (m) => m.kind === "player" && m.playerId === seat,
    )
  );
}
