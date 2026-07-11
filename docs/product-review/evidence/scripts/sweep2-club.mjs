// sweep2-club.mjs — data-accuracy tester panel sweep, group 2 (tenants 7-11).
// Usage: node sweep2-club.mjs <slug>
// One browser context per club, recordVideo on, 1280x720. READ-ONLY.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const EVIDENCE = "/home/user/Ovation/docs/product-review/evidence/club-sweep-2";
const VIDEO_TMP = path.join(EVIDENCE, "video-tmp");

const CLUBS = {
  pinjarra: {
    tenant: 7, club: 7, name: "Pinjarra Cricket Club", hex: "#8b0000",
    playerId: 13, playerName: "Jake Taylor", matchId: 345,
    extraVisits: [
      { url: "/matches/339", shot: "09-match339-privacy-opponent-view", grabText: true },
      { url: "/grades/A%20Grade", shot: "10-agrade-private-row", grabText: true },
      { url: "/players/24", shot: "11-private-player-link", grabText: true },
    ],
  },
  "south-mandurah": {
    tenant: 8, club: 8, name: "South Mandurah Cricket Club", hex: "#006400",
    playerId: 14, playerName: "Sam Morris", matchId: 345,
  },
  "rockingham-hornets": {
    tenant: 9, club: 9, name: "Rockingham Hornets Cricket Club", hex: "#c8a200",
    playerId: 16, playerName: "Jake King", matchId: 340,
  },
  "warnbro-swans": {
    tenant: 10, club: 10, name: "Warnbro Swans Cricket Club", hex: "#122c6f",
    playerId: 22, playerName: "Mitch Taylor", matchId: 339,
    extraVisits: [
      { url: "/matches/339", shot: "09-match339-own-view", grabText: true }, // same as chosen match; kept for symmetry
      { url: "/players?page=2", shot: "10-players-page2", grabText: true },
    ],
  },
  "singleton-irwinians": {
    tenant: 11, club: 11, name: "Singleton Irwinians Cricket Club", hex: "#7a1f3d",
    playerId: 17, playerName: "Jack Carter", matchId: 334,
    extraVisits: [
      { url: "/matches/330", shot: "09-match330-privacy-dismissal-text", grabText: true },
    ],
  },
};

const slug = process.argv[2];
const cfg = CLUBS[slug];
if (!cfg) { console.error("unknown slug", slug); process.exit(1); }
const BASE = `http://${slug}.ovation.test:24624`;

fs.mkdirSync(EVIDENCE, { recursive: true });
fs.mkdirSync(VIDEO_TMP, { recursive: true });

const results = { slug, tenant: cfg.tenant, base: BASE, pages: {}, brand: {}, issuesLog: [] };

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({
  recordVideo: { dir: VIDEO_TMP, size: { width: 1280, height: 720 } },
  viewport: { width: 1280, height: 720 },
});
const page = await context.newPage();

let current = null;
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning")
    current?.console.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
});
page.on("pageerror", (e) => current?.pageerror.push(String(e).slice(0, 300)));
page.on("requestfailed", (r) => {
  const f = r.failure()?.errorText ?? "";
  if (!f.includes("ERR_ABORTED")) current?.requestfailed.push(`${r.method()} ${r.url()} :: ${f}`);
});
page.on("response", (r) => {
  if (r.status() >= 400) current?.badresponse.push(`${r.status()} ${r.request().method()} ${r.url()}`);
});

