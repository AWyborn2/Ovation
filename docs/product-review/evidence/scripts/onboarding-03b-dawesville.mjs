// Dawesville post-TTL verification: correct brand, admin login with the
// credentials created during signup, first-run admin experience.
import { launch, shot, report, brokenImages } from "./onboarding-lib.mjs";

const { page, finish } = await launch({ videoName: "dawesville-post-ttl.webm" });
const notes = [];

await page.goto("http://dawesville.ovation.test:24624/", {
  waitUntil: "networkidle",
});
await page.waitForTimeout(800);
await shot(page, "22-dawesville-home-post-ttl.png", { fullPage: true });
notes.push(`home title: ${await page.title()}`);
const brokenHome = await brokenImages(page);

await page.goto("http://dawesville.ovation.test:24624/admin", {
  waitUntil: "networkidle",
});
await page.waitForTimeout(800);
await shot(page, "23-dawesville-admin-welcome-modal-over-login.png");

// Dismiss the first-visit welcome modal if it covers the sign-in gate.
const later = page.getByRole("button", { name: "Maybe later" });
if (await later.isVisible().catch(() => false)) {
  notes.push("welcome modal shown ON TOP of the admin sign-in gate");
  await later.click();
  await page.waitForTimeout(400);
}
await shot(page, "24-dawesville-admin-login-gate.png");
const labels = await page.evaluate(() =>
  Array.from(document.querySelectorAll("label")).map((l) => l.innerText),
);
notes.push(`login form labels: ${labels.join(", ")}`);

await page.fill("#username", "dawesville-admin@example.com");
await page.fill("#password", "DawesvilleTest!2026");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForTimeout(2500);
await shot(page, "25-dawesville-admin-dashboard.png", { fullPage: true });
notes.push(`after login url: ${page.url()}`);
notes.push(
  `admin body: ${(await page.evaluate(() => document.body.innerText.slice(0, 500))).replace(/\n/g, " | ")}`,
);
const brokenAdmin = await brokenImages(page);

// Peek at the branding settings tab (the post-signup "set up branding now" target).
await page.goto(
  "http://dawesville.ovation.test:24624/admin/settings/branding",
  { waitUntil: "networkidle" },
);
await page.waitForTimeout(1200);
await shot(page, "26-dawesville-admin-branding.png", { fullPage: true });

const log = await finish();
report("DAWESVILLE POST-TTL", log, { notes, brokenHome, brokenAdmin });
