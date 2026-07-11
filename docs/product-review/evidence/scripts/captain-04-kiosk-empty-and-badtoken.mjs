// Flow 3b: token kiosk in a FRESH context (no cookies) with NO honours data,
// plus the wrong-token failure mode.
import { makeSession, shot, finish, BASE } from "./captain-lib.mjs";
import fs from "fs";

const tokenUrl = fs
  .readFileSync("/home/user/Ovation/docs/product-review/evidence/captain-kiosk/kiosk-token.txt", "utf8")
  .trim();

// --- Valid token, empty data -------------------------------------------------
const s1 = await makeSession();
await s1.page.goto(tokenUrl, { waitUntil: "networkidle" });
await s1.page.waitForTimeout(4000);
await shot(s1.page, "30-kiosk-valid-token-empty-data.png");
await s1.page.waitForTimeout(10000);
await shot(s1.page, "31-kiosk-valid-token-empty-data-after-14s.png");
const body1 = await s1.page.locator("body").innerText();
console.log("empty-data kiosk body text:", JSON.stringify(body1.slice(0, 200)));
await finish(s1, "captain-04a-kiosk-empty.webm", "captain-04a-kiosk-empty.log");

// --- Wrong token -------------------------------------------------------------
const s2 = await makeSession();
await s2.page.goto(BASE + "/tv/definitely-wrong-token", { waitUntil: "networkidle" });
await s2.page.waitForTimeout(5000);
await shot(s2.page, "32-kiosk-wrong-token.png");
const body2 = await s2.page.locator("body").innerText();
console.log("wrong-token kiosk body text:", JSON.stringify(body2.slice(0, 200)));

// Legacy query form with a wrong token too.
await s2.page.goto(BASE + "/honours-display/kiosk?token=also-wrong", { waitUntil: "networkidle" });
await s2.page.waitForTimeout(4000);
await shot(s2.page, "33-kiosk-wrong-token-legacy-url.png");
await finish(s2, "captain-04b-kiosk-wrong-token.webm", "captain-04b-kiosk-wrong-token.log");
