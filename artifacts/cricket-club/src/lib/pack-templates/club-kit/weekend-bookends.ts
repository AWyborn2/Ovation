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
      ...["clubMonogram", "clubHashtag", "sponsorPresentedBy", "weekendTitle", "date"].map(k => textField(k, k, "")),
      ...Array.from({ length: count }, (_, i) => textField(`weekendSponsorName${i}`, "Sponsor name", "")),
    ],
    formats: ckFormats(f => {
      const tall = f === "story" || f === "portrait";
      const cols = count <= 2 ? Math.max(count, 1) : count === 4 ? 2 : count <= 6 ? 3 : 4;
      const rows = Math.ceil(count / cols);
      // Allocate a fixed total grid height and shrink each row as needed:
      // every sponsor remains present, unlike the footer's three-logo cap.
      const cellH = Math.min(20, (tall ? 60 : 43) / Math.max(rows, 1));
      const sponsorGrid = count
        ? `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:1.5cqmin;width:100%;margin-top:3cqmin">` +
          Array.from({ length: count }, (_, i) =>
            `<div data-weekend-sponsor="${i}" style="flex:0 0 calc((100% - ${(cols - 1) * 1.5}cqmin) / ${cols});height:${cellH}cqmin;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.8cqmin;padding:1cqmin;border:1px solid var(--ck-line);min-width:0;overflow:hidden">` +
            `<div data-drop-if-empty="weekendSponsor${i}" style="height:${Math.max(1, cellH - 5)}cqmin;width:100%;background:#fff;padding:.5cqmin">${slot(`weekendSponsor${i}`, "logo")}</div>` +
            `<div style="font-size:${Math.min(2.3, Math.max(1, cellH / 5))}cqmin;font-weight:700;text-align:center;overflow-wrap:anywhere">{{weekendSponsorName${i}}}</div></div>`
          ).join("") + "</div>"
        : meta(cq, "THANK YOU TO OUR CLUB COMMUNITY", ";margin-top:4cqmin");
      return ckCard({
        format: f, chip: "THIS WEEKEND", wide: true,
        backdropPhoto: page === "title" && hasCoverPhoto ? "photo" : undefined,
        body: page === "title"
          ? eyebrow(cq, "{{date}}") +
            display(cq, "{{weekendTitle}}", titleLength > 45 ? 6 : titleLength > 25 ? 8 : tall ? 13 : 11, ";line-height:.95;overflow-wrap:anywhere;margin-top:3cqmin") +
            display(cq, "ROUND 1", tall ? 16 : 14, ";margin-top:4cqmin") +
            display(cq, "SWIPE &gt;&gt;", tall ? 10 : 8, `;margin-top:2cqmin;color:${C.pt}`)
          : eyebrow(cq, "{{date}}") + display(cq, "OUR SPONSORS", tall ? 10 : 8) + sponsorGrid,
        footer: { hashtag: "clubHashtag", sponsors: "logos", off: true,
          ...(page === "title" ? { label: "PRESENTED BY" } : {}) },
      });
    }),
  };
}
