// Probe horizontal overflow on juniors pages (desktop + mobile) and identify offenders.
import { chromium } from "playwright";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: CHROME });

async function probe(vw, vh, url) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  // dismiss welcome modal if present
  const later = page.getByRole("button", { name: /maybe later/i });
  if (await later.isVisible().catch(() => false)) { await later.click(); await page.waitForTimeout(300); }
  const r = await page.evaluate(() => {
    const iw = window.innerWidth;
    const sw = document.documentElement.scrollWidth;
    const offenders = [];
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if (rect.right > iw + 1 && rect.width > 20) {
        offenders.push({
          tag: el.tagName, cls: (el.className + "").slice(0, 90),
          testid: el.getAttribute("data-testid"),
          right: Math.round(rect.right), width: Math.round(rect.width),
        });
      }
      if (offenders.length > 12) break;
    }
    return { iw, sw, overflow: sw - iw, offenders };
  });
  console.log(`${vw}x${vh} ${url}\n  innerWidth=${r.iw} scrollWidth=${r.sw} overflow=${r.overflow}px`);
  for (const o of r.offenders.slice(0, 8)) console.log("   ", JSON.stringify(o));
  await ctx.close();
}

await probe(1280, 720, "http://mandurah.ovation.test:24624/");
await probe(1280, 720, "http://mandurah.ovation.test:24624/juniors");
await probe(375, 812, "http://mandurah.ovation.test:24624/juniors");
await probe(375, 812, "http://halls-head.ovation.test:24624/");
await browser.close();
