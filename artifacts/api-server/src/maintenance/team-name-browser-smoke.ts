/**
 * Real native harness PNGs + responsive PackCard checks (no DB writes).
 * pnpm --filter @workspace/api-server exec tsx src/maintenance/team-name-browser-smoke.ts
 */
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { TEAM_INPUT, assertTeamNames } from "./team-name-browser-check";

const browser = await puppeteer.launch({
  executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 2200 });
  await page.goto("http://localhost:80/__card-render", { waitUntil: "networkidle2" });
  await page.waitForFunction(() => Boolean((globalThis as any).__cardRenderHarness));
  await mkdir("/tmp/team-name-check", { recursive: true });
  const cases = [
    { label: "11", input: { ...TEAM_INPUT, players: TEAM_INPUT.players.slice(0, 11) } },
    { label: "12", input: TEAM_INPUT },
    {
      label: "dense",
      input: {
        ...TEAM_INPUT,
        numbering: "shirt",
        players: TEAM_INPUT.players.map((p, i) => ({
          ...p,
          surname: `${i % 2 ? "WWWMMMMWWWW" : "Venkatanarasimharaju"}-Worthington`,
          shirtNumber: [1, 11, 88, 100][i % 4],
        })),
      },
    },
    {
      label: "short",
      input: {
        ...TEAM_INPUT,
        players: TEAM_INPUT.players.map((p) => ({ ...p, surname: "Lee", role: "" })),
      },
    },
  ];
  for (const { label, input } of cases)
    for (const size of ["square", "portrait", "story", "landscape"]) {
      const meta = await page.evaluate(
        async (input, size) =>
          (globalThis as any).__cardRenderHarness.renderStill({
            input,
            options: {
              size,
              packId: "club-kit-v1",
              sponsorsOn: true,
              junior: false,
              data: {
                brand: {
                  name: "Test Cricket Club",
                  primaryColour: "#FBAC27",
                  backgroundColour: "#333F48",
                },
                presentingSponsorName: "Team Sponsor",
                hashtag: "#TESTCC",
              },
            },
          }),
        input,
        size,
      );
      const expected = input.players.map((p) => p.surname);
      const metrics = await assertTeamNames(page, meta.selector, expected);
      if (
        label === "short" &&
        Math.abs(parseFloat(metrics.size) - (size === "landscape" ? 14.49 : 24.84)) > 0.01
      ) {
        throw new Error("Short-name lineup was unnecessarily shrunk");
      }
      const card = await page.$(meta.selector);
      await card!.screenshot({ path: `/tmp/team-name-check/${size}-${label}.png` });
      // Resize the PackCard display, not its native layout: glyph geometry must
      // remain valid after scaling, and the fitting decision must be identical.
      await page.$eval(meta.selector, (el) => {
        (el as any).style.transform = "scale(.32)";
        (el as any).style.transformOrigin = "top left";
      });
      await assertTeamNames(page, meta.selector, expected);
      console.log(size, label, metrics);
    }
} finally {
  await browser.close();
}
