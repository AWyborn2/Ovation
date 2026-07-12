// sweep1-sweep.mjs — data-accuracy tester panel sweep for tenants 2-6.
// One browser, one context per club (recordVideo on, 1280x720 desktop).
// Visits home, /players, player detail, /matches, match detail, /grades ->
// A Grade leaderboard, /premierships. Screenshots each page, extracts UI
// values (stat tiles, tables, brand tokens), greps rendered HTML for
// "Halls Head"/"HHCC", collects console errors / failed requests / broken
// images, and (mandurah+waroona) opens the shared cross-club match 275.
// Output: PNGs + webm videos in evidence/club-sweep-1/, extraction JSON in
// the same folder (sweep1-extract.json).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = "/home/user/Ovation/docs/product-review/evidence/club-sweep-1";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const VIDTMP = path.join(EVIDENCE, "_vidtmp");
fs.mkdirSync(EVIDENCE, { recursive: true });

const CLUBS = [
  { slug: "mandurah", tenantId: 2, clubId: 2, name: "Mandurah Cricket Club", primary: "#0b3d91" },
  { slug: "white-knights", tenantId: 3, clubId: 3, name: "White Knights Cricket Club", primary: "#4b4b4b" },
  { slug: "shoalwater-bay", tenantId: 4, clubId: 4, name: "Shoalwater Bay Cricket Club", primary: "#00707e" },
  { slug: "secret-harbour", tenantId: 5, clubId: 5, name: "Secret Harbour Cricket Club", primary: "#b33000" },
  { slug: "waroona", tenantId: 6, clubId: 6, name: "Waroona Cricket Club", primary: "#5d3a9b" },
];
const CROSS_MATCH_ID = 275; // Waroona (home) v Mandurah, A Grade R9 2025/26

const out = { startedAt: new Date().toISOString(), clubs: {} };

