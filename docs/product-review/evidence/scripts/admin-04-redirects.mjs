// Flow 4: legacy flat admin URLs must redirect into the new group+tab paths.
import { makeSession, finish, shot, login, dismissTour, BASE } from "./admin-lib.mjs";

const legacy = [
  "/admin/premierships",
  "/admin/awards",
  "/admin/players",
  "/admin/stats",
  "/admin/life-members",
  "/admin/trading-cards",
  "/admin/match-display",
  "/admin/junior-committee",
];

const s = await makeSession();
const { page } = s;
await login(page);

let n = 60;
for (const path of legacy) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await dismissTour(page);
  await page.waitForTimeout(600);
  const finalUrl = page.url();
  const activeTab = await page
    .locator('[role="tab"][data-state="active"]')
    .innerText()
    .catch(() => "(none)");
  console.log(`${path} -> ${finalUrl.replace(BASE, "")} (active tab: ${activeTab})`);
  await shot(page, `${n}-redirect-${path.split("/").pop()}.png`);
  n++;
}

await finish(s, "admin-04-redirects.webm", "log-04-redirects.txt");
