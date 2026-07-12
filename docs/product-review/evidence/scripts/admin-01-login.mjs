// Flow 1: login gate (logged out), wrong credentials, correct credentials, hub tiles.
import { makeSession, finish, shot, shotFull, dismissTour, BASE } from "./admin-lib.mjs";

const s = await makeSession();
const { page } = s;

// 1a. Gate, logged out. Capture the loading state first (no networkidle wait).
await page.goto(BASE + "/admin", { waitUntil: "commit" });
await page.screenshot({
  path: "/home/user/Ovation/docs/product-review/evidence/club-admin/01-login-gate-loading.png",
});
console.log("shot: 01-login-gate-loading.png (captured ASAP after commit)");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);
await shot(page, "02-login-gate-settled.png");
console.log("gate body text:", (await page.locator("main, body").first().innerText()).slice(0, 400));

// FINDING: the public welcome/tour modal covers the sign-in form — dismiss it.
await dismissTour(page);
await shot(page, "02b-login-gate-after-dismissing-tour-modal.png");

// 1b. Wrong credentials.
await page.fill("#username", "owner");
await page.fill("#password", "WrongPassword!123");
await page.click('button:has-text("Sign in")');
await page.waitForTimeout(1200);
await shot(page, "03-login-wrong-credentials.png");
const errText = await page
  .locator("text=/incorrect|failed|invalid/i")
  .allInnerTexts()
  .catch(() => []);
console.log("error surfaced:", JSON.stringify(errText));

// 1c. Correct credentials.
await page.fill("#username", "owner");
await page.fill("#password", "ReviewAdmin!2026");
await page.click('button:has-text("Sign in")');
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1000);
await shot(page, "04-admin-hub-after-login.png");
await shotFull(page, "05-admin-hub-full.png");
console.log("hub tiles:", JSON.stringify(await page.locator("a[href^='/admin']").allInnerTexts()));

await finish(s, "admin-01-login.webm", "log-01-login.txt");
