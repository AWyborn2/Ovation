/**
 * No database writes. Real PNG export harness + resized standalone/carousel
 * previews, all built-in packs/formats. Run with the web workflow running:
 * pnpm --filter @workspace/api-server exec tsx src/maintenance/team-list-heading-smoke.ts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { TEAM_INPUT } from "./team-name-browser-check";

const output = "/tmp/team-list-heading-smoke";
const browser = await puppeteer.launch({
  executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  await mkdir(output, { recursive: true });
  const page = await browser.newPage();
  await page.goto("http://localhost:80/__card-render", { waitUntil: "networkidle2" });
  await page.waitForFunction(() => !!(globalThis as any).__cardRenderHarness);
  const packs = [
    "club-kit-v1",
    "broadcast-dark-v1",
    "gold-foil-v1",
    "bold-type-v1",
    "neon-night-v1",
    "sunset-v1",
  ];
  const filter = (key: string) =>
    process.argv.find((a) => a.startsWith(`--${key}=`))?.split("=")[1];
  const grades = [
    "A Grade",
    "Female A Grade",
    "Western District Female Premier Championship Grade",
    "",
  ];
  for (const packId of packs)
    for (const size of ["square", "portrait", "story", "landscape"]) {
      if (
        (filter("pack") && filter("pack") !== packId) ||
        (filter("size") && filter("size") !== size)
      )
        continue;
      for (const [caseIndex, grade] of grades.entries()) {
        const input = {
          ...TEAM_INPUT,
          grade,
          players: TEAM_INPUT.players.map((p, i) => ({
            ...p,
            surname: i === 0 || i === 6 ? "Li" : p.surname,
            role: (["C", "WK", "C/WK", ""] as const)[i % 4],
          })),
        };
        const data = {
          brand: {
            name: "Test Cricket Club",
            primaryColour: "#FBAC27",
            backgroundColour: "#333F48",
          },
          presentingSponsorName: "Team Sponsor",
          hashtag: "#TESTCC",
        };
        const options = { size, packId, sponsorsOn: true, junior: false, data };
        const native = await page.evaluate(
          async (payload) => {
            const g = globalThis as any;
            g.headingPreviewRoot?.unmount();
            g.document.querySelector("#heading-preview")?.remove();
            return g.__cardRenderHarness.renderStill(payload);
          },
          { input, options },
        );
        await page.setViewport({ width: native.width, height: native.height });
        const exportPng = await (await page.$(native.selector))!.screenshot();
        await writeFile(`${output}/${packId}-${size}-${caseIndex}.png`, exportPng);
        // Mount the actual standalone PackCard OR carousel SlidePreview. Carousel
        // grade binding is exercised by the unit tests; these are frozen inputs.
        await page.evaluate(
          async ({ input, options, width, carousel }) => {
            const load = new Function("path", "return import(path)") as (p: string) => Promise<any>;
            const [{ default: React }, { default: ReactDOM }, { PackCard }, { SlidePreview }] =
              await Promise.all([
                load("/node_modules/.vite/deps/react.js"),
                load("/node_modules/.vite/deps/react-dom_client.js"),
                load("/src/components/pack-card.tsx"),
                load("/src/components/weekend-carousel/slide-preview.tsx"),
              ]);
            const g = globalThis as any,
              document = g.document;
            g.__cardRenderHarness.dispose();
            const host = document.createElement("div");
            host.id = "heading-preview";
            Object.assign(host.style, {
              position: "fixed",
              left: "0",
              top: "0",
              width: `${width}px`,
            });
            document.body.append(host);
            g.headingPreviewRoot = ReactDOM.createRoot(host);
            const slide = {
              id: "team",
              label: "Team",
              input,
              data: options.data,
              sponsorsOn: true,
              junior: false,
              warnings: [],
            };
            g.headingPreviewRoot.render(
              React.createElement(
                carousel ? SlidePreview : PackCard,
                carousel
                  ? { slide, size: options.size, packId: options.packId }
                  : { input, ...options },
              ),
            );
            await new Promise((r) => setTimeout(r, 100));
            if (carousel) {
              const frame = host.querySelector("[data-testid] > div");
              Object.assign(frame.style, { maxWidth: "none", border: "0", borderRadius: "0" });
            }
          },
          { input, options, width: native.width, carousel: caseIndex % 2 === 1 },
        );
        await page.waitForFunction(() => {
          const root = (globalThis as any).document.querySelector("#heading-preview");
          return (
            root?.querySelector("[data-team-grade-ready]") ||
            root?.textContent?.includes("too long")
          );
        });
        assert(
          await page.$("#heading-preview [data-team-grade-ready]"),
          `${packId}/${size}/${grade}: ${await page.$eval("#heading-preview", (el) => el.textContent)}`,
        );
        const previewPng = await (await page.$("#heading-preview .pack-card-root"))!.screenshot();
        const a = await sharp(exportPng).ensureAlpha().raw().toBuffer();
        const b = await sharp(previewPng).ensureAlpha().raw().toBuffer();
        assert.equal(a.length, b.length);
        let diff = 0;
        for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
        assert(diff / a.length < 1, `${packId}/${size}/${grade}: export/preview mismatch`);
        for (const width of [native.width, 390, 290]) {
          await page.$eval(
            "#heading-preview",
            (el, width) => {
              (el as any).style.width = `${width}px`;
            },
            width,
          );
          await new Promise((r) => setTimeout(r, 80));
          const errors = await page.$eval(
            "#heading-preview",
            (root, expected) => {
              const { document, getComputedStyle } = globalThis as any;
              const errors: string[] = [];
              const heading = root.querySelector("[data-team-grade]")! as any;
              if (heading.textContent !== (expected.grade.toUpperCase() || "TEAM LIST"))
                errors.push("wrong grade");
              if (
                heading.scrollWidth > heading.clientWidth + 1 ||
                heading.scrollHeight > heading.clientHeight + 1
              )
                errors.push("grade clipped");
              const h = heading.getBoundingClientRect();
              const body = root.querySelector("[data-skeleton-body]")! as any;
              const footer = root.querySelector("[data-ck-footer]") ?? body.nextElementSibling;
              const footerTop = footer!.getBoundingClientRect().top;
              const names = Array.from(root.querySelectorAll("[data-xi-name]")) as any[];
              names.forEach((name, i) => {
                const row = name.parentElement,
                  r = row.getBoundingClientRect(),
                  n = name.getBoundingClientRect();
                const next = names[i + 1]?.parentElement.getBoundingClientRect();
                const list = name.closest("[data-xi-fit]").getBoundingClientRect();
                if (name.textContent !== expected.players[i].surname)
                  errors.push(`name ${i} changed`);
                if (name.scrollWidth > name.clientWidth + 1) errors.push(`name ${i} clipped`);
                if (r.top < h.bottom - 1 || r.right > list.right + 1 || r.bottom > footerTop + 1)
                  errors.push(`row ${i} out of bounds`);
                if (i % 6 < 5 && next && r.bottom > next.top + 1) errors.push(`row ${i} overlap`);
                const role = row.querySelector("[data-xi-role]");
                if (
                  (role?.textContent ?? "") !==
                  (expected.players[i].role ? `(${expected.players[i].role})` : "")
                )
                  errors.push(`role ${i} changed`);
                if (role) {
                  const badge = role.getBoundingClientRect();
                  const scale = n.width / name.clientWidth;
                  const gap = (badge.left - n.right) / scale;
                  if (gap < -0.1 || gap > parseFloat(getComputedStyle(name).fontSize) * 0.5)
                    errors.push(`role ${i} detached`);
                  if (badge.right > r.right + 1 || badge.bottom > r.bottom + 1)
                    errors.push(`role ${i} overflow`);
                }
                const range = document.createRange();
                range.selectNodeContents(name);
                for (const glyph of Array.from(range.getClientRects()) as any[]) {
                  if (
                    glyph.left < n.left - 1 ||
                    glyph.right > n.right + 1 ||
                    glyph.bottom > r.bottom + 1
                  )
                    errors.push(`name ${i} glyph clipped`);
                }
              });
              return errors;
            },
            input,
          );
          assert.deepEqual(errors, [], `${packId}/${size}/${grade} width ${width}`);
        }
      }
      console.log(`PASS ${packId}/${size}: grades, roles, resized previews, PNG parity`);
    }
} finally {
  await browser.close();
}
