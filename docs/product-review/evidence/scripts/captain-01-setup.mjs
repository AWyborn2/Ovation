// Flow 1: club admin creates a captain account (People → Captains).
import {
  makeSession, shot, shotFull, adminLogin, finish, BASE,
  CAPTAIN_USER, CAPTAIN_PASS,
} from "./captain-lib.mjs";

const s = await makeSession();
const { page } = s;

await adminLogin(page);
await shot(page, "01-admin-dashboard.png");

// Try to find Captains from the admin dashboard nav (discoverability check).
const peopleLink = page.locator('a[href*="/admin/people"], a:has-text("People")').first();
console.log("people link visible on dashboard:", await peopleLink.count());

await page.goto(BASE + "/admin/people/captains", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await shot(page, "02-captains-empty.png");

// Open the create form.
await page.click('button:has-text("New captain")');
await page.waitForTimeout(300);
await shotFull(page, "03-captain-form-blank.png");

// Try submitting with nothing (validation behaviour).
const createBtn = page.locator('button:has-text("Create captain")');
console.log("create disabled when blank:", await createBtn.isDisabled());

// Fill the form.
await page.fill('input[placeholder="e.g. agrade-captain"]', CAPTAIN_USER);
await page.fill('input[placeholder="e.g. A Grade Captain"]', "Review Captain");
await page.fill('input[type="password"]', CAPTAIN_PASS);
await page.locator('label:has-text("A Grade") input[type="checkbox"]').first().check();
await page.locator('label:has-text("B Grade") input[type="checkbox"]').first().check();
await shotFull(page, "04-captain-form-filled.png");
await createBtn.click();
await page.waitForTimeout(1200);
await shotFull(page, "05-captain-created.png");

// Duplicate username handling: create the same username again.
await page.click('button:has-text("New captain")');
await page.fill('input[placeholder="e.g. agrade-captain"]', CAPTAIN_USER);
await page.fill('input[placeholder="e.g. A Grade Captain"]', "Duplicate Captain");
await page.fill('input[type="password"]', "Whatever!123");
await page.locator('button:has-text("Create captain")').click();
await page.waitForTimeout(1200);
await shot(page, "06-captain-duplicate-error.png");
await page.click('button:has-text("Close form")').catch(() => {});

// Edit flow: open edit on the captain, look at grade toggles.
await page.locator('button:has-text("Edit")').first().click();
await page.waitForTimeout(400);
await shotFull(page, "07-captain-edit.png");

await finish(s, "captain-01-setup.webm", "captain-01-setup.log");
