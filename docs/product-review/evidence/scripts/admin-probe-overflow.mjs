import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://halls-head.ovation.test:24624/", { waitUntil: "networkidle" });
const wide = await page.evaluate(() => {
  const out = [];
  const vw = document.documentElement.clientWidth;
  document.querySelectorAll("*").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 2 && r.width > 30) out.push({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 90), right: Math.round(r.right), w: Math.round(r.width) });
  });
  return { vw, scrollW: document.documentElement.scrollWidth, wide: out.slice(0, 12) };
});
console.log(JSON.stringify(wide, null, 1));
await browser.close();
