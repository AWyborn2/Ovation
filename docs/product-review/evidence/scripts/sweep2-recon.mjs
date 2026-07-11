// Recon: dump structure of pinjarra pages to learn selectors.
import { chromium } from "playwright";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://pinjarra.ovation.test:24624";

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

async function dump(url, label) {
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const title = await page.title();
  const info = await page.evaluate(() => {
    const pick = (sel) => Array.from(document.querySelectorAll(sel)).map((e) => e.textContent.trim().slice(0, 80));
    return {
      h1: pick("h1"),
      h2: pick("h2").slice(0, 12),
      h3: pick("h3").slice(0, 12),
      headerText: document.querySelector("header")?.innerText.replace(/\n/g, " | ").slice(0, 300),
      tables: Array.from(document.querySelectorAll("table")).map((t) => ({
        head: Array.from(t.querySelectorAll("thead th")).map((th) => th.textContent.trim()),
        row0: Array.from(t.querySelectorAll("tbody tr")).slice(0, 2).map((tr) =>
          Array.from(tr.querySelectorAll("td,th")).map((td) => td.textContent.trim())
        ),
        nrows: t.querySelectorAll("tbody tr").length,
      })),
      links: Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")).filter((h, i, arr) => arr.indexOf(h) === i).slice(0, 40),
      statCards: pick('[class*="card"] , [class*="stat"]').slice(0, 15),
      primary: getComputedStyle(document.documentElement).getPropertyValue("--primary"),
      favicon: document.querySelector('link[rel*="icon"]')?.href,
      bodySnippet: document.body.innerText.slice(0, 1200),
    };
  });
  console.log(`\n===== ${label} (${url}) title="${title}" =====`);
  console.log(JSON.stringify(info, null, 1).slice(0, 4500));
}

await dump("/", "home");
await dump("/players", "players");
await dump("/players/5", "player-detail");
await dump("/matches", "matches");
await dump("/matches/345", "match-detail");
await dump("/grades", "grades");
await dump("/records", "records");

await browser.close();
