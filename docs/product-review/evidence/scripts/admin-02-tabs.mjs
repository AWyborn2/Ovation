// Flow 2: admin hub tiles + every tab of the four consolidated groups.
// Navigates each tab by deep link (also proves deep-linkability), screenshots it,
// and records visible tab labels per group (to spot entitlement-hidden tabs).
import { makeSession, finish, shot, shotFull, login, dismissTour, BASE } from "./admin-lib.mjs";

const groups = [
  {
    name: "social",
    prefix: 10,
    tabs: [
      ["studio", "/admin/social"],
      ["cards", "/admin/social/cards"],
      ["create", "/admin/social/create"],
      ["sets", "/admin/social/sets"],
      ["juniors", "/admin/social/juniors"],
      ["trading-cards", "/admin/social/trading-cards"],
      ["queue", "/admin/social/queue"],
    ],
  },
  {
    name: "settings",
    prefix: 20,
    tabs: [
      ["matches", "/admin/settings"],
      ["records", "/admin/settings/records"],
      ["honour-boards", "/admin/settings/honour-boards"],
      ["milestone-board", "/admin/settings/milestone-board"],
      ["junior-matches", "/admin/settings/junior-matches"],
      ["tour", "/admin/settings/tour"],
      ["nav", "/admin/settings/nav"],
      ["branding", "/admin/settings/branding"],
    ],
  },
  {
    name: "people",
    prefix: 30,
    tabs: [
      ["players", "/admin/people"],
      ["stats", "/admin/people/stats"],
      ["committee", "/admin/people/committee"],
      ["captains", "/admin/people/captains"],
      ["junior-office-bearers", "/admin/people/junior-office-bearers"],
      ["non-players", "/admin/people/non-players"],
    ],
  },
  {
    name: "honours",
    prefix: 40,
    tabs: [
      ["premierships", "/admin/honours"],
      ["awards", "/admin/honours/awards"],
      ["team-of-decade", "/admin/honours/team-of-decade"],
      ["caps", "/admin/honours/caps"],
      ["life-members", "/admin/honours/life-members"],
      ["junior-premierships", "/admin/honours/junior-premierships"],
      ["display", "/admin/honours/display"],
    ],
  },
];

const s = await makeSession();
const { page } = s;
await login(page);
const report = [];

for (const g of groups) {
  let i = 0;
  for (const [slug, path] of g.tabs) {
    i++;
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch((e) => {
      report.push({ group: g.name, tab: slug, navError: e.message });
    });
    await dismissTour(page);
    await page.waitForTimeout(900);
    const num = String(g.prefix + i).padStart(2, "0");
    await shotFull(page, `${num}-${g.name}-${slug}.png`);
    const tabLabels = await page
      .locator('[role="tablist"] [role="tab"]')
      .allInnerTexts()
      .catch(() => []);
    const activeTab = await page
      .locator('[role="tab"][data-state="active"]')
      .innerText()
      .catch(() => "(none)");
    const bodyText = await page
      .locator('[role="tabpanel"][data-state="active"], main')
      .first()
      .innerText()
      .catch(() => "");
    const hasErrorText = /error|failed|something went wrong|not found/i.test(bodyText);
    report.push({
      group: g.name,
      tab: slug,
      url: page.url(),
      activeTab,
      tabLabels: tabLabels.join(" | "),
      panelChars: bodyText.length,
      panelSnippet: bodyText.replace(/\s+/g, " ").slice(0, 260),
      hasErrorText,
    });
    console.log(`${g.name}/${slug}: active="${activeTab}" panel=${bodyText.length}ch err=${hasErrorText}`);
  }
}

const fs = await import("fs");
fs.writeFileSync(
  "/home/user/Ovation/docs/product-review/evidence/club-admin/tab-sweep-report.json",
  JSON.stringify(report, null, 2)
);
await finish(s, "admin-02-tabs.webm", "log-02-tabs.txt");
