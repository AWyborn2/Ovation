// Flow 2: captain portal in a fresh context — login gate, bad creds, empty
// voting board, and privilege check (captain session must NOT open /admin).
import {
  makeSession, shot, shotFull, dismissTour, finish, BASE,
  CAPTAIN_USER, CAPTAIN_PASS,
} from "./captain-lib.mjs";

const s = await makeSession();
const { page } = s;

await page.goto(BASE + "/captain", { waitUntil: "networkidle" });
await dismissTour(page);
await page.waitForTimeout(500);
await shot(page, "10-captain-login-gate.png");

// Overflow probe.
const ow = await page.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  innerW: window.innerWidth,
}));
console.log("captain page overflow:", JSON.stringify(ow));

// Wrong password first.
await page.fill("#cap-username", CAPTAIN_USER);
await page.fill("#cap-password", "wrong-password");
await page.click('button:has-text("Sign in")');
await page.waitForTimeout(900);
await shot(page, "11-captain-login-badpass.png");

// Correct login.
await page.fill("#cap-password", CAPTAIN_PASS);
await page.click('button:has-text("Sign in")');
await page.waitForLoadState("networkidle");
await page.waitForTimeout(900);
await shotFull(page, "12-captain-portal-empty.png");

// What does the captain session get on admin APIs / the admin SPA?
const apiChecks = await page.evaluate(async () => {
  const out = {};
  for (const p of ["/api/captain/me", "/api/auth/me", "/api/captains", "/api/admins", "/api/honour-display"]) {
    const r = await fetch(p, { credentials: "include" });
    out[p] = r.status;
  }
  return out;
});
console.log("captain-session API statuses:", JSON.stringify(apiChecks));

await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
await dismissTour(page);
await page.waitForTimeout(600);
await shot(page, "13-captain-session-admin-gate.png");
console.log("admin page shows login form:", await page.locator("#username").count());

// Back to /captain — session should survive navigation.
await page.goto(BASE + "/captain", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const stillIn = await page.locator('text=Captain · 3-2-1 voting').count();
console.log("still signed in on return to /captain:", stillIn);

// Sign out.
await page.click('button:has-text("Sign out")');
await page.waitForTimeout(800);
await shot(page, "14-captain-signed-out.png");

await finish(s, "captain-02-portal.webm", "captain-02-portal.log");
