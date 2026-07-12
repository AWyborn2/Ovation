// Flow 3a: admin side of the honours display — settings page, kiosk token
// generation, admin-only /honours-display preview, with NO honours data yet.
import fs from "fs";
import {
  makeSession, shot, shotFull, adminLogin, dismissTour, finish, BASE, EVID,
} from "./captain-lib.mjs";

const s = await makeSession();
const { page } = s;

await adminLogin(page);
await page.goto(BASE + "/admin/honours/display", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await shot(page, "20-honours-display-settings-top.png");
await shotFull(page, "21-honours-display-settings-full.png");

// Kiosk link card sits at the bottom.
await page.locator('text=Clubroom TV link').scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await shot(page, "22-kiosk-link-card-before.png");

// Generate a random token.
await page.click('[data-testid="button-generate-kiosk-token"]');
await page.waitForTimeout(1200);
await shot(page, "23-kiosk-link-generated.png");
const url1 = await page.locator('[data-testid="input-kiosk-url"]').inputValue();
console.log("kiosk url (random):", url1);

// Set a custom code (the advertised easy-to-type flow).
await page.fill('[data-testid="input-custom-kiosk-token"]', "review-tv");
await page.click('[data-testid="button-set-kiosk-token"]');
await page.waitForTimeout(1200);
const url2 = await page.locator('[data-testid="input-kiosk-url"]').inputValue();
console.log("kiosk url (custom):", url2);
await shot(page, "24-kiosk-link-custom.png");
fs.writeFileSync(EVID + "/kiosk-token.txt", url2 + "\n");

// Custom-code validation: too short / bad chars.
await page.fill('[data-testid="input-custom-kiosk-token"]', "x!");
await page.click('[data-testid="button-set-kiosk-token"]');
await page.waitForTimeout(900);
await shot(page, "25-kiosk-custom-code-invalid.png");

// Admin-only display preview (no data yet).
await page.goto(BASE + "/honours-display", { waitUntil: "networkidle" });
await dismissTour(page);
await page.waitForTimeout(1200);
await shotFull(page, "26-honours-display-empty.png");

await finish(s, "captain-03-kiosk-admin.webm", "captain-03-kiosk-admin.log");
