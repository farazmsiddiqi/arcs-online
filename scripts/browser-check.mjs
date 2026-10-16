import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.TEST_URL ?? "http://localhost:5173";
const leaders = process.env.TEST_LEADERS === "yes";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL });
const contexts = await Promise.all([
  browser.newContext({ viewport: { width: 1512, height: 982 } }),
  browser.newContext({ viewport: { width: 1280, height: 900 } }),
]);
const pages = await Promise.all(contexts.map((c) => c.newPage()));
const errors = [];
for (const p of pages) p.on("pageerror", (e) => errors.push(e.message));
const [host, guest] = pages;
const getRoom = (page) =>
  page.evaluate(async () => {
    const id = location.pathname.split("/").at(-1),
      key = localStorage.getItem(`arcs-seat-${id}`);
    return (
      await fetch(`/api/rooms/${id}`, {
        headers: { Authorization: `Bearer ${key}` },
      })
    ).json();
  });
try {
  await host.goto(base);
  await host
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Commander One");
  await host.getByRole("button", { name: "2 players", exact: true }).click();
  if (leaders)
    await host
      .getByRole("button", { name: "Leaders & Lore", exact: true })
      .click();
  await host
    .getByRole("button", { name: "Create private table", exact: false })
    .click();
  const invitation = await host
    .getByRole("textbox", { name: "Invitation link" })
    .inputValue();
  await guest.goto(invitation);
  await guest
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Commander Two");
  await guest.getByRole("button", { name: "Join table", exact: true }).click();
  await host.getByRole("button", { name: "Begin the game" }).click();
  await guest
    .getByRole("button", { name: "Return to the game", exact: true })
    .click();
  let transitions = 0;
  if (leaders) {
    await host.waitForSelector(".draft-board");
    assert.equal(await host.locator(".draft-row .court-card").count(), 6);
    for (let n = 0; n < 6; n++) {
      const state = await getRoom(host);
      if (state.game.phase !== "draft") break;
      const page = pages[state.game.decision.actor],
        rev = state.game.revision;
      await page.locator(".draft-pick").first().click();
      await page.waitForFunction(async (revision) => {
        const id = location.pathname.split("/").at(-1),
          key = localStorage.getItem(`arcs-seat-${id}`);
        return (
          (
            await (
              await fetch(`/api/rooms/${id}`, {
                headers: { Authorization: `Bearer ${key}` },
              })
            ).json()
          ).game.revision > revision
        );
      }, rev);
    }
    assert.equal((await getRoom(host)).game.phase, "card");
  }
  for (let i = 0; i < 30; i++) {
    const state = await getRoom(host),
      actor = state.game.decision.actor,
      page = pages[actor],
      view = (await getRoom(page)).game,
      d = view.decision;
    let c =
      d.choices.find((c) => c.op === "skip") ??
      d.choices.find((c) => c.op === "declare") ??
      d.choices.find(
        (c) => c.op === "play" && ["lead", "surpass", "pivot"].includes(c.mode),
      ) ??
      d.choices.find(
        (c) =>
          c.op === "action" &&
          c.cost === "pip" &&
          ["tax", "influence", "build"].includes(c.action),
      ) ??
      d.choices.find(
        (c) =>
          c.op === "taxTarget" ||
          c.op === "influenceTarget" ||
          c.op === "buildTarget",
      ) ??
      d.choices.find((c) => c.op === "endTurn") ??
      d.choices[0];
    if (
      view.turn?.prelude &&
      !view.activity?.resolving &&
      c.group === "Card actions"
    )
      c = d.choices.find((c) => c.op === "endPrelude");
    if (view.turn?.prelude && c.op === "endTurn")
      c = d.choices.find((c) => c.op === "endPrelude");
    if (d.form) break;
    assert.ok(c, JSON.stringify(d));
    if (c.op === "play") {
      await page
        .locator(`.action-card.original`)
        .filter({ has: page.locator(`img[src="/assets/${c.card}.webp"]`) })
        .click();
    }
    if (view.resourceArrangement)
      await page.getByRole("button", { name: "Done", exact: true }).click();
    else if (["play", "action"].includes(c.op))
      await page.getByRole("button", { name: c.label, exact: true }).click();
    else if (!(c.op === "endTurn" && d.choices.length === 1)) {
      if (c.system || ["influenceTarget", "secureTarget"].includes(c.op))
        await page
          .locator(".target-fallback:not([open]) > summary")
          .click()
          .catch(() => {});
      await page
        .locator(".command-choice")
        .filter({ hasText: c.op === "endTurn" ? "Review & end turn" : c.label })
        .first()
        .click();
    }
    if (c.op === "endTurn")
      await page
        .getByRole("button", { name: "Confirm & end turn", exact: true })
        .click();
    await page.waitForFunction(async (revision) => {
      const id = location.pathname.split("/").at(-1),
        key = localStorage.getItem(`arcs-seat-${id}`);
      const r = await fetch(`/api/rooms/${id}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const data = await r.json();
      return data.game.revision > revision;
    }, view.revision);
    transitions++;
  }
  const before = await getRoom(host);
  await host.reload();
  await host.waitForSelector(".command-live");
  const after = await getRoom(host);
  assert.equal(before.game.revision, after.game.revision);
  assert.deepEqual(before.game.players[0].hand, after.game.players[0].hand);
  assert.equal(typeof after.game.players[1].hand, "number");
  await host.getByRole("button", { name: "Card library", exact: true }).click();
  await host.getByRole("button", { name: "Leader", exact: true }).click();
  assert.equal(await host.locator(".library-grid .court-card").count(), 16);
  await host.locator(".library-grid .court-card").first().click();
  await host.locator(".detail-art").waitFor();
  await host.waitForFunction(() => {
    const img = document.querySelector(".detail-art");
    return img?.complete && img.naturalWidth > 500;
  });
  assert.ok(
    await host
      .locator(".detail-art")
      .evaluate((img) => img.complete && img.naturalWidth > 500),
  );
  await host.keyboard.press("Escape");
  await host.screenshot({
    path: "work/multiplayer-desktop.png",
    fullPage: true,
  });
  const desktop = await host.evaluate(() => ({
    w: innerWidth,
    h: innerHeight,
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
  }));
  assert.equal(desktop.w, desktop.scrollW);
  assert.equal(desktop.h, desktop.scrollH);
  await guest.setViewportSize({ width: 390, height: 844 });
  await guest.screenshot({
    path: "work/multiplayer-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await guest.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      privateTable: true,
      publicLeadersDraft: leaders,
      independentSeats: 2,
      uiTransitions: transitions,
      reloadPreservesState: true,
      leaderImages: 16,
      noConsoleErrors: true,
      desktopFits: true,
      mobileNoHorizontalOverflow: true,
    }),
  );
} catch (e) {
  for (let i = 0; i < pages.length; i++) {
    console.error(
      `SEAT ${i}:`,
      await pages[i]
        .locator(".command-live")
        .innerText()
        .catch(() => "not mounted"),
    );
    await pages[i].screenshot({
      path: `work/browser-failure-${i}.png`,
      fullPage: true,
    });
  }
  throw e;
} finally {
  await browser.close();
}