async function visit(url, shotName, opts = {}) {
  current = { console: [], pageerror: [], requestfailed: [], badresponse: [] };
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  // dismiss the first-visit tour dialog if present so screenshots show the page
  try {
    const later = page.getByRole("button", { name: /maybe later/i });
    if (await later.isVisible({ timeout: 500 })) { await later.click(); await page.waitForTimeout(300); }
  } catch {}
  const shotFile = `${slug}-${shotName}.png`;
  await page.screenshot({ path: path.join(EVIDENCE, shotFile), fullPage: !!opts.fullPage });
  const info = await page.evaluate(() => {
    const brokenImages = Array.from(document.images)
      .filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:"))
      .map((i) => i.src);
    return {
      title: document.title,
      text: document.body.innerText,
      html: document.documentElement.outerHTML.length,
      brokenImages,
      primary: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
      favicon: document.querySelector('link[rel*="icon"]')?.getAttribute("href") ?? null,
      headerText: document.querySelector("header")?.innerText.replace(/\n/g, " | ").slice(0, 250) ?? null,
      tables: Array.from(document.querySelectorAll("table")).map((t) => ({
        head: Array.from(t.querySelectorAll("thead th")).map((th) => th.textContent.trim()),
        rows: Array.from(t.querySelectorAll("tbody tr")).slice(0, 12).map((tr) =>
          Array.from(tr.querySelectorAll("td,th")).map((td) => td.textContent.trim())),
      })),
    };
  });
  // brand-leak grep on the rendered HTML
  const html = await page.content();
  const leaks = [];
  const re = /Halls Head|HHCC/gi;
  let m;
  while ((m = re.exec(html)) && leaks.length < 25) {
    leaks.push(html.slice(Math.max(0, m.index - 60), m.index + 70).replace(/\s+/g, " "));
  }
  const rec = {
    url, shot: shotFile, title: info.title, primary: info.primary, favicon: info.favicon,
    headerText: info.headerText, brokenImages: info.brokenImages, tables: info.tables,
    leaks, console: current.console, pageerror: current.pageerror,
    requestfailed: current.requestfailed, badresponse: current.badresponse,
    text: info.text,
  };
  results.pages[url] = rec;
  console.log(`visited ${url} -> ${shotFile} (leaks: ${leaks.length})`);
  return rec;
}

// ---- 1. the seven standard pages ----
const home = await visit("/", "01-home");
await visit("/players", "02-players");
await visit(`/players/${cfg.playerId}`, "03-player-detail");
await visit("/matches", "04-matches");
await visit(`/matches/${cfg.matchId}`, "05-match-detail", { fullPage: true });
await visit("/grades", "06-grades");
await visit("/grades/B%20Grade", "07-bgrade-leaderboard");
await visit("/records", "08-records");

// ---- 2. extra targeted visits (privacy etc.) ----
for (const ev of cfg.extraVisits ?? []) {
  await visit(ev.url, ev.shot, { fullPage: true });
}

// ---- 3. brand checks on home ----
await page.goto(BASE + "/", { waitUntil: "networkidle" });
const brand = await page.evaluate(() => {
  const header = document.querySelector("header");
  const logo = header?.querySelector("img");
  const metaDesc = document.querySelector('meta[name="description"]')?.content ?? null;
  const og = document.querySelector('meta[property="og:title"]')?.content ?? null;
  return {
    title: document.title,
    metaDescription: metaDesc,
    ogTitle: og,
    headerLogo: logo ? { src: logo.src, loaded: logo.complete && logo.naturalWidth > 0, alt: logo.alt } : null,
    footerText: document.querySelector("footer")?.innerText.replace(/\n/g, " | ").slice(0, 300) ?? null,
    primaryVar: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
    accentVar: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
    faviconHref: document.querySelector('link[rel*="icon"]')?.href ?? null,
  };
});
// favicon fetch status
brand.faviconStatus = brand.faviconHref
  ? (await page.request.get(brand.faviconHref)).status()
  : null;
brand.expectedHexFromDb = cfg.hex;
results.brand = brand;

// ---- done ----
const videoPath = await page.video()?.path();
await context.close();
await browser.close();
if (videoPath) {
  const dest = path.join(EVIDENCE, `${slug}-sweep.webm`);
  fs.copyFileSync(videoPath, dest);
  fs.rmSync(videoPath, { force: true });
  console.log("video ->", dest);
}
fs.writeFileSync(path.join("/tmp/claude-0/-home-user-Ovation/6f9bc7d9-7149-59c4-8676-d65ea2c1577c/scratchpad/pw", `sweep2-results-${slug}.json`), JSON.stringify(results, null, 1));
console.log("results json written for", slug);
