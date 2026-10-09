import assert from "node:assert/strict";
import type { HTTPRequest, Page } from "puppeteer-core";
import { CAROUSEL_PACK_IDS } from "@workspace/scorecard/queued-carousel";

/** Browser-only fixture responses. Auth and production routes remain untouched. */
export async function auditCarouselBuilder(page: Page, fixture: {
  brand: Record<string, unknown>; photo: string; sponsors: Record<string, unknown>[];
}, output: string) {
  const submissions: Record<string, any>[] = [];
  await page.setRequestInterception(true);
  const intercept = async (request: HTTPRequest) => {
    const url = new URL(request.url());
    let body: unknown;
    if (url.pathname === "/api/social-settings") {
      body = { brand: fixture.brand, settings: { sponsorsEnabled: true, clubHashtag: "#BrowserCheck" }, activeSponsors: fixture.sponsors };
    } else if (url.pathname === "/api/weekend-carousel/sources") {
      const type = url.searchParams.get("setType");
      const fixtures = [1, 2].map(id => ({
        id, grade: "A Grade", opponentName: `Visitors ${id}`, startAt: "2026-10-10T04:00:00Z",
        isHome: true, venue: "Test Ground", roundLabel: "Round 1", source: "manual", createdAt: "",
      }));
      const input = type === "teamList"
        ? { kind: "teamList", grade: "A Grade", gradeRound: "A GRADE", venueDateTime: "Test Ground",
            players: [{ order: 1, surname: "Test Full Name", role: "C/WK" }] }
        : { kind: "matchSummary", matchTitle: "A Grade • Round 1", roundLabel: "Round 1",
            club: { name: "Test Club" }, opposition: { name: "Visitors" },
            grade: "A Grade", result: "Won by 40 runs", carouselDetail: type === "matchSummary",
            innings: [{ teamKey: "club", inningsNum: 1, totalRuns: "200", wickets: "6", overs: "40",
              topBatters: [{ name: "Test Batter", runs: 80 }], topBowlers: [{ name: "Test Bowler", wickets: 3, runs: 20, overs: "8" }] }] };
      body = { fixtures, photos: [{ id: 1, grade: "A Grade", photoTypes: ["batting"], url: fixture.photo }],
        coverPhotos: [{ id: 2, grade: null, season: 2026, photoTypes: ["club"], url: fixture.photo }],
        content: type === "matchDay" ? {} : { 1: input, 2: input }, warnings: [], timeZone: "Australia/Perth" };
    } else if (url.pathname === "/api/social-drafts" && request.method() === "POST") {
      const submission = JSON.parse(request.postData()!);
      submissions.push(submission);
      body = { ...submission, id: 10000 + submissions.length, status: "awaiting_review" };
    }
    if (body !== undefined) await request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    else await request.continue();
  };
  page.on("request", intercept);
  try {
    for (const type of ["matchDay", "teamList", "results", "matchSummary"]) {
      await page.evaluate(async type => {
        const load = new Function("p", "return import(p)") as (p: string) => Promise<any>;
        const g = globalThis as any;
        // Match Vite's versioned URL; loading an unversioned copy creates a
        // second QueryClientContext rather than the app's existing context.
        const source = await (await g.fetch("/src/components/weekend-carousel/use-weekend-carousel.ts")).text();
        const queryPath = source.match(/"([^"]*@tanstack_react-query\.js[^"]*)"/)?.[1];
        if (!queryPath) throw new Error("Cannot locate the app's QueryClient provider");
        const [React, ReactDOM, query, component] = await Promise.all([
          load("/node_modules/.vite/deps/react.js"), load("/node_modules/.vite/deps/react-dom_client.js"),
          load(queryPath), load("/src/components/weekend-carousel/weekend-carousel.tsx"),
        ]);
        const document = g.document;
        g.auditRoot?.unmount();
        document.querySelector("#audit-preview")?.remove();
        const host = document.createElement("div"); host.id = "audit-preview"; document.body.append(host);
        g.auditRoot = ReactDOM.default.createRoot(host);
        g.auditRoot.render(React.default.createElement(query.QueryClientProvider, { client: new query.QueryClient() },
          React.default.createElement(component.WeekendCarousel, { initialType: type })));
      }, type);
      const opener = type === "matchDay" ? "button-open-weekend-carousel" : `button-open-carousel-${type}`;
      await page.waitForSelector(`[data-testid="${opener}"]`);
      await page.click(`[data-testid="${opener}"]`);
      await page.waitForFunction(() => {
        const g = globalThis as any;
        return g.document.querySelector('[data-testid="button-generate-weekend"]')?.disabled === false;
      });
      await page.evaluate(() => { const g = globalThis as any; g.document.querySelector('[data-testid="button-generate-weekend"]').click(); });
      await page.waitForSelector('[data-testid="button-cover-photo-2"]');
      await page.evaluate(() => { const g = globalThis as any; g.document.querySelector('[data-testid="button-cover-photo-2"]').click(); });
      await page.waitForSelector('[aria-label="Cover zoom"]');
      await page.evaluate(() => {
        const g = globalThis as any;
        const document = g.document;
        for (const [selector, value] of [
          ['[aria-label="Cover zoom"]', "1.6"],
          ['[data-testid="input-weekend-caption"]', "My edited caption"],
        ]) {
          const el = document.querySelector(selector);
          const proto = el instanceof g.HTMLTextAreaElement ? g.HTMLTextAreaElement.prototype : g.HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
          el.dispatchEvent(new g.Event("input", { bubbles: true }));
          el.dispatchEvent(new g.Event("change", { bubbles: true }));
        }
        document.querySelector('[data-testid="team-1"] [aria-label$=" down"]').click();
      });
      for (const packId of CAROUSEL_PACK_IDS) {
        await page.select('[data-testid="select-carousel-pack"]', packId);
        for (const size of ["square", "portrait", "story", "landscape"]) {
          await page.evaluate(size => { const g = globalThis as any; g.document.querySelector(`[data-testid="button-size-${size}"]`).click(); }, size);
          await page.waitForFunction(() => { const g = globalThis as any; return g.document.querySelectorAll('[data-testid^="slide-"] .pack-card-root').length === 4; });
          assert.equal(await page.$eval('[data-testid="input-weekend-caption"]', el => (el as any).value), "My edited caption");
          assert.equal(await page.$('[data-testid="text-weekend-stale"]'), null);
        }
      }
      await page.evaluate(() => { const g = globalThis as any; g.document.querySelector('[data-testid="button-queue-weekend"]').click(); });
      await page.waitForSelector('[data-testid="status-weekend-queued"]');
      const payload = submissions.at(-1)!;
      assert.equal(payload.packId, "club-kit-v1");
      assert.equal(payload.cardInput.weekendCarousel.packId, "club-kit-v1");
      assert.equal(payload.caption, "My edited caption");
      assert.deepEqual(payload.cardInput.weekendCarousel.slides.map((s: any) => s.id), ["title", "fixture-2", "fixture-1", "sponsors"]);
      assert.equal(payload.cardInput.weekendCarousel.slides[0].data.photoTransform.zoom, 1.6);
      assert.equal(payload.cardInput.weekendCarousel.slides[1].data.photoUrl, fixture.photo);
      await page.screenshot({ path: `${output}/builder-${type}.png` });
      await page.evaluate(() => { const g = globalThis as any; g.auditRoot.unmount(); g.document.querySelector("#audit-preview")?.remove(); });
    }
  } finally {
    page.off("request", intercept);
    await page.setRequestInterception(false);
  }
}