function attach(page, rec) {
  page.on("console", (m) => {
    if (m.type() === "error") rec.cur?.console.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => rec.cur?.pageerror.push(String(e).slice(0, 300)));
  page.on("requestfailed", (r) => {
    const f = r.failure()?.errorText ?? "";
    if (f.includes("ERR_ABORTED")) return;
    rec.cur?.requestfailed.push(`${r.method()} ${r.url()} :: ${f}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400)
      rec.cur?.badresponse.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  });
}

async function brandAndGrep(page) {
  return page.evaluate(() => {
    const html = document.documentElement.outerHTML;
    const hits = [];
    const re = /Halls Head|HHCC/gi;
    let m;
    while ((m = re.exec(html)) && hits.length < 40) {
      hits.push(html.slice(Math.max(0, m.index - 70), m.index + m[0].length + 70).replace(/\s+/g, " "));
    }
    const header = document.querySelector("header");
    const rootStyle = getComputedStyle(document.documentElement);
    const h1 = document.querySelector("h1");
    const headerImgs = Array.from(header?.querySelectorAll("img") ?? []).map((i) => ({
      src: i.src.slice(0, 160), alt: i.alt, naturalWidth: i.naturalWidth, complete: i.complete,
    }));
    const fav = Array.from(document.querySelectorAll('link[rel~="icon"]')).map((l) => l.href);
    const brokenImgs = Array.from(document.images)
      .filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:"))
      .map((i) => i.src.slice(0, 200));
    // resolved brand colour: computed color of first .text-primary element
    const tp = document.querySelector(".text-primary");
    return {
      title: document.title,
      headerText: header?.innerText.replace(/\s+/g, " ").slice(0, 300) ?? null,
      headerImgs,
      favicons: fav,
      cssPrimaryToken: rootStyle.getPropertyValue("--primary").trim(),
      textPrimaryResolved: tp ? getComputedStyle(tp).color : null,
      h1: h1?.innerText ?? null,
      brandHits: hits,
      brokenImgs,
      metaDescription: document.querySelector('meta[name="description"]')?.content ?? null,
      ogTitle: document.querySelector('meta[property="og:title"]')?.content ?? null,
    };
  });
}

async function dumpTables(page, max = 8) {
  return page.evaluate((max) => {
    return Array.from(document.querySelectorAll("table")).slice(0, max).map((t) => {
      const caption = t.closest("div.bg-card")?.querySelector("h2,h3")?.innerText
        ?? t.closest("section")?.querySelector("h2,h3")?.innerText ?? null;
      const headers = Array.from(t.querySelectorAll("thead th")).map((h) => h.innerText.trim());
      const rows = Array.from(t.querySelectorAll("tbody tr")).slice(0, 30).map((tr) =>
        Array.from(tr.querySelectorAll("td,th")).map((c) => c.innerText.trim()),
      );
      return { caption, headers, rows };
    });
  }, max);
}

async function visit(page, rec, url, label, shotName) {
  rec.cur = { label, url, console: [], pageerror: [], requestfailed: [], badresponse: [] };
  rec.pages.push(rec.cur);
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => {
    rec.cur.gotoError = String(e).slice(0, 200);
  });
  await page.waitForTimeout(1200);
  // dismiss first-visit welcome/tour modal so screenshots are clean
  const later = page.getByRole("button", { name: /maybe later/i });
  if (await later.isVisible().catch(() => false)) {
    rec.cur.welcomeModalSeen = true;
    await later.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: path.join(EVIDENCE, shotName), fullPage: false });
  rec.cur.shot = shotName;
  rec.cur.brand = await brandAndGrep(page);
  return rec.cur;
}

const browser = await chromium.launch({ executablePath: CHROME });

for (const club of CLUBS) {
  const BASE = `http://${club.slug}.ovation.test:24624`;
  console.log(`\n=== ${club.slug} ===`);
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: VIDTMP, size: { width: 1280, height: 720 } },
  });
  const page = await ctx.newPage();
  const rec = { club: club.slug, tenantId: club.tenantId, pages: [], cur: null };
  out.clubs[club.slug] = rec;
  attach(page, rec);

  // capture player-detail API payloads so we can map app player id -> stats source
  const apiCaptures = {};
  page.on("response", async (res) => {
    const u = res.url();
    if (res.status() === 200 && /\/api\/(players\/\d+|overview$|grades\/)/.test(u)) {
      try { apiCaptures[u.replace(BASE, "")] = await res.json(); } catch {}
    }
  });

  // 1. home
  const home = await visit(page, rec, `${BASE}/`, "home", `${club.slug}-01-home.png`);
  home.statTiles = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="stat-"]')).map((el) => ({
      testid: el.getAttribute("data-testid"),
      value: el.innerText.trim(),
      label: el.parentElement?.innerText.replace(el.innerText, "").trim().slice(0, 40),
    })),
  );
  home.fullText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 1500));

  // 2. players list
  const players = await visit(page, rec, `${BASE}/players`, "players", `${club.slug}-02-players.png`);
  const firstPlayer = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('a[href^="/players/"]')).find((x) =>
      /^\/players\/\d+$/.test(x.getAttribute("href")),
    );
    return a ? { href: a.getAttribute("href"), text: a.innerText.replace(/\s+/g, " ").slice(0, 120) } : null;
  });
  players.firstPlayer = firstPlayer;
  players.playerCountText = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("p,span,div")).map((e) => e.childNodes.length === 1 ? e.innerText : "").filter((t) => /player/i.test(t) && t.length < 80);
    return els.slice(0, 4);
  });

  // 3. player detail
  if (firstPlayer) {
    const pd = await visit(page, rec, `${BASE}${firstPlayer.href}`, "player-detail", `${club.slug}-03-player-detail.png`);
    pd.playerHref = firstPlayer.href;
    pd.tables = await dumpTables(page);
    pd.apiPlayer = apiCaptures[`/api${firstPlayer.href}`] ?? null;
  }

  // 4. matches list
  const matches = await visit(page, rec, `${BASE}/matches`, "matches", `${club.slug}-04-matches.png`);
  const firstMatch = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('a[href^="/matches/"]')).find((x) =>
      /^\/matches\/\d+$/.test(x.getAttribute("href")),
    );
    return a ? { href: a.getAttribute("href"), text: a.innerText.replace(/\s+/g, " ").slice(0, 300) } : null;
  });
  matches.firstMatch = firstMatch;
  matches.listText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 2000));

  // 5. match detail (scorecard)
  if (firstMatch) {
    const md = await visit(page, rec, `${BASE}${firstMatch.href}`, "match-detail", `${club.slug}-05-match-detail.png`);
    md.matchHref = firstMatch.href;
    md.tables = await dumpTables(page, 10);
    md.summaryText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 2500));
    await page.screenshot({ path: path.join(EVIDENCE, `${club.slug}-05b-match-detail-full.png`), fullPage: true });
  }

  // 6. grades -> A Grade leaderboard
  await visit(page, rec, `${BASE}/grades`, "grades", `${club.slug}-06-grades.png`);
  const lb = await visit(page, rec, `${BASE}/grades/A%20Grade`, "a-grade-leaderboard", `${club.slug}-07-a-grade.png`);
  lb.tables = await dumpTables(page, 4);
  lb.hhccNotePresent = await page.evaluate(() =>
    /Prior to MyCricket and PlayHQ/.test(document.body.innerText),
  );
  await page.screenshot({ path: path.join(EVIDENCE, `${club.slug}-07b-a-grade-full.png`), fullPage: true });

  // 7. premierships
  const prem = await visit(page, rec, `${BASE}/premierships`, "premierships", `${club.slug}-08-premierships.png`);
  prem.bodyText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 1200));

  // 8. cross-club shared match (mandurah + waroona only)
  if (club.slug === "mandurah" || club.slug === "waroona") {
    const cm = await visit(page, rec, `${BASE}/matches/${CROSS_MATCH_ID}`, "cross-club-match", `${club.slug}-09-crossmatch-${CROSS_MATCH_ID}.png`);
    cm.tables = await dumpTables(page, 10);
    cm.summaryText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 2500));
    await page.screenshot({ path: path.join(EVIDENCE, `${club.slug}-09b-crossmatch-full.png`), fullPage: true });
  }

  rec.cur = null;
  const video = page.video();
  await ctx.close();
  if (video) {
    const vp = await video.path();
    fs.renameSync(vp, path.join(EVIDENCE, `${club.slug}-sweep.webm`));
  }
  console.log(`done ${club.slug}`);
}

await browser.close();
fs.rmSync(VIDTMP, { recursive: true, force: true });
fs.writeFileSync(path.join(EVIDENCE, "sweep1-extract.json"), JSON.stringify(out, null, 1));
console.log("extract written");
