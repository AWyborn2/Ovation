// Flow 6+7: /admin/users — list, create a second admin, verify, delete it —
// then sign out and confirm the admin pages are gated again.
import { makeSession, finish, shot, shotFull, login, dismissTour, BASE } from "./admin-lib.mjs";

const s = await makeSession();
const { page } = s;
await login(page);

await page.goto(BASE + "/admin/users", { waitUntil: "networkidle" });
await dismissTour(page);
await page.waitForTimeout(800);
await shotFull(page, "80-users-list.png");

// Create a second admin. The Add admin card has 3 inputs in order.
const addCard = page.locator('div:has(> div > div:text("Add admin")), .card, [class*="card"]').filter({ hasText: "Add admin" }).first();
const inputs = addCard.locator("input");
console.log("add-card input count:", await inputs.count());
await inputs.nth(0).fill("review-tester");
await inputs.nth(1).fill("Review Tester");
await inputs.nth(2).fill("ReviewTester!2026");
await shot(page, "81-users-add-filled.png");
const [createResp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/admins") && r.request().method() === "POST"),
  addCard.locator('button:has-text("Add admin")').click(),
]);
console.log("create status:", createResp.status(), JSON.stringify(await createResp.json().catch(() => null)));
await page.waitForTimeout(800);
await shotFull(page, "82-users-after-create.png");

// Sanity: new admin can sign in (separate context not needed — just verify via API).
const probe = await page.request.post(BASE + "/api/auth/login", {
  data: { username: "review-tester", password: "ReviewTester!2026" },
});
console.log("new admin login probe status:", probe.status());

// Delete it (row has a Delete button; confirm dialog follows).
const row = page.locator('div:has-text("@review-tester")').last();
await page.locator('div:has(> div > div:text("@review-tester"))').first();
const delBtn = page.locator("text=@review-tester").locator("xpath=ancestor::div[contains(@class,'rounded') or contains(@class,'border')][1]").locator('button:has-text("Delete")').first();
if (await delBtn.count()) {
  await delBtn.click();
} else {
  // fallback: last Delete button on the page
  await page.locator('button:has-text("Delete")').last().click();
}
await page.waitForTimeout(500);
await shot(page, "83-users-delete-confirm.png");
const [delResp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/admins") && r.request().method() === "DELETE"),
  page.locator('[role="dialog"] button:has-text("Delete"), [role="alertdialog"] button:has-text("Delete")').last().click(),
]);
console.log("delete status:", delResp.status());
await page.waitForTimeout(800);
await shotFull(page, "84-users-after-delete.png");
console.log("remaining admins text:", (await page.locator("main").innerText().catch(() => "")).match(/@[\w-]+/g));

// Flow 7: sign out.
await page.locator('button:has-text("Sign out")').first().click();
await page.waitForTimeout(1200);
await shot(page, "85-after-signout.png");
console.log("post-signout url:", page.url());

// Gate check: admin pages again.
await page.goto(BASE + "/admin/people/stats", { waitUntil: "networkidle" });
await dismissTour(page);
await page.waitForTimeout(600);
const gate = await page.locator("#username").count();
console.log("gated (login form shown):", gate > 0, "url:", page.url());
await shot(page, "86-gate-after-signout.png");

// API-level check: /api/auth/me must be 401 now.
const me = await page.request.get(BASE + "/api/auth/me");
console.log("/api/auth/me after signout:", me.status());

await finish(s, "admin-06-users-logout.webm", "log-06-users.txt");
