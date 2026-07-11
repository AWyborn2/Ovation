// Context capture: the admin Awards tab (where award voting would be opened)
// with an empty season — the other half of the captain 3-2-1 voting story.
import { makeSession, shot, shotFull, adminLogin, finish, BASE } from "./captain-lib.mjs";

const s = await makeSession({ video: false });
const { page } = s;
await adminLogin(page);
await page.goto(BASE + "/admin/honours/awards", { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await shotFull(page, "50-admin-awards-empty.png");

// Can an award be created with no season/matches? Open the form if present.
const newBtn = page.locator('button:has-text("New award"), button:has-text("Add award"), button:has-text("Create")').first();
if (await newBtn.count()) {
  await newBtn.click();
  await page.waitForTimeout(500);
  await shotFull(page, "51-admin-awards-new-form.png");
}
await finish(s, null, "captain-07-awards-empty.log");
