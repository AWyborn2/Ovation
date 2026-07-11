// Flow 5: live CSV import at /admin/import — upload the A Grade 2025/26 season
// CSV, inspect the preview (player resolution UI), Confirm & Apply, then verify
// the result (stats rows) and how errors/success are surfaced.
import { makeSession, finish, shot, shotFull, login, dismissTour, BASE } from "./admin-lib.mjs";

const CSV = "/home/user/Ovation/attached_assets/A_Grade_2025.26_season_stats_1780356874929.csv";

const s = await makeSession();
const { page } = s;
await login(page);

await page.goto(BASE + "/admin/import", { waitUntil: "networkidle" });
await dismissTour(page);
await page.waitForTimeout(600);
await shotFull(page, "70-import-page.png");

// First: submit with NO file to see validation.
await page.click('button:has-text("Upload & Preview")');
await page.waitForTimeout(500);
await shot(page, "71-import-no-file-error.png");
console.log("no-file error:", await page.locator("form .text-destructive").allInnerTexts().catch(() => []));

// Now the real file. Season select: pick 2026 (2025/26) if present.
await page.setInputFiles("#csv", CSV);
const seasonOptions = await page.locator("#season option").allInnerTexts();
console.log("season options:", JSON.stringify(seasonOptions.slice(0, 6)), "…total", seasonOptions.length);
// choose the option labelled 2025/26 if it exists
const want = await page.locator('#season option:has-text("2025/26")').getAttribute("value").catch(() => null);
if (want) await page.selectOption("#season", want);
console.log("selected season value:", await page.locator("#season").inputValue());

const [uploadResp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/imports/playcricket-csv")),
  page.click('button:has-text("Upload & Preview")'),
]);
console.log("upload status:", uploadResp.status());
const uploadBody = await uploadResp.json().catch(() => null);
console.log("upload summary keys:", uploadBody ? Object.keys(uploadBody).join(",") : "(none)");
if (uploadBody?.players) {
  const st = {};
  for (const p of uploadBody.players) st[p.status] = (st[p.status] || 0) + 1;
  console.log("player statuses:", JSON.stringify(st), "rows:", uploadBody.players.length);
}
await page.waitForTimeout(1000);
await shotFull(page, "72-import-preview.png");

// Any unresolved suggestion warnings?
const warn = await page.locator("text=/suggested name/i").allInnerTexts().catch(() => []);
console.log("suggestion warnings:", JSON.stringify(warn));

// Confirm & Apply.
const confirmBtn = page.locator('button:has-text("Confirm & Apply")');
const disabled = await confirmBtn.isDisabled().catch(() => "n/a");
console.log("confirm disabled:", disabled);
if (disabled === false) {
  const [commitResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/imports") && r.request().method() === "POST" && r.url().includes("commit")),
    confirmBtn.click(),
  ]).catch(async (e) => {
    console.log("commit wait fallback:", e.message);
    return [null];
  });
  if (commitResp) console.log("commit status:", commitResp.status(), JSON.stringify(await commitResp.json().catch(() => null)).slice(0, 300));
  await page.waitForTimeout(1500);
  await shotFull(page, "73-import-committed.png");
}

// Where did it land? Check the stats admin + public players page.
await page.goto(BASE + "/admin/people/stats", { waitUntil: "networkidle" });
await dismissTour(page);
await page.waitForTimeout(1000);
await shotFull(page, "74-people-stats-after-import.png");

await page.goto(BASE + "/players", { waitUntil: "networkidle" });
await dismissTour(page);
await page.waitForTimeout(1000);
await shot(page, "75-public-players-after-import.png");

await finish(s, "admin-05-import.webm", "log-05-import.txt");
