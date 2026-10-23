/**
 * Development-only real-browser publication/cancel smoke test.
 * pnpm --filter @workspace/api-server exec tsx src/test/junior-name-browser.ts
 * Owns and cleans up its disposable tenant, admin and junior records.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { eq } from "drizzle-orm";
import {
  db,
  closeDb,
  tenantsTable,
  adminsTable,
  juniorParticipantsTable,
  juniorMatchesTable,
  juniorMatchRostersTable,
  juniorStatCorrectionsTable,
  juniorMatchDisplaySettingsTable,
  tourContentTable,
  navItemsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { env } from "../config";

type El = { textContent: string | null; click(): void };
declare const document: {
  querySelectorAll(s: string): El[];
  querySelector(s: string): El | null;
  body: { textContent: string | null };
  documentElement: { scrollWidth: number };
};
declare const innerWidth: number;
declare const localStorage: { setItem(k: string, v: string): void };

if (env.isProduction()) throw new Error("Development only");
const host = env.REPLIT_DEV_DOMAIN();
assert(host?.endsWith(".replit.dev"), "Development host required");
const base = `https://${host}`;
const stamp = Date.now();
const a = randomUUID(),
  m = randomUUID(),
  p = randomUUID();
const matchId = 870_000_000 + (stamp % 1_000_000);
const longName = "Alexandra Jean-Marie de la Cruz-Smith";
let tenantId = 0;
const browser = await puppeteer.launch({
  executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.evaluateOnNewDocument(() => localStorage.setItem("hhcc.welcome.seen.v1", "1"));
await page.setViewport({ width: 1280, height: 900 });
const output = "../../generated-artifacts/junior-names";
await mkdir(output, { recursive: true });
async function click(text: string, scope = "button") {
  await page.waitForFunction(
    (t, s) => [...document.querySelectorAll(s)].some((b) => b.textContent?.trim() === t),
    {},
    text,
    scope,
  );
  await page.evaluate(
    (t, s) => [...document.querySelectorAll(s)].find((b) => b.textContent?.trim() === t)?.click(),
    text,
    scope,
  );
}
async function textIncludes(text: string) {
  await page.waitForFunction((t) => document.body.textContent?.includes(t), {}, text);
}
try {
  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      slug: `junior-browser-${stamp}`,
      name: "Junior browser test",
      plan: "pilot",
      centralClubId: 900_000 + (stamp % 10000),
      readsFromCentral: true,
    })
    .returning();
  tenantId = tenant.id;
  const [admin] = await db
    .insert(adminsTable)
    .values({
      tenantId,
      username: `junior-browser-${stamp}`,
      displayName: "Browser test admin",
      passwordHash: "x",
    })
    .returning();
  await db.insert(juniorParticipantsTable).values([
    {
      tenantId,
      participantId: a,
      displayName: "A Smith",
      firstSeason: "2020/21",
      lastSeason: "2025/26",
      teams: "Blue",
    },
    { tenantId, participantId: m, displayName: "M Missing" },
    { tenantId, participantId: p, displayName: "P Jones", isPrivate: true },
  ]);
  await db.insert(juniorMatchesTable).values({
    id: matchId,
    tenantId,
    season: "2025/26",
    teamName: "Blue",
    team1: "Blue",
    team2: "Rivals",
  });
  await db.insert(juniorMatchRostersTable).values({
    id: matchId,
    matchId,
    participantId: a,
    playerName: "Alex Smith",
    isHallsHead: true,
  });
  await page.setRequestInterception(true);
  page.on("request", (r) =>
    r.continue(
      new URL(r.url()).origin === base
        ? {
            headers: { ...r.headers(), "x-tenant-id": String(tenantId) },
          }
        : {},
    ),
  );
  await page.setCookie({
    name: SESSION_COOKIE,
    value: encodeSession({ adminId: admin.id, issuedAt: Date.now() }),
    domain: host!,
    path: "/",
    httpOnly: true,
    secure: true,
  });
  await page.goto(`${base}/admin/people/junior-players`, { waitUntil: "networkidle2" });
  await click("Preview suggested full names");
  await page.waitForSelector('input[type="checkbox"]');
  await page.click('input[type="checkbox"]');
  await click("Publish selected (1)");
  await textIncludes("A Smith → Alex Smith");
  await new Promise((resolve) => setTimeout(resolve, 300));
  await page.screenshot({ path: `${output}/before-confirmation.jpg` });
  await click("Cancel", '[role="alertdialog"] button');
  const before = await db
    .select()
    .from(juniorParticipantsTable)
    .where(eq(juniorParticipantsTable.tenantId, tenantId));
  assert.equal(before.find((r) => r.participantId === a)?.displayName, "A Smith");
  await click("Publish selected (1)");
  await click("Save and publish full names", '[role="alertdialog"] button');
  await textIncludes("1 names published");
  // Manual name with no source evidence, tested on the narrow mobile-web layout.
  await page.setViewport({ width: 390, height: 844 });
  await page.select('select[aria-label="Name review status"]', "missing");
  await page.type('input[aria-label="Search name review"]', "M Missing");
  await click("Edit full name");
  await page.waitForSelector('input[aria-label="Confirmed full name"]');
  await page.click('input[aria-label="Confirmed full name"]');
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.type('input[aria-label="Confirmed full name"]', longName);
  await click("Save and publish full name");
  await textIncludes(`M Missing → ${longName}`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await page.screenshot({ path: `${output}/manual-confirmation-phone.jpg` });
  await click("Cancel", '[role="alertdialog"] button');
  await click("Save and publish full name");
  await click("Save and publish full name", '[role="alertdialog"] button');
  await page.waitForFunction(
    () => !document.querySelector('input[aria-label="Confirmed full name"]'),
  );
  await page.goto(`${base}/juniors/players`, { waitUntil: "networkidle2" });
  await textIncludes(longName);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    "Directory must fit the viewport",
  );
  await page.screenshot({ path: `${output}/directory-phone.jpg` });
  await page.goto(`${base}/juniors/players/${m}`, { waitUntil: "networkidle2" });
  await textIncludes(longName);
  await page.screenshot({ path: `${output}/profile-phone.jpg` });
  for (const size of ["square", "portrait", "story"]) {
    const bytes = await page.evaluate(
      async (name, format) => {
        const modulePath = "/src/lib/share-card.ts";
        const { renderShareCard } = await import(modulePath);
        const blob = await renderShareCard(
          {
            kind: "milestone",
            junior: true,
            playerName: name,
            tierLabel: "500 Runs",
            tierIndex: 1,
            milestoneLabel: "Career runs",
            currentValue: 500,
          },
          { size: format },
        );
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      },
      longName,
      size,
    );
    assert(bytes.length > 1000, "Card export must contain an image");
    await writeFile(`${output}/long-name-${size}.png`, Buffer.from(bytes));
  }
  const mobileHost = env.REPLIT_EXPO_DEV_DOMAIN();
  if (mobileHost) {
    const mobile = await browser.newPage();
    await mobile.setViewport({ width: 390, height: 844 });
    await mobile.setRequestInterception(true);
    mobile.on("request", (r) =>
      r.continue(
        new URL(r.url()).origin === base
          ? {
              headers: { ...r.headers(), "x-tenant-id": String(tenantId) },
            }
          : {},
      ),
    );
    await mobile.goto(`https://${mobileHost}/juniors/players`, {
      waitUntil: "networkidle2",
      timeout: 90000,
    });
    await mobile.waitForFunction(
      (name) => document.body.textContent?.includes(name),
      { timeout: 90000 },
      longName,
    );
    const later = await mobile.$("::-p-text(Maybe later)");
    if (later) {
      await later.click();
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    await mobile.screenshot({ path: `${output}/expo-directory-phone.jpg` });
    await mobile.goto(`https://${mobileHost}/juniors/players/${m}`, { waitUntil: "networkidle2" });
    await mobile.waitForFunction((name) => document.body.textContent?.includes(name), {}, longName);
    await mobile.screenshot({ path: `${output}/expo-profile-phone.jpg` });
    await mobile.close();
  }
  await page.goto(`${base}/juniors/players/${p}`, { waitUntil: "networkidle2" });
  assert(
    !(await page.evaluate(() => document.body.textContent ?? "")).includes("P Jones"),
    "Withheld identity must not be rendered",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "passed",
      checks: [
        "preview",
        "cancel",
        "selected publication",
        "manual publication",
        "phone directory",
        "phone profile",
        "withheld profile",
      ],
      screenshots: output,
    }),
  );
} catch (error) {
  await page.screenshot({ path: `${output}/failure.jpg` });
  console.error((await page.evaluate(() => document.body.textContent ?? "")).slice(-5000));
  throw error;
} finally {
  await browser.close();
  if (tenantId) {
    await db.delete(juniorMatchesTable).where(eq(juniorMatchesTable.tenantId, tenantId));
    await db
      .delete(juniorStatCorrectionsTable)
      .where(eq(juniorStatCorrectionsTable.tenantId, tenantId));
    await db.delete(juniorParticipantsTable).where(eq(juniorParticipantsTable.tenantId, tenantId));
    await db
      .delete(juniorMatchDisplaySettingsTable)
      .where(eq(juniorMatchDisplaySettingsTable.tenantId, tenantId));
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantId));
    await db.delete(tourContentTable).where(eq(tourContentTable.tenantId, tenantId));
    await db.delete(navItemsTable).where(eq(navItemsTable.tenantId, tenantId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  }
  await closeDb();
}
