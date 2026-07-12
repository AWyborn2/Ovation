// Flow 3: branding tab — change club name + accent colour, save, verify via the
// PATCH response + a fresh GET /api/tenant-brand (brand cache is 5 min, so we do
// not wait for the public page to repaint), then revert exactly via the API.
import { makeSession, finish, shot, shotFull, login, dismissTour, BASE } from "./admin-lib.mjs";

const ORIGINAL = {
  name: "Halls Head Cricket Club",
  shortName: null,
  logoUrl: "/ovation-logo.svg",
  faviconUrl: null,
  primaryColour: "#334155",
  secondaryColour: "#94A3B8",
  tertiaryColour: "#475569",
};

const s = await makeSession();
const { page } = s;
await login(page);

// Probe: header logo <img> health + horizontal overflow at 1280px.
const probe = await page.evaluate(() => {
  const img = document.querySelector("header img, nav img, img");
  return {
    logoSrc: img?.getAttribute("src"),
    logoComplete: img?.complete,
    logoNaturalWidth: img?.naturalWidth,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  };
});
console.log("probe:", JSON.stringify(probe));

await page.goto(BASE + "/admin/settings/branding", { waitUntil: "networkidle" });
await dismissTour(page);
await page.waitForTimeout(800);
await shotFull(page, "50-branding-before.png");

// Change name + accent.
await page.fill("#brand-name", "Halls Head CC (Review Test)");
await page.click('[data-testid="swatch-accent-green"]');
await page.waitForTimeout(400);
await shot(page, "51-branding-edited-preview.png");

// Save and capture the PATCH response.
const [resp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/tenant-brand") && r.request().method() === "PATCH"),
  page.click('[data-testid="button-save-branding"]'),
]);
const patchBody = await resp.json().catch(() => null);
console.log("PATCH status:", resp.status());
console.log("PATCH body:", JSON.stringify(patchBody));
await page.waitForTimeout(800);
await shot(page, "52-branding-after-save.png");

// Server-side truth: fresh GET (same-session request, bypasses SPA state).
const get1 = await page.request.get(BASE + "/api/tenant-brand");
console.log("GET after save:", JSON.stringify(await get1.json()));

// Public site check (may still show cached brand — recorded for the report).
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await dismissTour(page);
await page.waitForTimeout(600);
await shot(page, "53-public-home-after-brand-change.png");
const headerText = await page.locator("header, nav").first().innerText().catch(() => "");
console.log("public header text:", headerText.replace(/\s+/g, " ").slice(0, 200));

// Revert exactly via the API (UI swatches snap colours, so API revert is precise).
await page.goto(BASE + "/admin/settings/branding", { waitUntil: "networkidle" });
const revert = await page.request.patch(BASE + "/api/tenant-brand", { data: ORIGINAL });
console.log("revert status:", revert.status(), JSON.stringify(await revert.json().catch(() => null)));
const get2 = await page.request.get(BASE + "/api/tenant-brand");
console.log("GET after revert:", JSON.stringify(await get2.json()));
await page.reload({ waitUntil: "networkidle" });
await dismissTour(page);
await page.waitForTimeout(600);
await shot(page, "54-branding-after-revert.png");

await finish(s, "admin-03-branding.webm", "log-03-branding.txt");
