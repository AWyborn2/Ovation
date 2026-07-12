// Platform super-admin console: gate, bad password, tenants list, tenant
// detail + branding card, provision page (screenshot only), and a club-admin
// session must NOT grant access.
import { launch, shot, report, APEX, brokenImages } from "./onboarding-lib.mjs";

const notes = [];

// --- Main console walk ---------------------------------------------------------
{
  const { page, finish } = await launch({ videoName: "platform-admin.webm" });

  await page.goto(APEX + "/platform-admin", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, "30-platform-admin-gate.png");

  // Wrong password first — how does the gate fail?
  await page.fill("#pa-email", "ash.wyborn@charleshull.com.au");
  await page.fill("#pa-password", "wrong-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForTimeout(1200);
  await shot(page, "31-platform-admin-bad-password.png");
  notes.push(
    `bad-password message: ${(await page.evaluate(() => document.body.innerText)).match(/[^\n]*(incorrect|failed|invalid|wrong)[^\n]*/i)?.[0] ?? "(none found)"}`,
  );

  await page.fill("#pa-password", "PlatformAdmin!2026");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForTimeout(2000);
  await shot(page, "32-platform-admin-tenants-list.png", { fullPage: true });
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll("table tr, [role=row]")).length,
  );
  notes.push(`tenant list row elements: ${rows}`);
  notes.push(
    `tenants visible: ${(await page.evaluate(() => document.body.innerText)).includes("dawesville") ? "includes dawesville" : "NO dawesville"}`,
  );

  // Open the Dawesville tenant detail (the one we just provisioned).
  const link = page.locator("a", { hasText: /dawesville/i }).first();
  if (await link.isVisible().catch(() => false)) {
    await link.click();
  } else {
    await page.goto(APEX + "/platform-admin/tenants/12");
  }
  await page.waitForTimeout(1500);
  await shot(page, "33-platform-admin-tenant-detail-dawesville.png", {
    fullPage: true,
  });
  notes.push(`tenant detail url: ${page.url()}`);

  // Branding card focus shot (if identifiable).
  const brandingCard = page
    .locator("div,section", { hasText: /branding/i })
    .last();
  if (await brandingCard.isVisible().catch(() => false)) {
    await brandingCard
      .screenshot({
        path: "/home/user/Ovation/docs/product-review/evidence/onboarding-platform/34-platform-admin-branding-card.png",
      })
      .catch(() => notes.push("branding card screenshot failed"));
  }

  // Provision page — screenshot only, DO NOT provision.
  await page.goto(APEX + "/platform-admin/provision", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1000);
  await shot(page, "35-platform-admin-provision.png", { fullPage: true });

  const broken = await brokenImages(page);
  const log = await finish();
  report("PLATFORM ADMIN", log, { notes, brokenImages: broken });
}

// --- Isolation: club-admin session must not open the platform console ----------
{
  const { page, finish } = await launch({ videoName: "platform-admin-isolation.webm" });
  const notes2 = [];
  await page.goto("http://halls-head.ovation.test:24624/admin", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(600);
  const later = page.getByRole("button", { name: "Maybe later" });
  if (await later.isVisible().catch(() => false)) await later.click();
  await page.fill("#username", "owner");
  await page.fill("#password", "ReviewAdmin!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(2000);
  notes2.push(`halls-head admin login landed: ${page.url()}`);
  await shot(page, "36-club-admin-logged-in-halls-head.png");

  // Now the apex platform console with only the club-admin session.
  await page.goto(APEX + "/platform-admin", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "37-platform-admin-with-club-session.png");
  const gated = await page
    .locator("#pa-email")
    .isVisible()
    .catch(() => false);
  notes2.push(
    `apex /platform-admin with club-admin session shows login gate: ${gated}`,
  );
  // Belt and braces: does the platform tenants API leak?
  const api = await page.evaluate(async () => {
    const r = await fetch("/api/platform/tenants");
    return `${r.status} ${(await r.text()).slice(0, 120)}`;
  });
  notes2.push(`GET /api/platform/tenants with club session -> ${api}`);
  const log = await finish();
  report("PLATFORM ADMIN ISOLATION", log, { notes: notes2 });
}
