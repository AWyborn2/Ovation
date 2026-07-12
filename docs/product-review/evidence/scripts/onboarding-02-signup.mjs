// Self-serve signup end-to-end: Dawesville Cricket Club, taken slug first,
// then the real slug; time the whole funnel; follow through to the new site.
import { launch, shot, report, APEX, brokenImages } from "./onboarding-lib.mjs";

const { page, finish } = await launch({ videoName: "signup-e2e.webm" });
const notes = [];
const t0 = Date.now();
const mark = (label) =>
  notes.push(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

// Confirm the landing links first (Log in target + Halls Head demo link).
await page.goto(APEX + "/", { waitUntil: "networkidle" });
const loginHref = await page
  .locator("header a", { hasText: "Log in" })
  .getAttribute("href");
const demoHref = await page
  .locator("a", { hasText: "Visit Halls Head's site" })
  .getAttribute("href");
notes.push(`landing header Log in href: ${loginHref}`);
notes.push(`landing demo link href: ${demoHref}`);

// --- Step 1: club picker -----------------------------------------------------
await page.goto(APEX + "/signup", { waitUntil: "networkidle" });
mark("signup page loaded");
await shot(page, "10-signup-club-picker.png", { fullPage: true });

// What does a member of a CLAIMED club see? Search for Mandurah.
await page.fill('input[placeholder="Search for your club…"]', "Mandurah");
await page.waitForTimeout(400);
await shot(page, "11-signup-search-claimed-club.png");
await page.fill('input[placeholder="Search for your club…"]', "");
await page.waitForTimeout(300);

await page.getByRole("button", { name: /Dawesville Cricket Club/ }).click();
mark("picked Dawesville");
await page.waitForTimeout(700); // let the default-slug availability check run
await shot(page, "12-signup-details-default.png");
const defaultSlug = await page.inputValue("#slug");
notes.push(`suggested slug prefilled: "${defaultSlug}"`);

// --- Step 2: taken slug validation --------------------------------------------
await page.fill("#slug", "mandurah");
await page.waitForTimeout(1200); // debounce 350ms + request
await shot(page, "13-signup-slug-taken.png");
const takenMsg = await page
  .locator("p.text-destructive, .text-destructive")
  .first()
  .innerText()
  .catch(() => "(no message)");
notes.push(`taken-slug message: "${takenMsg}"`);

// Is the submit button correctly disabled with a taken slug?
await page.fill("#email", "dawesville-admin@example.com");
await page.fill("#password", "DawesvilleTest!2026");
const disabledWithTaken = await page
  .getByRole("button", { name: /Create my club's site/ })
  .isDisabled();
notes.push(`submit disabled while slug taken: ${disabledWithTaken}`);

// --- Step 3: the real slug + submit -------------------------------------------
await page.fill("#slug", "dawesville");
await page.waitForTimeout(1200);
await shot(page, "14-signup-slug-ok-filled.png");
mark("form valid, submitting");

// Capture the signup API response body.
const respPromise = page.waitForResponse(
  (r) => r.url().includes("/platform/signup") && r.request().method() === "POST",
  { timeout: 20000 },
);
await page.getByRole("button", { name: /Create my club's site/ }).click();
const resp = await respPromise;
const body = await resp.json().catch(() => null);
notes.push(`POST /platform/signup -> ${resp.status()} ${JSON.stringify(body)}`);
mark(`signup response received (${resp.status()})`);

await page.waitForTimeout(1000);
await shot(page, "15-signup-success-choice.png");
mark("success/choice screen shown");

// --- Step 4: follow "Set up branding now" as a real user would ----------------
const [maybeNav] = await Promise.allSettled([
  page.waitForNavigation({ timeout: 8000 }).catch(() => null),
  page.getByTestId("button-branding-now").click(),
]);
await page.waitForTimeout(2500);
notes.push(`after clicking branding-now, browser is at: ${page.url()}`);
await shot(page, "16-after-branding-now-click.png");
mark("followed branding-now redirect");

// --- Step 5: regardless of where the redirect took us, verify the new club ----
// (local env serves http on :24624 — go there explicitly)
await page.goto("http://dawesville.ovation.test:24624/", {
  waitUntil: "networkidle",
  timeout: 30000,
});
mark("new club public site loaded");
await shot(page, "17-dawesville-public-home.png", { fullPage: true });
notes.push(`dawesville home title: ${await page.title()}`);
const broken = await brokenImages(page);

await page.goto("http://dawesville.ovation.test:24624/admin", {
  waitUntil: "networkidle",
  timeout: 30000,
});
await page.waitForTimeout(1000);
await shot(page, "18-dawesville-admin-after-signup.png", { fullPage: true });
const adminState = await page.evaluate(() => document.body.innerText.slice(0, 400));
notes.push(`/admin state after signup: ${adminState.replace(/\n/g, " | ").slice(0, 300)}`);
mark("checked /admin auto-login state");

// If we hit a login form, try the credentials we just created.
const loginVisible = await page
  .locator('input[type="password"]')
  .first()
  .isVisible()
  .catch(() => false);
if (loginVisible) {
  notes.push("auto-login FAILED — login form shown; trying created credentials");
  const userField = page
    .locator('input[type="email"], input[type="text"], input[name="username"]')
    .first();
  await userField.fill("dawesville-admin@example.com");
  await page.locator('input[type="password"]').first().fill("DawesvilleTest!2026");
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await page.waitForTimeout(2500);
  await shot(page, "19-dawesville-admin-manual-login.png", { fullPage: true });
  notes.push(`after manual login, at: ${page.url()}`);
  mark("manual login attempted");
} else {
  await shot(page, "19-dawesville-admin-logged-in.png", { fullPage: true });
  mark("auto-logged-in to /admin");
}

const log = await finish();
report("SIGNUP E2E", log, { notes, brokenImagesOnClubHome: broken });
