// Publisher FAQ and errata are keyed by card name (or `ARCS-<id>`).
const matches = (e, card, id) =>
  e.card === card?.name || e.card === `ARCS-${id}`;
export function clarificationsFor(card, id, sources) {
  return {
    errata: sources.errata.filter((e) => matches(e, card, id)),
    faq: sources.faq.filter((e) => matches(e, card, id)).flatMap((e) => e.faq),
  };
}
const plain = (s) =>
  (s ?? "")
    .replace(/\$link:([^$]+)\$/g, "$1")
    .replaceAll("*", "")
    .replaceAll("`", "");
// Lower-cased text of every clarification on a card, for library search.
export function clarificationSearchText(card, id, sources) {
  const { errata: er, faq: fq } = clarificationsFor(card, id, sources);
  return [
    ...er.flatMap((e) => e.errata.map((x) => plain(x.text))),
    ...fq.flatMap((f) => [plain(f.q), plain(f.a)]),
  ]
    .join(" ")
    .toLowerCase();
}
export function hasClarifications(card, id, sources) {
  const c = clarificationsFor(card, id, sources);
  return c.errata.length + c.faq.length > 0;
}
// Splits text on $link:Name$ references into plain and link parts. `resolve`
// maps a card name to a card id; unknown names stay plain text.
export function linkParts(text, resolve) {
  const parts = [];
  let last = 0;
  for (const m of (text ?? "").matchAll(/\$link:([^$]+)\$/g)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    const id = resolve(m[1]);
    parts.push(id ? { text: m[1], id } : { text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text?.length) parts.push({ text: text.slice(last) });
  return parts;
}
