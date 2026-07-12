import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
for (const path of ["/", "/players", "/matches", "/grades/A%20Grade"]) {
  await p.goto("http://mandurah.ovation.test:24624" + path, { waitUntil: "networkidle" }).catch(()=>{});
  await p.waitForTimeout(1200);
  await p.keyboard.press("Escape").catch(()=>{});
  const r = await p.evaluate(() => {
    const wide = [];
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 380 && el.children.length < 30) {
        // only leaf-ish culprits: skip if a child is equally wide
        let childAsWide = false;
        for (const c of el.children) if (c.getBoundingClientRect().width >= rect.width - 2) childAsWide = true;
        if (!childAsWide) wide.push({ w: Math.round(rect.width), tag: el.tagName, cls: (el.className+"").slice(0,90), txt: (el.innerText||"").slice(0,40).replace(/\n/g," ") });
      }
    }
    wide.sort((a,b)=>b.w-a.w);
    return { innerWidth: innerWidth, docScrollW: document.documentElement.scrollWidth, top: wide.slice(0,6) };
  });
  console.log("==", path, JSON.stringify(r, null, 1));
}
await b.close();
