/** Shared browser assertions: inspect every glyph, not just the HTML source. */
import type { Page } from "puppeteer-core";

export const TEAM_NAMES = [
  "Venkatanarasimharaju", "Smith-Worthington", "van der Westhuizen", "O’Shaughnessy",
  "García Márquez", "WWWWMMMMWWWW", "Illingworth", "Jean-Baptiste de Villiers",
  "D'Angelo", "Alexander Montgomery-Worthington", "Jose\u0301 Álvarez", "WWWMMMMWWWWMMMM",
];
export const TEAM_INPUT = {
  kind: "teamList", grade: "A Grade", gradeRound: "A GRADE • ROUND 1",
  venueDateTime: "Saturday • Test Ground", competitionLine: "Senior Cricket",
  players: TEAM_NAMES.map((surname, i) => ({
    order: i + 1, surname, ...(i === 0 ? { role: "C/WK" } : i === 11 ? { role: "C/WK/12TH" } : {}),
  })),
};

export async function assertTeamNames(page: Page, selector: string, expected = TEAM_NAMES) {
  await page.waitForFunction(s => {
    const { document } = globalThis as any;
    const list = document.querySelector(s)?.querySelector("[data-xi-fit]");
    return list?.getAttribute("data-xi-ready") === "true";
  }, { timeout: 20000 }, selector);
  const result = await page.$eval(selector, (root, expected) => {
    // Browser globals are scoped here so the server's tsconfig doesn't acquire
    // DOM globals (which conflict with Node streams elsewhere in this package).
    const { document, getComputedStyle, Node } = globalThis as any;
    const errors: string[] = [];
    const names = Array.from(root.querySelectorAll("[data-xi-name]")) as any[];
    const rows = names.map(n => n.parentElement!);
    const footer = root.querySelector("[data-ck-footer]")!.getBoundingClientRect();
    const sizes = names.map(n => getComputedStyle(n).fontSize);
    if (!document.fonts.check('600 24px "IBM Plex Sans"')) errors.push("name font not loaded");
    if (new Set(sizes).size !== 1) errors.push("inconsistent font sizes");
    if (names.length !== expected.length) errors.push(`wrong player count ${names.length}`);
    names.forEach((name, i) => {
      const rect = name.getBoundingClientRect(), row = rows[i].getBoundingClientRect();
      if (name.textContent !== expected[i]) errors.push(`name ${i} changed`);
      if (name.scrollWidth > name.clientWidth + 1) errors.push(`name ${i} scroll overflow`);
      if (row.bottom > footer.top) errors.push(`row ${i} hits footer`);
      const list = name.closest("[data-xi-fit]")!;
      const heading = list.parentElement!.previousElementSibling!.getBoundingClientRect();
      if (row.top < heading.bottom - 1) errors.push(`row ${i} hits heading`);
      const frame = root.querySelector('[data-ck-frame="side"]');
      if (frame) {
        const photo = frame.getBoundingClientRect();
        // clip-path slopes from 24% at the top to 0% at the bottom;
        // subtract the three trim bands' maximum 3.8cqmin.
        const scale = rect.width / name.clientWidth;
        const card = root.querySelector("[data-pack-skeleton]")!;
        const unit = Math.min(card.clientWidth, card.clientHeight) / 100 * scale;
        const edge = photo.left + .24 * photo.width * (1 - (row.bottom - photo.top) / photo.height) - 3.8 * unit;
        if (row.right > edge + 2) errors.push(`row ${i} hits photo trim`);
      }
      if (rect.top < row.top - 1 || rect.bottom > row.bottom + 1) errors.push(`name ${i} outside row`);
      if (i % 6 < 5 && rows[i + 1] && row.bottom > rows[i + 1].getBoundingClientRect().top + 1) errors.push(`row ${i} hits next row`);
      const siblings = (Array.from(rows[i].children) as any[]).filter(n => n !== name);
      siblings.forEach(s => {
        const badge = s.getBoundingClientRect();
        if (badge.width && rect.left < badge.right - .5 && rect.right > badge.left + .5) errors.push(`name ${i} hits number/badge`);
      });
      const lineTops = new Set<number>();
      // Every non-space glyph must be inside the name cell, including its last
      // glyph. Line clamps/ellipsis would pass a textContent-only assertion.
      for (const node of Array.from(name.childNodes) as any[]) if (node.nodeType === Node.TEXT_NODE) {
        for (let c = 0; c < (node.textContent?.length ?? 0); c++) {
          const range = document.createRange();
          range.setStart(node, c); range.setEnd(node, c + 1);
          const glyph = range.getBoundingClientRect();
          lineTops.add(Math.round(glyph.top));
          if (glyph.left < rect.left - 1 || glyph.right > rect.right + 1 || glyph.bottom > row.bottom + 1) errors.push(`glyph ${i}/${c} outside cell`);
        }
      }
      if (lineTops.size > 2) errors.push(`name ${i} exceeds two lines`);
    });
    return { errors, size: sizes[0], wrapped: names.filter(n => n.querySelector("br")).length };
  }, expected);
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  return result;
}
