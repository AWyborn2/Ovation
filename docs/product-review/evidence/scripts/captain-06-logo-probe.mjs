// Probe: why is the club crest/logo broken everywhere? Also re-shoot the
// admin /honours-display preview now that honours data exists.
import { makeSession, shot, shotFull, adminLogin, dismissTour, finish, BASE, EVID } from "./captain-lib.mjs";
import fs from "fs";
import path from "path";

const tokenUrl = fs.readFileSync(path.join(EVID, "kiosk-token.txt"), "utf8").trim();

const s = await makeSession({ video: false });
const { page } = s;

await page.goto(tokenUrl, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const imgs = await page.evaluate(() =>
  [...document.querySelectorAll("img")].map((i) => ({
    src: i.getAttribute("src"),
    currentSrc: i.currentSrc,
    naturalWidth: i.naturalWidth,
    complete: i.complete,
    cls: i.className,
  })),
);
console.log("kiosk imgs:", JSON.stringify(imgs, null, 1));

// Fetch the img src from inside the page to see status.
const st = await page.evaluate(async (u) => {
  const r = await fetch(u);
  return { url: u, status: r.status, type: r.headers.get("content-type") };
}, imgs[0]?.src ?? "/ovation-logo.svg");
console.log("fetch of logo src:", JSON.stringify(st));

// Public homepage header logo probe too.
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await dismissTour(page);
const hdr = await page.evaluate(() =>
  [...document.querySelectorAll("header img, footer img")].map((i) => ({
    src: i.getAttribute("src"),
    naturalWidth: i.naturalWidth,
  })),
);
console.log("header/footer imgs:", JSON.stringify(hdr));

// Admin display preview with data.
await adminLogin(page);
await page.goto(BASE + "/honours-display", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await shotFull(page, "27-honours-display-with-data.png");

await finish(s, null, "captain-06-logo-probe.log");
