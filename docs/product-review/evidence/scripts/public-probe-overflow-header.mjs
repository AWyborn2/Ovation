import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 375, height: 812 } });
const p = await ctx.newPage();
await p.goto("http://mandurah.ovation.test:24624/matches", { waitUntil: "networkidle" }).catch(()=>{});
await p.waitForTimeout(1000);
const r = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const rect = el.getBoundingClientRect();
    if (rect.right > 377 && rect.width > 0) {
      let childBeyond = false;
      for (const c of el.children) if (c.getBoundingClientRect().right >= rect.right - 2) childBeyond = true;
      if (!childBeyond) out.push({ right: Math.round(rect.right), w: Math.round(rect.width), left: Math.round(rect.left), tag: el.tagName, cls: (el.className+"").slice(0,120), txt: (el.innerText||"").slice(0,40).replace(/\n/g," ") });
    }
  }
  out.sort((a,b)=>b.right-a.right);
  return out.slice(0,10);
});
console.log(JSON.stringify(r, null, 1));
await b.close();
