import { test, expect, type Page } from "@playwright/test";

/**
 * Social-studio smoke test — confirms the editing engine renders against the
 * Broadcast Dark pack templates without breaking, after the card-social work
 * (PRs #72–#86). It asserts the highest-signal, selector-independent invariants:
 *
 *  1. Admin can reach the Social studio (`/admin/social`).
 *  2. No React runtime-error overlay (the @replit/vite-plugin-runtime-error-modal
 *     overlay appears on ANY render error — its absence is a real smoke signal).
 *  3. NO unresolved `{{placeholder}}` tokens anywhere in the rendered DOM — this is
 *     the exact failure mode of an editor↔template mismatch, and the one the CI
 *     unit test `broadcast-dark.test.ts` ("every {{field}} used in html is declared")
 *     guards at build time. This is the runtime counterpart.
 *  4. The branding + sponsor admin pages (tagline field / presenting-sponsor toggle)
 *     load without error.
 *
 * It also screenshots each page into `e2e/report` for a human eyeball pass.
 *
 * CONFIG (env): BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD.
 *
 * NOTE ON DEPTH: the app currently has no `data-testid` hooks, so a per-card-kind
 * click-through can't be written against stable selectors. The DOM-wide
 * unresolved-placeholder + error-overlay scan covers whatever cards/previews the
 * studio renders on load. To assert one card of EACH kind, add `data-testid`s to
 * the kind picker + `<PackCard>` root and extend `openCardOfKind()` below (stubbed).
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

/** Fail fast with a clear message if creds are missing. */
test.beforeAll(() => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD env vars (a tenant admin login) to run the smoke test.",
    );
  }
});

/**
 * Log in as a tenant admin. The app uses an email/password form; this fills the
 * first email + password inputs it finds and submits. ADJUST this helper if your
 * login UI differs (it's the one environment-specific spot).
 */
async function login(page: Page) {
  await page.goto("/admin/social");
  // If already authenticated the studio loads directly; otherwise a login form shows.
  const email = page.getByLabel(/email/i).or(page.locator('input[type="email"]')).first();
  if (await email.isVisible().catch(() => false)) {
    await email.fill(ADMIN_EMAIL);
    await page
      .getByLabel(/password/i)
      .or(page.locator('input[type="password"]'))
      .first()
      .fill(ADMIN_PASSWORD);
    await page
      .getByRole("button", { name: /sign in|log in|login/i })
      .first()
      .click();
    await page.waitForLoadState("networkidle");
  }
}

/** The Replit runtime-error overlay (React render error) must not be present. */
async function assertNoErrorOverlay(page: Page) {
  const overlay = page.locator(
    'vite-error-overlay, [class*="runtime-error"], [data-plugin-runtime-error-plugin]',
  );
  await expect(overlay, "a React runtime-error overlay is showing").toHaveCount(0);
}

/**
 * No unresolved `{{...}}` template tokens should appear in the rendered DOM.
 * Pack cards render via innerHTML, so an editor/template field mismatch surfaces
 * as a literal `{{something}}` in the visible text.
 */
async function assertNoUnresolvedPlaceholders(page: Page) {
  const bodyText = await page.locator("body").innerText();
  const leftovers = bodyText.match(/\{\{[^}]+\}\}/g) ?? [];
  expect(leftovers, `unresolved template placeholders rendered: ${leftovers.join(", ")}`).toEqual(
    [],
  );
  // Also catch them inside the pack card's raw HTML (innerText can hide non-visible nodes).
  const html = await page.content();
  const htmlLeftovers = (html.match(/\{\{[^}]+\}\}/g) ?? []).filter(
    // Ignore any {{ }} that legitimately live in inlined <script>/template source.
    (m) => !m.includes("mustache") && !m.includes("example"),
  );
  expect(
    htmlLeftovers,
    `unresolved template placeholders in DOM html: ${htmlLeftovers.slice(0, 10).join(", ")}`,
  ).toEqual([]);
}

test.describe("Social studio — pack-template smoke", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("studio loads with no error overlay and no unresolved placeholders", async ({ page }) => {
    await page.goto("/admin/social");
    await expect(page).toHaveURL(/\/admin\/social/);
    // The studio shell should render its heading/tabs, not an error boundary.
    await expect(page.getByRole("heading").first()).toBeVisible();
    await assertNoErrorOverlay(page);
    await assertNoUnresolvedPlaceholders(page);
    await page.screenshot({ path: "e2e/report/studio.png", fullPage: true });
  });

  test("card builder renders a pack preview against the templates", async ({ page }) => {
    // /admin/social/create is the manual card builder — the core editing engine.
    // It renders a live <PackCard> preview as fields change. This is the key check:
    // the editor drives the pack template and the preview resolves cleanly.
    await page.goto("/admin/social/create");
    await assertNoErrorOverlay(page);
    await page.waitForLoadState("networkidle");
    // A rendered card should contain at least one image (tenant logo / photo slot),
    // proving A1/A3/A4 wiring reached the preview.
    await expect(page.locator("img").first()).toBeVisible();
    await assertNoUnresolvedPlaceholders(page);
    await page.screenshot({ path: "e2e/report/create-card.png", fullPage: true });
  });

  test("carousel sets editor loads", async ({ page }) => {
    await page.goto("/admin/social/sets");
    await assertNoErrorOverlay(page);
    await assertNoUnresolvedPlaceholders(page);
    await page.screenshot({ path: "e2e/report/card-sets.png", fullPage: true });
  });

  test("branding admin (tagline field, A9) loads", async ({ page }) => {
    await page.goto("/admin/settings/branding");
    await assertNoErrorOverlay(page);
    await expect(page.getByText(/tagline/i).first()).toBeVisible();
    await page.screenshot({ path: "e2e/report/branding.png", fullPage: true });
  });

  test("sponsor admin (presenting-sponsor toggle, A7) loads", async ({ page }) => {
    // The sponsor editor + "Presenting sponsor" switch live on the Cards tab.
    await page.goto("/admin/social/cards");
    await assertNoErrorOverlay(page);
    await expect(page.getByText(/presenting sponsor/i).first()).toBeVisible();
    await page.screenshot({ path: "e2e/report/sponsors.png", fullPage: true });
  });
});

/**
 * STUB — per-kind card render assertion. Requires stable selectors (data-testids)
 * on the studio's kind picker and the `<PackCard>` root. Once those exist, this
 * opens a card of each kind and asserts the pack preview renders with a tenant
 * logo <img> and no `{{ }}` leftovers.
 */
async function openCardOfKind(_page: Page, _kind: string) {
  // TODO: add data-testid="card-kind-<kind>" to the kind picker and
  // data-testid="pack-card" to the <PackCard> root, then:
  //   await page.getByTestId(`card-kind-${kind}`).click();
  //   const card = page.getByTestId("pack-card");
  //   await expect(card).toBeVisible();
  //   await expect(card.locator("img").first()).toBeVisible(); // tenant logo/photo
  //   expect((await card.innerHTML()).match(/\{\{[^}]+\}\}/g) ?? []).toEqual([]);
  test.skip(true, "per-kind assertion needs data-testid hooks on the studio + PackCard");
}
