/** Font-loaded glyph bounds and real PNG parity for all built-in covers. */
import type { Page } from "puppeteer-core";
import { CAROUSEL_PACK_IDS } from "@workspace/scorecard/queued-carousel";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const LABELS = [
  "MIXED ROUNDS",
  "GRAND FINAL",
  "ROUND 12",
  "PRELIMINARY FINAL — WESTERN DISTRICT CHAMPIONSHIP",
  "WWWWMMMMWWWWMMMMWWWW",
  "",
  undefined,
];
const FORMATS = ["square", "portrait", "story", "landscape"] as const;
const DIMENSIONS = {
  square: [1080, 1080],
  portrait: [1080, 1350],
  story: [1080, 1920],
  landscape: [1200, 630],
};
// Local deterministic image: both preview/export use real photo slots without
// depending on a club upload or changing any saved crops.
const PHOTO = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#166dcc"/><rect x="450" width="450" height="600" fill="#cc4020"/></svg>',
).toString("base64")}`;

export async function assertCoverLabel(page: Page, selector: string, expected?: string) {
  const errors = await page.$eval(
    selector,
    async (root, expected) => {
      const { document, getComputedStyle, NodeFilter } = globalThis as any;
      await document.fonts.ready;
      const errors: string[] = [];
      const label = root.querySelector('[data-carousel-cover-label="1"]') as any;
      if (!label) return ["missing cover label marker"];
      if (label.textContent !== (expected ?? "")) errors.push("label changed or invented");
      // fonts.check alone also passes for an absent family. Require loaded faces
      // for the actual computed family and weight before measuring.
      const css = getComputedStyle(label);
      const faces = await document.fonts.load(
        `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`,
        expected || "ROUND",
      );
      if (!faces.length) errors.push(`cover font unavailable: ${css.fontFamily}`);
      const box = label.getBoundingClientRect();
      const card = root.getBoundingClientRect();
      const context = document.createElement("canvas").getContext("2d");
      const neighbors = [];
      for (const element of [label.previousElementSibling, label.nextElementSibling]) {
        if (!element) {
          neighbors.push(null);
          continue;
        }
        const style = getComputedStyle(element);
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const text =
          style.textTransform === "uppercase"
            ? element.textContent.toUpperCase()
            : element.textContent;
        const metrics = context.measureText(text);
        const range = document.createRange();
        range.selectNodeContents(element);
        const bounds = range.getBoundingClientRect();
        neighbors.push({
          top: bounds.top + metrics.fontBoundingBoxAscent - metrics.actualBoundingBoxAscent,
          bottom: bounds.bottom - metrics.fontBoundingBoxDescent + metrics.actualBoundingBoxDescent,
        });
      }
      const [above, below] = neighbors;
      if (!label.nextElementSibling?.textContent?.includes("SWIPE"))
        errors.push("missing swipe prompt");
      if (below && (below.top < card.top - 1 || below.bottom > card.bottom + 1))
        errors.push("swipe prompt outside export");
      if (label.scrollWidth > label.clientWidth + 1) errors.push("label horizontal overflow");
      context.font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
      // Range glyphs expose text hidden by overflow/clamps even when textContent
      // still contains the full stage name. Inspect spaces only between words.
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        for (let c = 0; c < node.textContent.length; c++) {
          if (/\s/.test(node.textContent[c])) continue;
          const range = document.createRange();
          range.setStart(node, c);
          range.setEnd(node, c + 1);
          const glyph = range.getBoundingClientRect();
          const text =
            css.textTransform === "uppercase"
              ? node.textContent[c].toUpperCase()
              : node.textContent[c];
          const metrics = context.measureText(text);
          // DOM Range includes font ascent/descent, not just painted ink. Club
          // Kit intentionally uses .88 line-height; metric boxes can intersect
          // even when the visible capitals have a clear gap. Keep that style.
          const top = glyph.top + metrics.fontBoundingBoxAscent - metrics.actualBoundingBoxAscent;
          const bottom =
            glyph.bottom - metrics.fontBoundingBoxDescent + metrics.actualBoundingBoxDescent;
          if (glyph.left < box.left - 1 || glyph.right > box.right + 1)
            errors.push(`glyph ${c} outside label width`);
          if (
            ["hidden", "clip"].includes(css.overflowY) &&
            (top < box.top - 1 || bottom > box.bottom + 1)
          )
            errors.push(`glyph ${c} clipped by label`);
          if (
            glyph.left < card.left - 1 ||
            glyph.right > card.right + 1 ||
            top < card.top - 1 ||
            bottom > card.bottom + 1
          )
            errors.push(`glyph ${c} outside export`);
          // Condensed display line-height is intentionally tighter than font
          // metrics; compare to adjacent copy rather than its own line box.
          if (above && top < above.bottom - 1) errors.push(`glyph ${c} hits title`);
          if (below && bottom > below.top + 1) errors.push(`glyph ${c} hits swipe`);
          let ancestor = label.parentElement;
          while (ancestor && ancestor !== root) {
            const style = getComputedStyle(ancestor);
            const bounds = ancestor.getBoundingClientRect();
            if (
              ["hidden", "clip"].includes(style.overflowX) &&
              (glyph.left < bounds.left - 1 || glyph.right > bounds.right + 1)
            )
              errors.push(`glyph ${c} clipped horizontally`);
            if (
              ["hidden", "clip"].includes(style.overflowY) &&
              (top < bounds.top - 1 || bottom > bounds.bottom + 1)
            )
              errors.push(`glyph ${c} clipped vertically`);
            ancestor = ancestor.parentElement;
          }
        }
      }
      return [...new Set(errors)];
    },
    expected,
  );
  if (errors.length) throw new Error(errors.join("\n"));
}

export async function checkCarouselCovers(page: Page, outputDir: string) {
  const hash = async (png: Buffer) =>
    createHash("sha256")
      .update(await sharp(png).ensureAlpha().raw().toBuffer())
      .digest("hex");
  let checked = 0;
  for (const packId of [...CAROUSEL_PACK_IDS].reverse())
    for (const size of FORMATS) {
      for (const hasCoverPhoto of [false, true])
        for (const [caseIndex, roundLabel] of LABELS.entries()) {
          const name = `${packId}-${size}-${hasCoverPhoto ? "photo" : "plain"}-label-${caseIndex}`;
          const payload = {
            input: {
              kind: "matchDay",
              ...(roundLabel === undefined ? {} : { roundLabel }),
              date: "SATURDAY 10 OCTOBER",
              carouselPage: {
                page: "title",
                title: "THIS WEEKEND",
                fixtureCount: 4,
                hasCoverPhoto,
                sponsors: [],
              },
            },
            options: {
              packId,
              size,
              sponsorsOn: false,
              junior: false,
              strictImages: true,
              ...(hasCoverPhoto ? { data: { photoUrl: PHOTO } } : {}),
            },
          };
          try {
            const meta = await page.evaluate(
              async (payload) => (globalThis as any).__cardRenderHarness.renderStill(payload),
              payload,
            );
            await assertCoverLabel(page, meta.selector, roundLabel);
            if (checked === 0) {
              // Negative control: prove a hidden final glyph fails the browser
              // assertion even though the DOM still contains the complete label.
              const original = await page.$eval(
                `${meta.selector} [data-carousel-cover-label]`,
                (el) => {
                  const old = el.getAttribute("style")!;
                  el.setAttribute(
                    "style",
                    `${old};width:1px;max-width:1px;white-space:nowrap;overflow:hidden`,
                  );
                  return old;
                },
              );
              let caught = false;
              try {
                await assertCoverLabel(page, meta.selector, roundLabel);
              } catch {
                caught = true;
              }
              await page.$eval(
                `${meta.selector} [data-carousel-cover-label]`,
                (el, style) => el.setAttribute("style", style),
                original,
              );
              if (!caught) throw new Error("Negative control did not catch clipped label");
            }
            const preview = Buffer.from(
              await (await page.$(meta.selector))!.screenshot({ type: "png" }),
            );
            const bytes = await page.evaluate(async (payload) => {
              const response = await fetch("/api/card-renders/still", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              if (!response.ok) throw new Error(await response.text());
              return Array.from(new Uint8Array(await response.arrayBuffer()));
            }, payload);
            const exported = Buffer.from(bytes);
            await writeFile(`${outputDir}/${name}.png`, exported);
            const info = await sharp(exported).metadata();
            const [width, height] = DIMENSIONS[size];
            if (
              info.width !== width ||
              info.height !== height ||
              meta.width !== width ||
              meta.height !== height
            )
              throw new Error("PNG dimensions changed");
            if ((await hash(preview)) !== (await hash(exported)))
              throw new Error("Export PNG differs from measured preview");
            checked++;
          } catch (error) {
            const card = await page.$("#pack-still-root");
            if (card) await card.screenshot({ path: `${outputDir}/${name}-failure.png` });
            else await page.screenshot({ path: `${outputDir}/${name}-failure.png` });
            throw new Error(`${name} (${roundLabel ?? "missing"}): ${String(error)}`);
          }
        }
    }
  return checked;
}
