/**
 * Development-only authenticated smoke check. Uses disposable fixtures and the
 * real session middleware; never changes existing history or auth configuration.
 * Run: pnpm --filter @workspace/api-server exec tsx src/maintenance/shared-award-browser.ts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  closeDb,
  awardsTable,
  awardWinnersTable,
  adminsTable,
  playersTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

// Types for callbacks executed IN Chromium, without adding DOM globals to the
// API server's Node-only TypeScript project.
type BrowserElement = {
  textContent: string | null;
  click(): void;
  closest(selector: string): BrowserElement | null;
  querySelector<T = BrowserElement>(selector: string): T | null;
};
type HTMLInputElement = { value: string };
type HTMLButtonElement = BrowserElement;
declare const document: {
  querySelector(selector: string): BrowserElement | null;
  querySelectorAll(selector: string): BrowserElement[];
  body: { textContent: string | null };
  documentElement: { scrollWidth: number };
};
declare const innerWidth: number;

if (process.env.NODE_ENV === "production") throw new Error("Development only");
const host = process.env.REPLIT_DEV_DOMAIN;
if (!host || !host.endsWith(".replit.dev"))
  throw new Error("A Replit development host is required");
const base = `https://${host}`;
const stamp = `shared-browser-${Date.now()}`;
const title = `Shared browser medal ${stamp}`;
const label = "Two co-winners and an unlinked volunteer";
let awardId: number | undefined;
let adminId: number | undefined;
const playerIds: number[] = [];
const browser = await puppeteer.launch({
  executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.setExtraHTTPHeaders({ "x-tenant-id": "1" });
await page.setViewport({ width: 1280, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem("hhcc.welcome.seen.v1", "1"));
await mkdir("/tmp/shared-award-browser", { recursive: true });

async function clickText(text: string) {
  await page.waitForFunction(
    (t) => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === t),
    {},
    text,
  );
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === t);
    if (!b) throw new Error(`Missing button: ${t}`);
    b.click();
  }, text);
}
async function openAward() {
  await page.goto(`${base}/admin/honours/awards`, { waitUntil: "networkidle2" });
  await page.type('input[placeholder="Search awards"]', title);
  await page.waitForFunction(
    (t) => [...document.querySelectorAll("tr")].some((r) => r.textContent?.includes(t)),
    {},
    title,
  );
  await page.evaluate(
    (t) => [...document.querySelectorAll("tr")].find((r) => r.textContent?.includes(t))?.click(),
    title,
  );
  await page.waitForSelector('[role="dialog"]');
}
async function choose(givenName: string) {
  await page.type('input[placeholder="Search players…"]', stamp);
  await page.waitForFunction(
    (name) => [...document.querySelectorAll("button")].some((b) => b.textContent?.includes(name)),
    {},
    givenName,
  );
  await page.evaluate(
    (name) =>
      [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(name))?.click(),
    givenName,
  );
}
try {
  const [admin] = await db
    .insert(adminsTable)
    .values({
      tenantId: 1,
      username: stamp,
      displayName: "Browser test",
      passwordHash: "not-a-login-password",
    })
    .returning();
  adminId = admin.id;
  await browser.setCookie({
    name: SESSION_COOKIE,
    value: encodeSession({ adminId, issuedAt: Date.now() }),
    domain: host,
    path: "/",
    secure: true,
    httpOnly: true,
  });
  for (const givenName of ["SmokeAlice", "SmokeBob"]) {
    const [p] = await db.insert(playersTable).values({ givenName, surname: stamp }).returning();
    playerIds.push(p.id);
  }
  const [award] = await db
    .insert(awardsTable)
    .values({ tenantId: 1, key: stamp, title, published: true, displayOrder: -1000 })
    .returning();
  awardId = award.id;
  await openAward();
  await clickText("Add winner");
  await choose("SmokeAlice");
  const nameInput = await page.$(
    'input[placeholder="Type a name (auto-filled when a player is linked)"]',
  );
  assert(nameInput);
  await nameInput.click();
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await nameInput.type(label);
  await choose("SmokeBob");
  assert.equal(await nameInput.evaluate((e) => (e as HTMLInputElement).value), label);
  const response = page.waitForResponse(
    (r) => r.url().includes(`/awards/${awardId}/winners`) && r.request().method() === "POST",
  );
  await page.evaluate(() => {
    const input = document.querySelector(
      'input[placeholder="Type a name (auto-filled when a player is linked)"]',
    );
    input?.closest("form")?.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
  });
  assert.equal((await response).status(), 201);
  await page.waitForFunction(() => document.body.textContent?.includes("Winner saved."));
  let [winner] = await db
    .select()
    .from(awardWinnersTable)
    .where(eq(awardWinnersTable.awardId, awardId));
  assert.deepEqual(winner.playerIds, playerIds);
  assert.equal(winner.name, label);
  await openAward();
  await clickText("Edit");
  await page.waitForSelector('button[aria-label^="Remove link to"]');
  assert.equal((await page.$$('button[aria-label^="Remove link to"]')).length, 2);
  // Let the drawer's entry transition finish before taking visual evidence.
  await new Promise((resolve) => setTimeout(resolve, 400));
  await (await page.$('button[aria-label^="Remove link to"]'))!.scrollIntoView();
  await page.screenshot({ path: "/tmp/shared-award-browser/editor.jpg" });
  console.log("PASS: authenticated selection, save, reload and reopened links");

  await page.goto(`${base}/honour-boards?tab=awards`, { waitUntil: "networkidle2" });
  if (!(await page.$(`a[href="/players/${playerIds[1]}"]`))) await clickText("Awards");
  await page.waitForSelector(`a[href="/players/${playerIds[1]}"]`);
  for (const width of [1280, 390]) {
    await page.setViewport({ width, height: 900 });
    const layout = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
    }));
    assert(layout.scroll <= layout.width + 1, `Horizontal overflow at ${width}`);
    await page.screenshot({ path: `/tmp/shared-award-browser/public-${width}.jpg` });
  }
  console.log("PASS: independent public profile links and desktop/390px layout");
  for (const id of playerIds) {
    await page.goto(`${base}/players/${id}`, { waitUntil: "networkidle2" });
    await page.waitForFunction((t) => document.body.textContent?.includes(t), {}, title);
  }
  console.log("PASS: both public player profiles receive the award");
  await page.setViewport({ width: 1280, height: 900 });
  await openAward();
  await clickText("Edit");
  await page.locator('button[aria-label^="Remove link to"]').click();
  const updated = page.waitForResponse(
    (r) => r.url().includes(`/award-winners/${winner.id}`) && r.request().method() === "PATCH",
  );
  await clickText("Save winner");
  assert.equal((await updated).status(), 200);
  [winner] = await db
    .select()
    .from(awardWinnersTable)
    .where(eq(awardWinnersTable.awardId, awardId));
  assert.deepEqual(winner.playerIds, [playerIds[1]]);
  assert.equal(winner.name, label);
  assert.deepEqual(errors, []);
  console.log("PASS: individual unlink persists; no browser errors");
} catch (error) {
  await page.screenshot({ path: "/tmp/shared-award-browser/failure.jpg" });
  console.error("Browser check failed:", String(error), "Page:", page.url());
  throw error;
} finally {
  await browser.close();
  if (awardId) await db.delete(awardsTable).where(eq(awardsTable.id, awardId));
  if (adminId) await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  if (playerIds.length) await db.delete(playersTable).where(inArray(playersTable.id, playerIds));
  await closeDb();
}
