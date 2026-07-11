// Flow 5b: side effects of the CSV import (auto cap register, social queue),
// then delete the import from Past imports and verify the club returns to empty.
import { makeSession, finish, shot, shotFull, login, dismissTour, BASE } from "./admin-lib.mjs";

const s = await makeSession();
const { page } = s;
await login(page);

// Side effect 1: cap register auto-populated by capsSync.
await page.goto(BASE + "/admin/honours/caps", { waitUntil: "networkidle" });
await dismissTour(page);
await page.waitForTimeout(900);
await shotFull(page, "76-caps-after-import.png");

// Side effect 2: social queue auto-detections.
await page.goto(BASE + "/admin/social/queue", { waitUntil: "networkidle" });
await dismissTour(page);
await page.waitForTimeout(900);
await shotFull(page, "77-social-queue-after-import.png");

// Delete the import (Past imports -> Delete -> confirm dialog).
await page.goto(BASE + "/admin/import", { waitUntil: "networkidle" });
await dismissTour(page);
await page.waitForTimeout(800);
await page.locator('button:has-text("Delete")').last().click();
await page.waitForTimeout(500);
await shot(page, "78-import-delete-confirm.png");
const [delResp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/imports") && r.request().method() === "DELETE"),
  page.locator('[role="dialog"] button:has-text("Delete"), [role="alertdialog"] button:has-text("Delete")').last().click(),
]);
console.log("delete import status:", delResp.status());
await page.waitForTimeout(1200);
await shotFull(page, "79-import-after-delete.png");

// Post-delete state via API: stats and players and caps.
for (const p of ["/api/players", "/api/caps?grade=A%20Grade"]) {
  const r = await page.request.get(BASE + p);
  const b = await r.json().catch(() => null);
  console.log(p, "->", r.status(), Array.isArray(b) ? `${b.length} rows` : JSON.stringify(b).slice(0, 200));
}

await finish(s, "admin-07-import-cleanup.webm", "log-07-cleanup.txt");
