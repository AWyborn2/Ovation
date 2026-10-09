/**
 * Isolated browser layout check against the running app. All /api requests are
 * intercepted with synthetic data; this never signs in or modifies club data.
 * Run from the repo root: node artifacts/cricket-club/scripts/selection-hub.browser.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(new URL("../../api-server/package.json", import.meta.url));
const puppeteer = require("puppeteer-core");
const browser = await puppeteer.launch({
  executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  headless: true,
});
const origin = process.argv[2] ?? "http://127.0.0.1:80";
const member = (id) => ({
  id,
  displayName: `Test Player ${id}`,
  linkedPlayerId: id + 10000,
  status: "yes",
  note: null,
  lastGrade: "A Grade",
  junior: false,
  isPrivate: false,
  repliedAt: null,
  late: false,
});
const board = {
  section: "senior",
  actor: {
    kind: "admin",
    name: "Test selector",
    selectionRule: "captains_own_grade",
    canRemind: true,
  },
  round: null,
  selections: ["C Grade", "A Grade", "B Grade", "D Grade", "E Grade"].map((grade, i) => ({
    id: i + 1,
    roundId: 1,
    fixture: {
      id: i + 1,
      grade,
      opponentName: "Test opposition",
      startAt: "2026-10-17T04:30:00Z",
      venue: "Test oval",
      isHome: true,
      roundLabel: "Round 1",
    },
    date: "2026-10-17",
    state: "draft",
    version: 1,
    slots: Array.from({ length: 12 }, (_, j) => ({
      memberId: j < 10 ? (i + 1) * 100 + j : null,
      member: j < 10 ? member((i + 1) * 100 + j) : null,
      gap: null,
    })),
    captainMemberId: null,
    keeperMemberId: null,
    canEdit: true,
    canFinalise: true,
    readOnlyReason: null,
    finalisedAt: null,
    finalisedBy: null,
    warnings: {
      filled: 10,
      open: 1,
      twelfth: false,
      unconfirmed: 0,
      saidNo: 0,
      noCaptain: true,
      noKeeper: true,
    },
  })),
  pool: Array.from({ length: 80 }, (_, i) => member(900 + i)),
  events: [],
};
const failures = [];
let role = "admin";
async function setup(page) {
  page.on("pageerror", (e) => failures.push(e.message));
  await page.evaluateOnNewDocument(() => localStorage.setItem("hhcc.welcome.seen.v1", "1"));
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const path = new URL(req.url()).pathname;
    if (!path.startsWith("/api/")) return req.continue();
    let body = [];
    if (path === "/api/tenant-brand")
      body = {
        slug: "demo",
        name: "Test Cricket Club",
        shortName: "Test CC",
        primaryColor: "#e9a923",
        secondaryColor: "#0f172a",
        logoUrl: null,
      };
    if (path === "/api/auth/me")
      body = role === "admin" ? { id: 1, username: "test", displayName: "Test selector" } : null;
    if (path === "/api/captain-auth/me")
      body = { id: 2, username: "test-captain", displayName: "Test captain", grades: ["A Grade"] };
    if (path === "/api/tenant-plan")
      body = {
        entitlements: { socialStudio: true, curation: true, mobileApp: true, clubroomTv: true },
      };
    if (path === "/api/selection/board")
      body = {
        ...board,
        section: new URL(req.url()).searchParams.get("section") ?? "senior",
        actor: { ...board.actor, kind: role },
      };
    if (path === "/api/social-drafts/pending-count") body = { count: 0 };
    if (path === "/api/players") body = { players: [], total: 0, page: 1, limit: 20 };
    if (path === "/api/fixtures-results")
      body = { linked: false, seasons: [], latestSeason: null, grades: [], matches: [] };
    if (path === "/api/platform-admin/me") body = null;
    return req.respond({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}
async function metrics(page) {
  return page.evaluate(() => {
    const teams = document.querySelector('[aria-label="Teams"]').getBoundingClientRect();
    const pool = document.querySelector('aside[aria-label="Player pool"]').getBoundingClientRect();
    const body = document.querySelector("#pool-search").closest("aside").lastElementChild;
    return {
      teamsHeight: teams.height,
      poolHeight: pool.height,
      teamsWidth: teams.width,
      teamsBottom: teams.bottom,
      poolBottom: pool.bottom,
      poolTop: pool.top,
      teamsTop: teams.top,
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      poolScrollHeight: body.scrollHeight,
      poolClientHeight: body.clientHeight,
    };
  });
}
try {
  const page = await browser.newPage();
  await setup(page);
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${origin}/admin/selection`, { waitUntil: "networkidle0" });
  await page.waitForSelector('[data-testid="side-1"]');
  await page.evaluate(() => document.fonts.ready);
  const before = await metrics(page);
  assert.ok(Math.abs(before.teamsHeight - before.poolHeight) < 2, JSON.stringify(before));
  assert.ok(before.poolScrollHeight > before.poolClientHeight, "large pool must scroll");
  await page.click('[aria-label="Collapse side menu"]');
  const after = await metrics(page);
  assert.ok(after.teamsWidth > before.teamsWidth + 200, JSON.stringify({ before, after }));
  assert.ok(Math.abs(after.teamsHeight - after.poolHeight) < 2, JSON.stringify(after));
  assert.ok(Math.abs(after.teamsBottom - after.poolBottom) < 2, JSON.stringify(after));
  await page.screenshot({ path: "/tmp/selection-hub-expanded.png" });
  await page.evaluate(() => {
    document
      .querySelector('[aria-label="Teams"]')
      .lastElementChild.scrollIntoView({ block: "end" });
  });
  await page.screenshot({ path: "/tmp/selection-hub-last-row.png" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('[aria-label="Expand side menu"]');
  const restored = await metrics(page);
  assert.equal(restored.teamsWidth, before.teamsWidth);
  await page.click('[data-testid="chip-900"]');
  const linked = await page.$eval('[role="dialog"] a[href*="/compare"]', (el) => ({
    href: el.getAttribute("href"),
    target: el.target,
  }));
  assert.equal(linked.href, "/compare?a=10900");
  assert.equal(linked.target, "_blank");
  await page.keyboard.press("Escape");
  const compare = await browser.newPage();
  await setup(compare);
  await compare.goto(`${origin}/compare`, { waitUntil: "networkidle0" });
  assert.match(await compare.$eval("body", (el) => el.innerText), /Head-to-head/i);
  await compare.close();
  for (const width of [1024, 768, 390]) {
    await page.setViewport({ width, height: 900 });
    const m = await metrics(page);
    assert.ok(m.documentWidth <= width + 1, JSON.stringify(m));
    if (width >= 1024) assert.ok(Math.abs(m.poolHeight - m.teamsHeight) < 2, JSON.stringify(m));
    else assert.ok(m.poolTop < m.teamsTop, "pool stacks above teams on narrow screens");
    await page.screenshot({ path: `/tmp/selection-hub-${width}.png` });
  }
  role = "captain";
  const captain = await browser.newPage();
  await setup(captain);
  await captain.setViewport({ width: 1440, height: 1000 });
  await captain.goto(`${origin}/captain/selection`, { waitUntil: "networkidle0" });
  await captain.waitForSelector('[data-testid="side-1"]');
  assert.ok(await captain.$('a[href="/compare"][target="_blank"]'));
  await captain.click('button[aria-pressed="false"]');
  await captain.waitForFunction(() =>
    document.body.innerText.includes(
      "Player comparison currently supports senior statistics only.",
    ),
  );
  assert.equal(await captain.$('a[href="/compare"][target="_blank"]'), null);
  assert.deepEqual(failures, []);
  console.log(
    JSON.stringify({
      desktop: { before, after },
      responsive: [1024, 768, 390],
      captainComparison: "passed",
      pageErrors: failures,
    }),
  );
} finally {
  await browser.close();
}
