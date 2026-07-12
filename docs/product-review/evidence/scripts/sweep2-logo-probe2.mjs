import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage();
await page.goto("http://pinjarra.ovation.test:24624/", { waitUntil: "networkidle" });
const r = await page.evaluate(() => new Promise((resolve) => {
  const img = document.querySelector("header img");
  const fresh = new Image();
  fresh.onload = () => resolve({ event: "load", w: fresh.naturalWidth, h: fresh.naturalHeight, origBroken: img.naturalWidth === 0 });
  fresh.onerror = (e) => resolve({ event: "error", origBroken: img.naturalWidth === 0 });
  fresh.src = "/ovation-logo.svg?cachebust=" + Date.now();
}));
console.log(JSON.stringify(r));
await browser.close();
