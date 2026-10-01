import type { PackDesignEntry, PackTemplateField } from "./types";
import { clubHeaderFields, photoField, textField } from "./shared";
import {
  K,
  K_RULE,
  type PackLook,
  kColumn,
  kCond,
  kEyebrow,
  kFooterOn,
  kNum,
  kSub,
  kTitle,
  kitCard,
  kitChip,
  kitFormats,
} from "./skeleton-kit";

/**
 * Balanced card set covers (plan 2026-10-01-001, KTD3) for every pack on the
 * shared skeleton — Broadcast Dark, Gold Foil, Bold Type, Neon Night and
 * Sunset. One body per kind in the pack's own look: the round, a two-line
 * title, the headline number with its label, and the summary line. Club Kit
 * has its own covers (`club-kit/designs.ts`) on the same field keys.
 */

export const COVER_FIELDS: PackTemplateField[] = [
  ...clubHeaderFields(),
  textField("roundLabel", "Round", "ROUND 15"),
  textField("coverDate", "Date", "SATURDAY 14 FEB"),
  textField("coverCount", "Headline number", "8"),
  textField("coverLabel", "Headline label", "TEAMS IN ACTION"),
  textField("coverList", "Summary line", "A · B · C · D"),
  photoField("photo", "Cover photo", "Club photo"),
  textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
  textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
];

interface CoverSpec {
  kind: string;
  designKey: string;
  name: string;
  title: [string, string];
  swipe: string;
}

export const WEEKEND_WRAP_COVER = {
  kind: "weekendWrap",
  designKey: "weekend-wrap-cover",
  name: "Weekend Wrap — Cover",
  title: ["ROUND", "RESULTS"],
  swipe: "SWIPE FOR EVERY RESULT",
} as const satisfies CoverSpec;

export const TEAM_LISTS_COVER = {
  kind: "teamListRound",
  designKey: "team-lists-cover",
  name: "Round Team Lists — Cover",
  title: ["SELECTED", "SIDES"],
  swipe: "SWIPE FOR YOUR TEAM",
} as const satisfies CoverSpec;

/** A set cover for `spec.kind` in `look`. */
export function skeletonCover(look: PackLook, spec: CoverSpec): PackDesignEntry {
  const html = kitCard(look, {
    chip: kitChip("{{roundLabel}}"),
    tag: "{{coverDate}}",
    photo: "photo",
    body: kColumn(
      look,
      kEyebrow(spec.swipe) +
        kTitle(
          `${spec.title[0]}<br><span style="color:${K.accText}">${spec.title[1]}</span>`,
          12,
          ";line-height:.9",
        ) +
        `<div style="display:flex;align-items:flex-end;gap:2.6cqmin;margin-top:2cqmin">` +
        kNum("{{coverCount}}", 30, ";line-height:.82;margin-top:0") +
        kCond("{{coverLabel}}", 6, `;line-height:.95;color:${K.accText};padding-bottom:1.4cqmin`) +
        `</div>` +
        K_RULE +
        kSub("{{coverList}}", ";max-width:92cqmin"),
    ),
    footer: kFooterOn("proudly supported by"),
    deco: { word: "ROUND", script: "This round" },
  });
  return {
    designKey: spec.designKey,
    kind: spec.kind,
    role: "cover",
    template: {
      kind: spec.kind,
      designKey: spec.designKey,
      name: spec.name,
      sponsorVariants: ["on"],
      fields: COVER_FIELDS,
      formats: kitFormats(() => html),
    },
  };
}
