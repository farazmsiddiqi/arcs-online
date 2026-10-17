import book from "../data/arcy-rules.json" with { type: "json" };
import faq from "../data/faq.json" with { type: "json" };
import errata from "../data/errata.json" with { type: "json" };
import { CARDS } from "../game/data.js";

// Publisher content is indexed locally: no third-party search service, remote
// vector store, or player messages mixed into the trusted rule corpus.
export const plainRules = (text = "") =>
  text
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\$link:([^$]+)\$/g, "$1")
    .replace(/`rule-relative:([^`]+)`/g, "$1")
    .replace(/`rule:([^`]+)`/g, "§$1")
    .replace(/`symbol:([^`]+)`/g, "[$1]")
    .replace(/[*_`]/g, "")
    .replace(/&amp;/g, "&")
    .trim();
const flatten = (node, number) =>
  [
    `${number} ${node.name}`,
    plainRules(node.pretext),
    plainRules(node.text),
    ...(node.children ?? []).map((child, i) =>
      flatten(child, `${number}.${i + 1}`),
    ),
  ]
    .filter(Boolean)
    .join("\n");
const ruleLink = (number) => `${book.source}#${number.replace(/\.+$/, "")}.`;
const corpus = [];
for (const section of book.rules) {
  // Keep action steps and their exceptions together rather than cutting at
  // arbitrary token boundaries. This is particularly important for Battle.
  if (section.children?.length)
    section.children.forEach((node, i) => {
      const number = `${section.number}.${i + 1}`;
      if (["2.4", "3.2", "3.3"].includes(number)) return; // Campaign-only setup/Fates.
      corpus.push({
        id: `rule-${number}`,
        title: `§${number} · ${section.name} / ${node.name}`,
        kind: "rulebook",
        url: ruleLink(number),
        text: [plainRules(section.pretext), flatten(node, number)]
          .filter(Boolean)
          .join("\n"),
      });
    });
  else
    corpus.push({
      id: `rule-${section.number}`,
      title: `§${section.number} · ${section.name}`,
      kind: "rulebook",
      url: ruleLink(section.number),
      text: flatten(section, section.number),
    });
}
for (const [kind, items] of [
  ["faq", book.faq],
  ["errata", book.errata],
])
  items.forEach((item, i) =>
    corpus.push({
      id: `book-${kind}-${i + 1}`,
      title: `${kind === "faq" ? "Official FAQ" : "Official errata"} · §${item.rules.join(", §")}`,
      kind,
      url: ruleLink(item.rules[0]),
      text: plainRules([item.q, item.a, item.text].filter(Boolean).join("\n")),
    }),
  );
for (const card of Object.values(CARDS).filter((c) => c.text)) {
  const related = (items, kind) =>
    items.find((x) => x.card === card.name)?.[kind] ?? [];
  corpus.push({
    id: `card-${card.id}`,
    title: card.name,
    kind: "card",
    cardId: card.id,
    url: `https://cards.buriedgiant.com/?q=${encodeURIComponent(card.name)}`,
    text: `${card.name} (${card.kind})\n${plainRules(card.text)}`,
  });
  for (const [kind, items] of [
    ["faq", related(faq, "faq")],
    ["errata", related(errata, "errata")],
  ])
    items.forEach((item, i) =>
      corpus.push({
        id: `${kind}-${card.id}-${i + 1}`,
        title: `${card.name} · official ${kind === "faq" ? "FAQ" : "errata"}`,
        kind,
        cardId: card.id,
        url: `https://cards.buriedgiant.com/?q=${encodeURIComponent(card.name)}`,
        text: plainRules(
          [item.q, item.a, item.text].filter(Boolean).join("\n"),
        ),
      }),
    );
}
export const ARCY_SOURCES = Object.freeze(corpus);
export const SOURCE_BY_ID = new Map(corpus.map((s) => [s.id, s]));
export const CORPUS_VERSION = `${book.publisherRevision}; retrieved ${book.retrievedAt}`;
const stop = new Set(
  "a an the of to on in at for from can could would should is are was be been it its this that with and or if do does did i my me we our you your they their them have has how what why when which who as not".split(
    " ",
  ),
);
export const tokens = (text) =>
  plainRules(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .match(/[a-z0-9]+/g)
    ?.filter((t) => !stop.has(t))
    .map((t) => (t.length > 4 ? t.replace(/(?:ing|ed|s)$/, "") : t)) ?? [];
const synonyms = [
  ["fight", "combat", "attack", "battle", "dice", "defender"],
  ["zero", "0", "declare", "declaration", "ambition", "lead"],
  ["win", "victory", "vp", "score", "power", "scoring"],
  ["tie", "tied", "equal", "tiebreaker"],
  ["money", "resources", "spend", "prelude"],
  ["steal", "raid", "keys", "slot"],
  ["move", "catapult", "adjacent", "gate"],
  ["destroy", "damage", "hit", "fresh"],
  ["turn", "prelude", "action", "pip"],
];
const docs = corpus.map((source) => {
  const words = tokens(`${source.title} ${source.title} ${source.text}`),
    frequencies = new Map();
  words.forEach((w) => frequencies.set(w, (frequencies.get(w) ?? 0) + 1));
  return { source, frequencies, length: words.length };
});
const average = docs.reduce((n, d) => n + d.length, 0) / docs.length;
const df = new Map();
docs.forEach((d) =>
  d.frequencies.forEach((_, word) => df.set(word, (df.get(word) ?? 0) + 1)),
);
export function searchRules(query, { limit = 10 } = {}) {
  const direct = new Set(tokens(String(query).slice(0, 4000))),
    expanded = new Set(direct);
  synonyms.forEach((group) => {
    if (group.some((w) => direct.has(tokens(w)[0])))
      group.forEach((w) => tokens(w).forEach((t) => expanded.add(t)));
  });
  const lower = query.toLowerCase();
  const matchedCards = Object.values(CARDS)
    .filter((c) => lower.includes(c.name.toLowerCase()))
    .map((c) => c.id);
  return docs
    .map((d) => {
      let score = 0;
      for (const term of expanded) {
        const f = d.frequencies.get(term) ?? 0;
        if (!f) continue;
        const idf = Math.log(
          1 + (docs.length - df.get(term) + 0.5) / (df.get(term) + 0.5),
        );
        score +=
          ((idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * d.length) / average))) *
          (direct.has(term) ? 1 : 0.18);
      }
      score *= d.source.kind === "rulebook" ? 1.6 : d.source.cardId ? 0.65 : 1;
      if (matchedCards.includes(d.source.cardId)) score += 25;
      return { ...d.source, score };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, Math.min(limit, 16)))
    .map(({ score, ...source }) => source);
}
export function initialSources(question, context, recentQuestions = "") {
  const ids = new Set(["rule-22.3", "rule-22.4", "rule-22.7", "rule-22.8"]);
  const activeCards = new Set(
    context.players
      ?.flatMap((p) => [p.leader, ...(p.cards ?? [])])
      .filter(Boolean) ?? [],
  );
  const result = [
    ...searchRules(question, { limit: 12 }),
    ...searchRules(`${recentQuestions} ${context.activity?.label ?? ""}`, {
      limit: 5,
    }),
    ...corpus.filter((s) => ids.has(s.id) || activeCards.has(s.cardId)),
  ];
  return [...new Map(result.map((s) => [s.id, s])).values()];
}
