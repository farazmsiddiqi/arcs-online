// Maintainer tool: refresh the pinned publisher rule corpus. Review the diff
// and rerun retrieval/live evaluations before shipping a new rule revision.
// Parse literal data; never evaluate the publisher's JavaScript.
import { parse } from "@babel/parser";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import pinned from "../data/arcy-rules.json" with { type: "json" };
const url = new URL(process.argv[2] ?? pinned.sourceBundle);
if (
  url.origin !== "https://rules.buriedgiant.com" ||
  !url.pathname.endsWith(".js")
)
  throw Error("Use a publisher rules JavaScript bundle URL.");
const response = await fetch(url);
if (!response.ok) throw Error(`Publisher returned ${response.status}`);
const code = await response.text();
const ast = parse(code, { sourceType: "module" });
function literal(n) {
  if (n.type === "ObjectExpression")
    return Object.fromEntries(
      n.properties.map((p) => {
        if (p.type !== "ObjectProperty" || p.computed)
          throw Error("Not literal data");
        return [p.key.name ?? p.key.value, literal(p.value)];
      }),
    );
  if (n.type === "ArrayExpression") return n.elements.map(literal);
  if (
    [
      "StringLiteral",
      "NumericLiteral",
      "BooleanLiteral",
      "NullLiteral",
    ].includes(n.type)
  )
    return n.value ?? null;
  if (n.type === "TemplateLiteral" && !n.expressions.length)
    return n.quasis.map((q) => q.value.cooked).join("");
  throw Error("Not literal data");
}
let ruleData, errata, revision;
for (const statement of ast.program.body) {
  if (statement.type !== "VariableDeclaration") continue;
  for (const decl of statement.declarations) {
    try {
      const value = literal(decl.init)?.arcs?.["en-US"];
      if (value?.p1?.rules) ruleData = value.p1;
      else if (
        Array.isArray(value) &&
        value.some((v) => v.rules && v.versions && v.text)
      )
        errata = value;
      else if (value?.App?.NavTitle) revision = value.App.NavTitle;
    } catch {}
  }
}
if (!ruleData || !errata || !revision)
  throw Error(
    "Publisher structure changed. Inspect and update this importer; do not overwrite the last verified corpus.",
  );
const inScope = (n) => +n.split(".")[0] <= 11 || +n.split(".")[0] >= 22;
const rules = ruleData.rules.flatMap((r, i) =>
  inScope(`${i + 1}`) ? [{ ...r, number: String(i + 1) }] : [],
);
if (rules.length !== 13)
  throw Error("Unexpected section count. Review scope before updating.");
writeFileSync(
  "data/arcy-rules.json",
  JSON.stringify(
    {
      source: pinned.source,
      retrievedAt: new Date().toISOString().slice(0, 10),
      publisherRevision: revision,
      sourceBundle: url.href,
      sha256: createHash("sha256").update(code).digest("hex"),
      scope: pinned.scope,
      rules,
      faq: ruleData.faq.filter((q) => q.rules?.some(inScope)),
      errata: errata.filter((q) => q.rules?.some(inScope)),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Updated publisher corpus. Review data/arcy-rules.json and rerun Arcy evaluations.",
);
