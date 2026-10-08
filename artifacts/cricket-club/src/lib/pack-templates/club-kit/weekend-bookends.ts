import type { PackCardTemplate } from "../types";
import { clubHeaderFields, textField, slot } from "../shared";
import { ckCard, ckFormats } from "./card";
import { C, cq, display, eyebrow, meta } from "./parts";

/** Private variants of matchDay; not standalone gallery kinds. Same Club Kit
 * layout, brand tokens, escaping, fonts and still-render harness as team cards. */
export function weekendBookendTemplate(page: "title" | "sponsors", sponsorCount: number, titleLength = 0, hasCoverPhoto = false): PackCardTemplate {
  const count = Math.max(0, sponsorCount);
  return {
    kind: "matchDay",
    designKey: `weekend-${page}`,
    name: page === "title" ? "Weekend title" : "Weekend sponsors",
    sponsorVariants: ["off", "on"],
    fields: [
      ...clubHeaderFields(),
      ...["clubMonogram", "clubHashtag", "sponsorPresentedBy", "weekendTitle", "date", "roundLabel"].map(k => textField(k, k, "")),
    ],
    formats: ckFormats(f => {
      const tall = f === "story" || f === "portrait";
      const cols = count <= 2 ? Math.max(count, 1)
        : tall ? (count <= 10 ? 2 : count <= 18 ? 3 : 4)
        : count === 4 ? 2 : count <= 9 ? 3 : 4;
      const rows = Math.ceil(count / cols);
      // All tiles, including an incomplete final row, share one exact 2:1
      // size. Limit total height by constraining the grid's width, never by
      // squashing individual logos. Tall cards use fewer, larger columns.
      const gridHeight = f === "story" ? 112 : f === "portrait" ? 70 : 48;
      const tileHeight = Math.max(1, (gridHeight - Math.max(0, rows - 1) * 1.5) / Math.max(rows, 1));
      const gridWidth = tileHeight * 2 * cols + (cols - 1) * 1.5;
      const sponsorGrid = count
        ? `<div data-weekend-sponsor-grid="1" style="display:flex;flex-wrap:wrap;justify-content:center;gap:1.5cqmin;width:100%;max-width:${gridWidth}cqmin;align-self:center;flex:none;margin-top:3cqmin">` +
          Array.from({ length: count }, (_, i) =>
            `<div data-weekend-sponsor="${i}" data-sponsor-logo-frame="1" data-drop-if-empty="weekendSponsor${i}" style="flex:0 0 calc((100% - ${(cols - 1) * 1.5}cqmin) / ${cols});aspect-ratio:2 / 1;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:.9cqmin;background:#fff;border:1px solid var(--ck-line);min-width:0;overflow:hidden">` +
            slot(`weekendSponsor${i}`, "sponsor") + `</div>`
          ).join("") + "</div>"
        : meta(cq, "THANK YOU TO OUR CLUB COMMUNITY", ";margin-top:4cqmin");
      return ckCard({
        format: f, chip: "THIS WEEKEND", wide: true, centerBody: page === "sponsors",
        backdropPhoto: page === "title" && hasCoverPhoto ? "photo" : undefined,
        body: page === "title"
          ? eyebrow(cq, "{{date}}") +
            display(cq, "{{weekendTitle}}", titleLength > 45 ? 6 : titleLength > 25 ? 8 : tall ? 13 : 11, ";line-height:.95;overflow-wrap:anywhere;margin-top:3cqmin") +
            display(cq, "{{roundLabel}}", tall ? 16 : 14, `;margin-top:4cqmin;font-size:calc(${cq(tall ? 16 : 14)} * var(--fit,1))`)
              .replace("<div ", '<div data-fit="7" ') +
            display(cq, "SWIPE &gt;&gt;", tall ? 10 : 8, `;margin-top:2cqmin;color:${C.pt}`)
          : eyebrow(cq, "{{date}}") + display(cq, "OUR SPONSORS", tall ? 10 : 8) + sponsorGrid,
        footer: { hashtag: "clubHashtag", sponsors: "logos", off: true,
          ...(page === "title" ? { label: "PRESENTED BY" } : {}) },
      });
    }),
  };
}
