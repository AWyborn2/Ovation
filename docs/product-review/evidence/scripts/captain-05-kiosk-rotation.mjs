// Flow 4: token kiosk with seeded honours data — rotation capture at 1280x720
// (video) plus 1920x1080 TV stills, in fresh cookie-less contexts.
import { makeSession, shot, finish, BASE, EVID } from "./captain-lib.mjs";
import fs from "fs";
import path from "path";

const tokenUrl = fs
  .readFileSync(path.join(EVID, "kiosk-token.txt"), "utf8")
  .trim();

// --- 1280x720 with video: watch a full rotation ------------------------------
const s1 = await makeSession();
await s1.page.goto(tokenUrl, { waitUntil: "networkidle" });
await s1.page.waitForTimeout(1500);
await shot(s1.page, "40-kiosk-data-board1.png");
// dwell 3500ms + endHold 3000ms → next frame ~6.5s after show.
await s1.page.waitForTimeout(7000);
await shot(s1.page, "41-kiosk-data-board2.png");
await s1.page.waitForTimeout(7000);
await shot(s1.page, "42-kiosk-data-wrapped.png");
const text = await s1.page.locator("body").innerText();
console.log("kiosk body sample:", JSON.stringify(text.slice(0, 300)));
await finish(s1, "captain-05-kiosk-rotation.webm", "captain-05-kiosk-rotation.log");

// --- 1920x1080 TV stills ------------------------------------------------------
const s2 = await makeSession({ viewport: { width: 1920, height: 1080 }, video: false });
await s2.page.goto(tokenUrl, { waitUntil: "networkidle" });
await s2.page.waitForTimeout(1500);
await shot(s2.page, "43-kiosk-tv-1920x1080-board1.png");
await s2.page.waitForTimeout(7000);
await shot(s2.page, "44-kiosk-tv-1920x1080-board2.png");
await finish(s2, null, "captain-05-kiosk-tv1080.log");
