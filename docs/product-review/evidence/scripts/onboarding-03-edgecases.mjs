// Signup edge cases: revisit /signup after all clubs are claimed, claimed-club
// resubmission (API), invalid slug formats, and the post-TTL Dawesville site.
import { launch, shot, report, APEX, brokenImages } from "./onboarding-lib.mjs";

const notes = [];

// --- A: /signup after the last club is claimed --------------------------------
{
  const { page, finish } = await launch({ videoName: "signup-edgecases.webm" });
  await page.goto(APEX + "/signup", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, "20-signup-all-clubs-claimed.png", { fullPage: true });
  const emptyState = await page.evaluate(() =>
    document.querySelector("ul")?.innerText?.trim(),
  );
  notes.push(`picker empty-state text: "${emptyState}"`);

  // Search for a claimed club by name — what does a Dawesville member #2 see?
  await page.fill('input[placeholder="Search for your club…"]', "Dawesville");
  await page.waitForTimeout(400);
  await shot(page, "21-signup-search-now-claimed.png");

  // --- B: claimed club straight to the API (bypassing the picker) -------------
  const apiResults = await page.evaluate(async () => {
    const out = [];
    // claimed club, fresh slug
    const r1 = await fetch("/api/platform/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        centralClubId: 12,
        slug: "dawesville-two",
        adminEmail: "second-admin@example.com",
        password: "AnotherPass!2026",
      }),
    });
    out.push(`claimed club resubmit -> ${r1.status} ${await r1.text()}`);
    // invalid club id
    const r2 = await fetch("/api/platform/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        centralClubId: 9999,
        slug: "ghost-club",
        adminEmail: "x@example.com",
        password: "AnotherPass!2026",
      }),
    });
    out.push(`unknown club id -> ${r2.status} ${await r2.text()}`);
    // slug format checks
    const slugs = [
      "mandurah",
      "dawesville",
      "UPPER",
      "has space",
      "-leading",
      "trailing-",
      "a",
      "www",
      "admin",
      "api",
      "platform-admin",
      "so-long-" + "x".repeat(80),
      "emoji-🏏",
    ];
    for (const s of slugs) {
      const r = await fetch(
        "/api/platform/slug-available?slug=" + encodeURIComponent(s),
      );
      out.push(`slug "${s.slice(0, 30)}" -> ${r.status} ${await r.text()}`);
    }
    return out;
  });
  notes.push(...apiResults);
  const log = await finish();
  report("EDGE CASES", log, { notes });
}

// --- C: Dawesville after the 5-min directory-cache TTL -------------------------
{
  const { page, finish } = await launch({ videoName: "dawesville-post-ttl.webm" });
  await page.goto("http://dawesville.ovation.test:24624/", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(800);
  await shot(page, "22-dawesville-home-post-ttl.png", { fullPage: true });
  const brand = await page.evaluate(() => ({
    title: document.title,
    footer: document.querySelector("footer")?.innerText?.slice(0, 200),
  }));
  const broken = await brokenImages(page);

  // Manual login at /admin with the credentials created during signup.
  await page.goto("http://dawesville.ovation.test:24624/admin", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(800);
  await shot(page, "23-dawesville-admin-login-form.png");
  const formText = await page.evaluate(() => document.body.innerText.slice(0, 300));

  // Fill whatever login form is presented.
  const inputs = page.locator("input:visible");
  const n = await inputs.count();
  const kinds = [];
  for (let i = 0; i < n; i++)
    kinds.push(await inputs.nth(i).getAttribute("type"));
  if (n >= 2) {
    await inputs.nth(0).fill("dawesville-admin@example.com");
    await inputs.nth(1).fill("DawesvilleTest!2026");
    await page.getByRole("button", { name: /log in|sign in/i }).click();
    await page.waitForTimeout(2500);
  }
  await shot(page, "24-dawesville-admin-after-login.png", { fullPage: true });
  const after = await page.evaluate(() => ({
    url: location.href,
    text: document.body.innerText.slice(0, 300).replace(/\n/g, " | "),
  }));
  const log = await finish();
  report("DAWESVILLE POST-TTL", log, {
    notes: [
      `home brand: ${JSON.stringify(brand)}`,
      `admin form inputs (${n}): ${kinds.join(", ")}`,
      `admin gate text: ${formText.replace(/\n/g, " | ")}`,
      `after login: ${JSON.stringify(after)}`,
    ],
    brokenImages: broken,
  });
}
