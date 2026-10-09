import type {
  PackCardTemplate,
  PackDesignEntry,
  PackSponsorVariant,
  PackTemplateField,
  PackTemplateRepeat,
} from "../types";
import { BROADCAST_DARK_PACK } from "../broadcast-dark";
import {
  clubHeaderFields,
  photoField,
  repeatField,
  slot,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "../shared";
import { shirtNumberBadge, shirtNumberField, treatedPhoto, withShirtNumber } from "../skeleton-kit";
import {
  ckCard,
  ckFormats,
  headerCrest,
  isTall,
  type CkFooter,
  type CkFormat,
  type FrameDepth,
} from "./card";
import {
  C,
  background,
  supportedBy,
  tricolourRule,
  CK_COND,
  CK_MONO,
  CK_SANS,
  cq,
  display,
  eyebrow,
  gfPanel,
  gradeRow,
  juniorRow,
  leaderRow,
  meta,
  premStars,
  scoreBars,
  statCell,
  tradingFrame,
  tricolourDash,
  twoLineTitle,
  xiList,
  xiRow,
} from "./parts";

/**
 * Club Kit designs — one per kind (plus the Runs / Wickets / Catches /
 * Dismissals leader presets), each the handoff's body for that kind (§5) on
 * the Club Kit card (§2–§4).
 *
 * Field keys come from the Broadcast Dark reference design for the same kind
 * (field-key parity, `pack-lint.test.ts`): a design declares exactly the
 * reference fields its markup uses, plus the few Club Kit extras allowlisted
 * there (`clubMonogram`, a frame `photo` on kinds whose reference has none,
 * `clubHashtag` for the hashtag block, `resultWord` for the WIN / RESULT
 * headline).
 */

const u = cq;

/** Header + footer fields every Club Kit-only design declares. */
const HEADER_FIELDS: PackTemplateField[] = [
  ...clubHeaderFields(),
  textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
  textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
];

/** Extra (non-reference) field definitions Club Kit may declare. */
const EXTRA_FIELDS: Record<string, PackTemplateField> = {
  clubMonogram: textField("clubMonogram", "Club monogram (no crest)", "YC"),
  photo: photoField("photo", "Frame photo", "Club photo"),
  grade: textField("grade", "Grade / team", ""),
  clubHashtag: textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
  resultWord: textField("resultWord", "Result headline", "WIN"),
  setMarker: textField("setMarker", "Set page marker", ""),
  rowScale: textField("rowScale", "Set row size", "1"),
  // The footer's sponsor-name fallback (shown only when there are no logos).
  sponsorPresentedBy: textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  // Match result score bars: the logo stands in for the name (bound empty
  // when there's a logo), and the logo badge shows only when there is one.
  "club.barName": textField("club.barName", "Club name on score bar", ""),
  "opposition.barName": textField("opposition.barName", "Opposition name on score bar", ""),
  "club.logoDisplay": textField("club.logoDisplay", "Club logo shown", "flex"),
  "opposition.logoDisplay": textField("opposition.logoDisplay", "Opposition logo shown", "flex"),
  // Starting XI: the match set out in parts (the reference design runs them
  // together in `gradeRound` / `venueDateTime`).
  roundLabel: textField("roundLabel", "Round", "ROUND 3"),
  opponent: textField("opponent", "Opponent", "MARINERS"),
  venue: textField("venue", "Venue", "RUSHTON PARK"),
  date: textField("date", "Date", "SAT 8 NOV"),
  startTime: textField("startTime", "Start time", "12:30 PM"),
};

/** A set's row unit: card cqmin scaled by the set's density (`--rs`, from `{{rowScale}}`). */
const r = (n: number) => `calc(${n}cqmin * var(--rs,1))`;

function fieldUsed(field: PackTemplateField, html: string): boolean {
  if (field.type === "text") return html.includes(`{{${field.key}}}`);
  if (field.type === "repeat") return html.includes(`data-repeat="${field.key}"`);
  return html.includes(`data-slot="${field.key}"`);
}

interface DesignSpec {
  kind: string;
  designKey: string;
  name: string;
  categoryPreset?: PackDesignEntry["categoryPreset"];
  /** Reference preset to take fields from (defaults to `categoryPreset`). */
  refPreset?: PackDesignEntry["categoryPreset"];
  build: (f: CkFormat) => string;
  /** Row fields added to a reference repeat, by repeat key. */
  rowExtras?: Record<string, PackTemplateField[]>;
  /**
   * Club Kit-only kinds (no Broadcast Dark design to take fields from): the
   * design's own field list and repeats.
   */
  own?: { fields: PackTemplateField[]; repeats?: PackTemplateRepeat[] };
  /** A balanced card set's cover for this kind. */
  role?: "cover";
}

function referenceFor(kind: string, preset?: string) {
  const ref = BROADCAST_DARK_PACK.designs.find(
    (d) => d.kind === kind && (preset ? d.categoryPreset === preset : true),
  );
  if (!ref) throw new Error(`Club Kit: no reference design for ${kind}/${preset ?? "-"}`);
  return ref.template;
}

function design(spec: DesignSpec): PackDesignEntry {
  const formats = ckFormats(spec.build);
  const html = Object.values(formats).join("\n");
  const ref = spec.own
    ? { fields: [...spec.own.fields, ...HEADER_FIELDS], repeats: spec.own.repeats }
    : referenceFor(spec.kind, spec.refPreset ?? spec.categoryPreset);
  const refKeys = new Set(ref.fields.map((f) => f.key));
  const fields: PackTemplateField[] = [
    ...ref.fields.filter((f) => fieldUsed(f, html)),
    ...Object.values(EXTRA_FIELDS).filter((f) => !refKeys.has(f.key) && fieldUsed(f, html)),
  ];
  const repeats: PackTemplateRepeat[] | undefined = ref.repeats
    ?.filter((r) => html.includes(`data-repeat="${r.key}"`))
    .map((r) => ({
      ...r,
      maxRows: Math.max(r.maxRows, 12),
      fields: [...r.fields, ...(spec.rowExtras?.[r.key] ?? [])],
    }));
  const sponsorVariants: PackSponsorVariant[] = [];
  if (html.includes('data-sponsors="on"')) sponsorVariants.push("on");
  if (html.includes('data-sponsors="off"')) sponsorVariants.push("off");
  const template: PackCardTemplate = {
    kind: spec.kind,
    designKey: spec.designKey,
    name: spec.name,
    formats,
    fields,
    ...(repeats && repeats.length ? { repeats } : {}),
    sponsorVariants,
  };
  return {
    designKey: spec.designKey,
    kind: spec.kind,
    ...(spec.categoryPreset ? { categoryPreset: spec.categoryPreset } : {}),
    ...(spec.role ? { role: spec.role } : {}),
    template,
  };
}

const NAME_FOOTER: CkFooter = { hashtag: "clubHashtag", sponsors: "logos" };
const LOGO_FOOTER: CkFooter = { hashtag: "hashtags", sponsors: "logos", off: true };

/** Hero number size by format (milestone-style numerals, handoff §4). */
const heroSize = (f: CkFormat, tall: number, flat: number) => (isTall(f) ? tall : flat);

function card(
  f: CkFormat,
  chip: string,
  body: string,
  footer: CkFooter,
  photo: string | undefined = "photo",
  depth: FrameDepth = "hero",
): string {
  return ckCard({ format: f, chip, photo, depth, body, footer });
}

const col = (inner: string, gap = 0) =>
  `<div style="display:flex;flex-direction:column;align-items:flex-start;gap:${gap}cqmin;width:100%;min-width:0">${inner}</div>`;

// ---------------------------------------------------------------------------
// The eight handoff kinds
// ---------------------------------------------------------------------------

const matchResult = design({
  kind: "matchSummary",
  designKey: "match-result",
  name: "Match Result",
  build: (f) =>
    card(
      f,
      "SCORECARD",
      col(
        eyebrow(u, "{{matchTitle}}") +
          // WIN / RESULT / DRAW / NO RESULT: sized to the word so a longer
          // one shrinks rather than running off the card.
          `<div data-fit="${f === "square" ? 4 : 6}" style="font-family:${CK_COND};font-weight:900;font-size:calc(${u(f === "landscape" ? 20 : 24)} * var(--fit,1));line-height:.8;text-transform:uppercase;white-space:nowrap;overflow:hidden;color:${C.pt};margin-top:1cqmin">{{resultWord}}</div>` +
          `<div style="width:100%;margin-top:2.4cqmin">` +
          scoreBars(
            u,
            {
              name: "{{club.barName}}",
              score: "{{club.score}}",
              overs: "{{club.oversLabel}}",
              logo: "club",
            },
            {
              name: "{{opposition.barName}}",
              score: "{{opposition.score}}",
              overs: "{{opposition.oversLabel}}",
              logo: "opposition",
            },
            // Square leaves the narrowest column beside the slash: each bar
            // stacks, so the name gets the bar's full width.
            f === "square" ? 15 : f === "landscape" ? 12 : 16,
            f === "square",
          ) +
          `</div>` +
          `<div style="font-family:${CK_COND};font-weight:700;font-size:4.2cqmin;line-height:1.05;text-transform:uppercase;margin-top:2.4cqmin">{{result}}</div>` +
          `<div style="font-family:${CK_SANS};font-weight:700;font-size:2cqmin;line-height:1.35;margin-top:1cqmin;color:${C.chalk}">{{club.performers}}</div>`,
      ),
      { hashtag: "clubHashtag", sponsors: "logos", off: true },
    ),
});

const milestone = design({
  kind: "milestone",
  designKey: "milestone",
  name: "Player Milestone",
  build: (f) =>
    card(
      f,
      "MILESTONE",
      col(
        eyebrow(u, "{{tierLabel}}") +
          display(
            u,
            "{{currentValue}}",
            heroSize(f, 30, 23),
            `;line-height:.82;letter-spacing:-.01em;color:${C.pt}`,
          ) +
          `<div style="display:flex;align-items:center;gap:2cqmin;margin-top:1.4cqmin">${tricolourDash(u)}${display(u, "{{milestoneLabel}}", 6, "", 800)}</div>` +
          withShirtNumber(display(u, "{{playerName}}", 9, ";line-height:.9;margin-top:2.4cqmin")) +
          meta(u, "{{headline}}", ";margin-top:1.6cqmin;max-width:100%"),
      ),
      NAME_FOOTER,
    ),
});

function leadersDesign(
  preset: "Runs" | "Wickets" | "Catches" | "Dismissals",
  refPreset: "Runs" | "Wickets",
) {
  const slug = preset.toLowerCase();
  return design({
    kind: "clubLeaderboard",
    designKey: `club-leaderboard-${slug}`,
    name: `Club Leaders — ${preset}`,
    categoryPreset: preset,
    refPreset,
    rowExtras: { leaders: [textField("barPct", "Bar length (%)", "100")] },
    build: (f) => {
      const max = f === "landscape" ? 5 : f === "story" ? 8 : 6;
      const rows =
        leaderRow(
          u,
          true,
          {
            rank: "{{row.gradeLabel}}",
            name: "{{row.playerName}}",
            value: "{{row.value}}",
            pct: "{{row.barPct}}%",
          },
          ' data-repeat-variant="top"',
        ) +
        leaderRow(u, false, {
          rank: "{{row.gradeLabel}}",
          name: "{{row.playerName}}",
          value: "{{row.value}}",
          pct: "{{row.barPct}}%",
        });
      return card(
        f,
        "{{category}}",
        col(
          eyebrow(u, "{{subtitle}} · {{season}}", C.chalk2) +
            display(u, "{{title}}", 10, `;line-height:.88;margin-top:1cqmin`) +
            `<div data-repeat="leaders" data-repeat-max="${max}" style="width:100%;margin-top:1.6cqmin">${rows}</div>`,
        ),
        { hashtag: "clubHashtag", sponsors: "logos", off: true },
        "photo",
        "list",
      );
    },
  });
}

const matchDay = design({
  kind: "matchDay",
  designKey: "match-day",
  name: "Game Day",
  build: (f) =>
    card(
      f,
      "GAME DAY",
      col(
        eyebrow(u, "{{date}} · {{roundLabel}}") +
          meta(u, "GAME DAY", ";margin-top:1cqmin") +
          `<div data-match-day-heading="1">` +
          display(u, "{{grade}}", f === "portrait" ? 12 : 14, ";line-height:.95;overflow-wrap:anywhere") +
          `</div>` +
          `<div style="width:100%;margin-top:2cqmin;padding:1.5cqmin;background:${C.panel}">` +
          `<div style="display:flex;justify-content:space-between;gap:1cqmin;margin-bottom:1cqmin">` +
          meta(u, "{{homeAway}}") + display(u, "{{startTime}}", 3.2) + `</div>` +
          `<div style="display:flex;align-items:center;gap:1.5cqmin;min-width:0">` +
          display(u, "v", 3.8, ";line-height:1.05;flex:none") +
          `<div data-drop-if-empty="opposition.logo" style="width:7cqmin;height:7cqmin;flex:none">${slot("opposition.logo", "logo")}</div>` +
          display(u, "{{opposition.name}}", 3.8, ";line-height:1.05;overflow-wrap:anywhere;min-width:0") +
          `</div>` +
          meta(u, "{{venue}}", ";margin-top:.8cqmin;overflow-wrap:anywhere") +
          `</div>`,
      ),
      { ...LOGO_FOOTER, largeLogos: true },
      "photo",
      "list",
    ),
});

const teamList = design({
  kind: "teamList",
  designKey: "team-list",
  name: "Team Selection",
  build: (f) =>
    card(
      f,
      "TEAM LIST{{setMarker}}",
      col(
        eyebrow(u, "{{gradeRound}} · {{competitionLine}}") +
          `<div data-team-grade="1" style="font-family:${CK_COND};font-weight:900;font-size:12cqmin;line-height:.95;text-transform:uppercase;color:${C.pt};margin-top:1cqmin;width:100%;height:12cqmin;overflow-wrap:anywhere">{{gradeHeading}}</div>` +
          meta(u, "{{venueDateTime}}", ";margin-top:.8cqmin") +
          `<div style="width:100%;margin-top:1.6cqmin">` +
          xiList(
            u,
            xiRow(u, {
              n: "{{row.number}}",
              name: "{{row.surname}}",
              tag: `({{row.role}})`,
            }, true),
            ' data-repeat="players" data-repeat-max="12" data-xi-fit="1"',
            true,
          ) +
          `</div>`,
      ),
      LOGO_FOOTER,
      "squadPhoto",
      "list",
    ),
});

/** A badge chip on a Starting XI row; `cleanupEmptyBadges` drops it when its value is empty. */
const supportedByLabel = supportedBy(u, "PROUDLY SUPPORTED BY");

const xiBadge = (text: string, bg: string, ink: string, size: number) =>
  `<span data-badge="1" style="flex:none;font-family:${CK_COND};font-weight:800;font-size:${u(size)};line-height:1;letter-spacing:.06em;padding:${u(0.5)} ${u(0.9)};background:${bg};color:${ink}">${text}</span>`;

/**
 * Starting XI: the player photo down the left with the match under it, the
 * numbered XI on a dark panel down the right, and one sponsor logo. Each team
 * of a round set is one of these, so its own sponsor (sponsor per team) is
 * the only logo on it.
 */
const startingXi = design({
  kind: "teamList",
  designKey: "starting-xi",
  name: "Starting XI",
  rowExtras: { players: [textField("debut", "Debut badge", "")] },
  build: (f) => {
    const tall = isTall(f);
    // Row height and type from the room the format gives the list.
    const k = { square: 1, portrait: 1.12, story: 1.3, landscape: 0.92 }[f];
    const ku = (n: number) => u(+(n * k).toFixed(2));
    const left = f === "landscape" ? "50%" : tall ? "44%" : "46%";
    const photo = treatedPhoto(
      "squadPhoto",
      "inset:0",
      slot("squadPhoto", "photo", "rect", undefined, "50% 18%"),
    );
    const sponsor =
      `<div data-sponsor-strip="1" style="display:flex;flex-direction:column;align-items:flex-end;gap:${u(0.8)}">` +
      supportedByLabel +
      `<div data-sponsor-tile="1" style="width:${u(16)};height:${u(7)};flex:none;overflow:hidden;background:rgba(255,255,255,.94)">${slot("sponsor1", "sponsor", "rect")}</div>` +
      `</div>` +
      `<div data-sponsor-fallback="1"><div style="display:flex;flex-direction:column;align-items:flex-end;gap:${u(0.6)}">${supportedByLabel}<span data-sponsor-name="1" style="font-family:${CK_SANS};font-weight:700;font-size:${u(2)};white-space:nowrap;color:${C.chalk}">{{sponsorPresentedBy}}</span></div></div>`;
    const row =
      `<div style="display:flex;align-items:center;gap:${ku(1.4)};min-height:${ku(5.6)};border-bottom:${u(0.15)} solid ${C.line};min-width:0">` +
      `<span style="flex:none;width:${ku(4.4)};font-family:${CK_COND};font-weight:900;font-size:${ku(4)};line-height:1;color:${C.pt}">{{row.number}}</span>` +
      `<span data-fit="13" style="flex:1;min-width:0;font-family:${CK_COND};font-weight:800;font-size:calc(${ku(4.2)} * var(--fit,1));line-height:1;text-transform:uppercase;white-space:nowrap;overflow:hidden;color:${C.chalk}">{{row.surname}}</span>` +
      xiBadge("{{row.role}}", C.p, C.onp, +(2.3 * k).toFixed(2)) +
      xiBadge("{{row.debut}}", C.chalk, C.base, +(2.3 * k).toFixed(2)) +
      `</div>`;
    return (
      `<div data-pack-skeleton="1" style="position:absolute;inset:0;container-type:size;overflow:hidden;font-family:${CK_SANS};color:${C.chalk}">` +
      background() +
      // The photo, fading into the panel on its right edge and the match under it.
      `<div style="position:absolute;left:0;top:0;bottom:0;width:${left};overflow:hidden">` +
      photo +
      `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,transparent 62%,${C.base} 100%),linear-gradient(0deg,${C.base} 0%,${C.base70} 28%,transparent 55%)"></div>` +
      `</div>` +
      // Left column: crest top, the match bottom.
      `<div style="position:absolute;left:6cqmin;top:6cqmin;bottom:6cqmin;width:calc(${left} - 8cqmin);display:flex;flex-direction:column;justify-content:space-between;min-width:0">` +
      `<div style="display:flex;align-items:center;gap:2cqmin;min-width:0">${headerCrest()}</div>` +
      `<div style="display:flex;flex-direction:column;align-items:flex-start;gap:${u(1)};min-width:0;width:100%">` +
      eyebrow(u, "{{roundLabel}}") +
      `<div data-fit="12" style="font-family:${CK_COND};font-weight:900;font-size:calc(${u(tall ? 6.4 : 5.6)} * var(--fit,1));line-height:.92;text-transform:uppercase;color:${C.chalk};width:100%">{{clubName}}</div>` +
      `<div data-fit="12" style="font-family:${CK_COND};font-weight:800;font-size:calc(${u(tall ? 4.6 : 4)} * var(--fit,1));line-height:.95;text-transform:uppercase;color:${C.pt};width:100%">vs {{opponent}}</div>` +
      tricolourRule(u, 0.6) +
      meta(u, "{{venue}}", "") +
      `<div style="font-family:${CK_MONO};font-weight:500;font-size:${u(1.8)};letter-spacing:.14em;text-transform:uppercase;color:${C.chalk2}">{{date}} · {{startTime}}</div>` +
      `</div></div>` +
      // Right panel: grade, STARTING XI, the list, the sponsor.
      `<div style="position:absolute;right:0;top:0;bottom:0;width:calc(100% - ${left});box-sizing:border-box;padding:6cqmin 6cqmin 6cqmin 4cqmin;background:${C.base};display:flex;flex-direction:column;gap:${u(1.6)};min-width:0">` +
      `<div style="display:flex;flex-direction:column;align-items:flex-start;gap:${u(0.6)}">` +
      eyebrow(u, "{{competitionLine}}{{setMarker}}") +
      display(
        u,
        `STARTING <span style="color:${C.pt}">XI</span>`,
        tall ? 9 : 8,
        ";line-height:.85",
      ) +
      `</div>` +
      `<div data-repeat="players" data-repeat-max="12" style="flex:1 1 0;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:${ku(0.3)}">${row}</div>` +
      `<div style="flex:none;display:flex;justify-content:flex-end;align-items:flex-end;min-height:${u(7)}">${sponsorsOn(sponsor)}${sponsorsOff("")}</div>` +
      `</div>` +
      `</div>`
    );
  },
});

const premiership = design({
  kind: "premiership",
  designKey: "premiership",
  name: "Premiership",
  build: (f) =>
    card(
      f,
      "PREMIERS",
      col(
        premStars(u) +
          display(
            u,
            "PREMIERS",
            heroSize(f, 19, 14.5),
            `;line-height:.8;color:${C.pt};margin-top:1.4cqmin`,
          ) +
          display(u, "{{season}} {{grade}}", 6, ";margin-top:1cqmin", 800) +
          `<div style="width:100%;margin-top:2.4cqmin">` +
          gfPanel(u, {
            venue: "{{competition}}",
            score: "{{result}}",
            potf: `Player of the final · <strong style="color:${C.chalk}">{{mom}}</strong>`,
          }) +
          `</div>`,
      ),
      { hashtag: "hashtags", sponsors: "logos", label: "SEASON SUPPORTED BY" },
      "teamPhoto",
    ),
});

// ---------------------------------------------------------------------------
// The remaining kinds, in the same look
// ---------------------------------------------------------------------------

const playerSpotlight = design({
  kind: "player",
  designKey: "player-spotlight",
  name: "Player Spotlight",
  build: (f) => {
    // The body is short, so it scales up to fill the room each format leaves
    // it: the story's copy band under the photo and the landscape's tall
    // left column carry bigger type than the square.
    const k = { square: 1, portrait: 1.15, story: 1.3, landscape: 1.45 }[f];
    const ku = (n: number) => u(+(n * k).toFixed(2));
    return card(
      f,
      "SPOTLIGHT",
      col(
        eyebrow(ku, "PLAYER SPOTLIGHT · {{season}}") +
          withShirtNumber(
            display(ku, "{{playerName}}", 9, `;line-height:.9;margin-top:${ku(1.2)}`),
          ) +
          `<div style="display:flex;gap:.8cqmin;width:100%;margin-top:${ku(2.4)}">` +
          [1, 2, 3].map((n) => statCell(ku, `{{stat${n}Value}}`, `{{stat${n}Label}}`)).join("") +
          `</div>` +
          meta(ku, "{{headline}}", `;margin-top:${ku(2)}`),
      ),
      NAME_FOOTER,
    );
  },
});

const record = design({
  kind: "record",
  designKey: "record",
  name: "Club Record",
  build: (f) =>
    card(
      f,
      "RECORD",
      col(
        eyebrow(u, "CLUB RECORD · {{grade}}") +
          display(u, "{{title}}", 6, ";margin-top:1cqmin", 800) +
          display(
            u,
            "{{value}}",
            heroSize(f, 30, 23),
            `;line-height:.82;color:${C.pt};margin-top:1cqmin`,
          ) +
          `<div style="display:flex;align-items:center;gap:2cqmin;margin-top:1.6cqmin">${tricolourDash(u)}${display(u, "{{playerName}}", 7, "", 900)}</div>`,
      ),
      { hashtag: "clubHashtag", sponsors: "logos", off: true },
    ),
});

function gradeLeaderDesign(preset: "Runs" | "Wickets") {
  return design({
    kind: "gradeLeader",
    designKey: `grade-leader-${preset.toLowerCase()}`,
    name: `Grade Leader — ${preset}`,
    categoryPreset: preset,
    build: (f) =>
      card(
        f,
        "LEADER",
        col(
          eyebrow(u, "{{grade}} · {{season}}") +
            twoLineTitle(u, "{{titleTop}}", "{{titleBottom}}", 7) +
            display(
              u,
              "{{value}}",
              heroSize(f, 28, 22),
              `;line-height:.82;color:${C.pt};margin-top:1.6cqmin`,
            ) +
            `<div style="display:flex;align-items:center;gap:2cqmin;margin-top:1.4cqmin">${tricolourDash(u)}${display(u, "{{category}}", 5, "", 800)}</div>` +
            display(u, "{{playerName}}", 8, ";line-height:.9;margin-top:2cqmin"),
        ),
        { hashtag: "clubHashtag", sponsors: "logos", off: true },
      ),
  });
}

const debut = design({
  kind: "debut",
  designKey: "debut",
  name: "Debut",
  build: (f) =>
    card(
      f,
      "DEBUT",
      col(
        eyebrow(u, "FIRST GRADE DEBUT · {{grade}} · {{season}}") +
          display(u, "{{playerName}}", 10, ";line-height:.9;margin-top:1.4cqmin") +
          meta(u, "Round {{round}} · vs {{opponent}} — {{tributeLine}}", ";margin-top:1.6cqmin") +
          `<div style="font-family:${CK_COND};font-weight:900;font-size:4cqmin;line-height:1;padding:.8cqmin 1.8cqmin;margin-top:2.2cqmin;background:${C.p};color:${C.onp}">CAP {{capNumber}}</div>`,
      ),
      { hashtag: "clubHashtag", sponsors: "logos", off: true },
    ),
});

const MATCH_LINE = "{{grade}} · vs {{opponent}} · RD {{round}}";

const century = design({
  kind: "century",
  designKey: "century",
  name: "Century",
  build: (f) =>
    card(
      f,
      "CENTURY",
      col(
        eyebrow(u, "RAISED THE BAT") +
          `<div style="display:flex;align-items:flex-end;gap:1.6cqmin">${display(u, "{{runs}}", heroSize(f, 30, 23), `;line-height:.82;color:${C.pt}`)}${display(u, "({{balls}})", 5, `;color:${C.chalk2};padding-bottom:1cqmin`, 700)}</div>` +
          `<div style="display:flex;align-items:center;gap:2cqmin;margin-top:1.4cqmin">${tricolourDash(u)}${display(u, "CENTURY", 6, "", 800)}</div>` +
          withShirtNumber(display(u, "{{playerName}}", 9, ";line-height:.9;margin-top:2.2cqmin")) +
          eyebrow(u, MATCH_LINE, C.chalk2, ";margin-top:1.4cqmin"),
      ),
      { hashtag: "clubHashtag", sponsors: "logos", off: true },
    ),
});

const fiveFor = design({
  kind: "fiveFor",
  designKey: "five-for",
  name: "Five-for",
  build: (f) =>
    card(
      f,
      "FIVE-FOR",
      col(
        eyebrow(u, "{{wickets}} WICKETS") +
          `<div style="display:flex;align-items:flex-end;gap:1.6cqmin">${display(u, "{{figures}}", heroSize(f, 26, 20), `;line-height:.82;color:${C.pt}`)}${display(u, "({{overs}})", 5, `;color:${C.chalk2};padding-bottom:1cqmin`, 700)}</div>` +
          `<div style="display:flex;align-items:center;gap:2cqmin;margin-top:1.4cqmin">${tricolourDash(u)}${display(u, "FIVE-FOR", 6, "", 800)}</div>` +
          withShirtNumber(display(u, "{{playerName}}", 9, ";line-height:.9;margin-top:2.2cqmin")) +
          eyebrow(u, MATCH_LINE, C.chalk2, ";margin-top:1.4cqmin"),
      ),
      { hashtag: "clubHashtag", sponsors: "logos", off: true },
    ),
});

function wrapRow(lost: boolean): string {
  return (
    `<div${lost ? ' data-repeat-variant="lost"' : ""} style="display:flex;align-items:center;gap:${r(1.8)};padding:${r(1)} ${r(1.6)} ${r(1)} ${r(1)};margin-top:${r(0.8)};background:${C.panel}${lost ? ";opacity:.8" : ""}">` +
    `<div style="flex:none;width:${r(6)};height:${r(6)};display:flex;flex-direction:column;align-items:center;justify-content:center;background:${lost ? C.s : C.p};color:${lost ? C.chalk : C.onp}"><div style="font-family:${CK_COND};font-weight:900;font-size:${r(3.2)};line-height:1">{{row.gradeLabel}}</div><div style="font-family:${CK_MONO};font-size:${r(0.9)};letter-spacing:.1em">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;min-width:0"><div style="font-family:${CK_COND};font-weight:800;font-size:${r(3)};line-height:1.05;text-transform:uppercase">{{row.resultLine}}</div><div style="font-family:${CK_SANS};font-size:${r(1.8)};line-height:1.3;margin-top:${r(0.4)};color:${C.chalk2}">{{row.performers}}</div></div>` +
    `<div style="flex:none;font-family:${CK_COND};font-weight:900;font-size:${r(3)};line-height:1;color:${lost ? C.chalk2 : C.pt}">{{row.outcome}}</div>` +
    `</div>`
  );
}

const weekendWrap = design({
  kind: "weekendWrap",
  designKey: "weekend-wrap",
  name: "Weekend Wrap",
  build: (f) =>
    card(
      f,
      "ROUND WRAP{{setMarker}}",
      col(
        eyebrow(u, "{{roundLabel}} · {{dateRange}}") +
          twoLineTitle(u, "WEEKEND", "WRAP", f === "portrait" ? 10 : 12) +
          `<div data-repeat="matches" data-repeat-max="${f === "landscape" ? 4 : 5}" style="--rs:{{rowScale}};width:100%;margin-top:1.6cqmin">${wrapRow(false)}${wrapRow(true)}</div>`,
      ),
      { hashtag: "clubHashtag", sponsors: "logos", off: true },
      "photo",
      "list",
    ),
});

function ladderRowHtml(club: boolean): string {
  const cell = `flex:none;width:5.4cqmin;text-align:center;color:${club ? C.onp : C.chalk2}`;
  return (
    `<div${club ? ' data-repeat-variant="club"' : ""} style="display:flex;align-items:center;gap:1cqmin;height:4.6cqmin;padding:0 1.6cqmin;margin-top:.6cqmin;font-family:${CK_SANS};font-weight:600;font-size:2.1cqmin;background:${club ? C.p : C.panel};color:${club ? C.onp : C.chalk}">` +
    `<span style="flex:none;width:4cqmin;font-family:${CK_COND};font-weight:900;font-size:2.8cqmin;color:${club ? C.onp : C.pt}">{{row.pos}}</span>` +
    `<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{row.team}}</span>` +
    `<span style="${cell}">{{row.played}}</span><span style="${cell}">{{row.won}}</span><span style="${cell}">{{row.lost}}</span>` +
    `<span style="flex:none;width:6cqmin;text-align:right;font-family:${CK_COND};font-weight:900;font-size:2.8cqmin">{{row.points}}</span>` +
    `</div>`
  );
}

const ladder = design({
  kind: "ladder",
  designKey: "ladder",
  name: "Ladder",
  build: (f) =>
    card(
      f,
      "LADDER",
      col(
        eyebrow(u, "{{competitionName}} · {{asOfLabel}}") +
          display(u, "{{gradeLabel}} LADDER", 9, ";margin-top:1cqmin") +
          `<div style="width:100%;margin-top:1.4cqmin"><div style="display:flex;gap:1cqmin;padding:0 1.6cqmin;font-family:${CK_MONO};font-size:1.4cqmin;letter-spacing:.14em;color:${C.chalk2}"><span style="flex:none;width:4cqmin">#</span><span style="flex:1">TEAM</span><span style="flex:none;width:5.4cqmin;text-align:center">P</span><span style="flex:none;width:5.4cqmin;text-align:center">W</span><span style="flex:none;width:5.4cqmin;text-align:center">L</span><span style="flex:none;width:6cqmin;text-align:right">PTS</span></div>` +
          `<div data-repeat="rows" data-repeat-max="${f === "landscape" ? 5 : f === "story" ? 10 : 8}">${ladderRowHtml(true)}${ladderRowHtml(false)}</div></div>`,
      ),
      { hashtag: "clubHashtag", sponsors: "logos", off: true },
      "photo",
      "list",
    ),
});

const bigMoment = design({
  kind: "bigMoment",
  designKey: "big-moment",
  name: "Big Moment",
  build: (f) =>
    card(
      f,
      "LIVE",
      col(
        eyebrow(u, "{{inningsLabel}} · vs {{oppositionName}}") +
          display(
            u,
            "{{momentLabel}}",
            heroSize(f, 16, 13),
            `;line-height:.84;color:${C.pt};margin-top:1cqmin`,
          ) +
          display(u, "{{playerName}}", 7, ";margin-top:1.4cqmin") +
          meta(u, "{{runs}} ({{balls}}) · {{boundaryDetail}}", ";margin-top:.8cqmin") +
          `<div style="display:flex;background:${C.panel};width:100%;margin-top:2cqmin"><div style="width:1.4cqmin;flex:none;background:${C.p}"></div><div style="padding:1.6cqmin 2.2cqmin">` +
          display(u, "{{liveScore}}", 7) +
          meta(u, "{{oversChaseLine}}", ";margin-top:.6cqmin") +
          `<div style="display:inline-block;font-family:${CK_COND};font-weight:800;font-size:2.6cqmin;padding:.6cqmin 1.4cqmin;margin-top:1.2cqmin;background:${C.p};color:${C.onp}">{{equation}}</div>` +
          `</div></div>`,
      ),
      { hashtag: "clubHashtag", sponsors: "logos", off: true },
    ),
});

const newSigning = design({
  kind: "newSigning",
  designKey: "new-signing",
  name: "New Signing",
  build: (f) =>
    card(
      f,
      "NEW SIGNING",
      col(
        eyebrow(u, "WELCOME TO THE CLUB · {{season}}") +
          twoLineTitle(u, "{{playerFirstName}}", "{{playerLastName}}", 10) +
          `<div style="display:flex;align-items:center;gap:2cqmin;margin-top:1.8cqmin">${tricolourDash(u)}${display(u, "{{role}}", 4.4, "", 800)}</div>` +
          meta(
            u,
            `From <strong style="color:${C.chalk}">{{formerClub}}</strong>`,
            ";margin-top:1.2cqmin",
          ),
      ),
      NAME_FOOTER,
    ),
});

const countdown = design({
  kind: "countdown",
  designKey: "countdown",
  name: "Countdown",
  build: (f) =>
    card(
      f,
      "COUNTDOWN",
      col(
        eyebrow(u, "{{eventLabel}}") +
          twoLineTitle(u, "{{hypeLine1}}", "{{hypeLine2}}", 8) +
          `<div style="display:flex;align-items:flex-end;gap:2cqmin;margin-top:1.6cqmin">${display(u, "{{daysToGo}}", heroSize(f, 26, 20), `;line-height:.82;color:${C.pt}`)}${display(u, "DAYS<br>TO GO", 5, ";line-height:.95;padding-bottom:1cqmin", 800)}</div>` +
          display(u, "{{dateVenue}}", 4.2, ";margin-top:1.6cqmin", 800) +
          meta(u, "{{fixtureLine}}", ";margin-top:.6cqmin"),
      ),
      { hashtag: "clubHashtag", sponsors: "logos", off: true },
    ),
});

// ---------------------------------------------------------------------------
// Club Kit-only kinds
// ---------------------------------------------------------------------------

const roundFixtures = design({
  kind: "roundFixtures",
  designKey: "game-day",
  name: "Game Day — All Grades",
  own: {
    fields: [
      textField("date", "Date", "SATURDAY 14 FEB"),
      textField("roundLabel", "Round", "ROUND 15"),
      repeatField("fixtures", "Grades playing", "Up to 5 grades"),
    ],
    repeats: [
      {
        key: "fixtures",
        maxRows: 5,
        fields: [
          textField("grade", "Grade", "A"),
          textField("opponent", "Opponent", "Opposition"),
          textField("venue", "Venue", "Home Oval"),
          textField("startTime", "Start", "1:00"),
        ],
      },
    ],
  },
  build: (f) =>
    card(
      f,
      "{{roundLabel}}{{setMarker}}",
      col(
        eyebrow(u, "{{date}} · {{roundLabel}}") +
          twoLineTitle(u, "GAME", "DAY", f === "portrait" ? 12 : 16) +
          `<div data-repeat="fixtures" data-repeat-max="${f === "landscape" ? 4 : 5}" style="--rs:{{rowScale}};width:100%;margin-top:1.8cqmin">` +
          gradeRow(r, {
            grade: "{{row.grade}}",
            opponent: "v {{row.opponent}}",
            venue: "{{row.venue}}",
            time: "{{row.startTime}}",
          }) +
          `</div>`,
      ),
      NAME_FOOTER,
      "photo",
      "list",
    ),
});

const tradingCard = design({
  kind: "tradingCard",
  designKey: "trading-card",
  name: "Trading Card",
  own: {
    fields: [
      textField("playerName", "Player name", "SAMPLE PLAYER"),
      textField("role", "Role", "BATTING ALL-ROUNDER"),
      textField("capNumber", "Cap number", "242"),
      shirtNumberField(),
      textField("season", "Season", "2025/26"),
      ...[1, 2, 3, 4].flatMap((n) => [
        textField(`stat${n}Value`, `Stat ${n} value`, ["48", "1,294", "61", "29.8"][n - 1]),
        textField(`stat${n}Label`, `Stat ${n} label`, ["M", "RUNS", "WKTS", "AVG"][n - 1]),
      ]),
      photoField("cardPhoto", "Card photo", "Player photo"),
      photoField("photo", "Frame photo", "Club photo"),
    ],
  },
  build: (f) => {
    const frame = tradingFrame(u, {
      photo: slot("cardPhoto", "photo"),
      crest: `<div style="position:relative;width:100%;height:100%">${headerCrest().replace(/10cqmin/g, "7cqmin")}</div>`,
      cap: "#{{capNumber}}",
      // The season shirt number, on its own plate under the crest — never in
      // the cap slot.
      shirt: shirtNumberBadge(3.4, `;position:absolute;right:${u(2)};top:${u(12)};margin:0`),
      name: "{{playerName}}",
      role: "{{role}}",
      stats: [1, 2, 3, 4].map((n) => ({ value: `{{stat${n}Value}}`, label: `{{stat${n}Label}}` })),
    });
    const tall = isTall(f);
    return ckCard({
      format: f,
      chip: "COLLECTABLE",
      photo: "photo",
      body: `<div style="display:flex;justify-content:${tall ? "center" : "flex-start"};align-items:center;width:100%;height:100%;padding:${tall ? "0" : "0 0 0 2cqmin"}">${frame}</div>`,
      footer: NAME_FOOTER,
      wide: true,
    });
  },
});

const juniorHighlights = design({
  kind: "juniorHighlights",
  designKey: "junior-highlights",
  name: "Juniors Shine",
  own: {
    fields: [
      textField("grade", "Grade", "UNDER 13"),
      textField("roundLabel", "Round", "ROUND 9 · SATURDAY"),
      repeatField("highlights", "Highlights", "Up to 3 juniors"),
      photoField("photo", "Club photo (no identifiable child)", "Club photo"),
    ],
    repeats: [
      {
        key: "highlights",
        maxRows: 3,
        fields: [
          textField("name", "Name", "Riley T."),
          textField("note", "Note", "Top score"),
          textField("figure", "Figure", "52*"),
        ],
      },
    ],
  },
  build: (f) =>
    card(
      f,
      "JUNIORS",
      col(
        eyebrow(u, "{{grade}} · {{roundLabel}}") +
          twoLineTitle(u, "JUNIORS", "SHINE", f === "square" || f === "landscape" ? 12 : 14) +
          `<div data-repeat="highlights" data-repeat-max="3" style="width:100%;margin-top:1.8cqmin">` +
          juniorRow(u, { name: "{{row.name}}", note: "{{row.note}}", figure: "{{row.figure}}" }) +
          `</div>` +
          meta(
            u,
            "First names and initials only · photos with parent consent",
            ";margin-top:1.4cqmin;font-size:1.8cqmin",
          ),
      ),
      NAME_FOOTER,
      "photo",
      "list",
    ),
});

// ---------------------------------------------------------------------------
// Balanced card set covers (plan 2026-10-01-001)
// ---------------------------------------------------------------------------

const COVER_FIELDS: PackTemplateField[] = [
  textField("roundLabel", "Round", "ROUND 15"),
  textField("coverDate", "Date", "SATURDAY 14 FEB"),
  textField("coverCount", "Headline number", "8"),
  textField("coverLabel", "Headline label", "TEAMS IN ACTION"),
  textField("coverList", "Summary line", "A · B · C · D"),
  photoField("photo", "Cover photo", "Club photo"),
];

function coverDesign(
  kind: string,
  designKey: string,
  name: string,
  title: [string, string],
  swipe: string,
): PackDesignEntry {
  return design({
    kind,
    designKey,
    name,
    role: "cover",
    own: { fields: COVER_FIELDS },
    build: (f) =>
      card(
        f,
        "{{roundLabel}}",
        col(
          eyebrow(u, `{{coverDate}} · ${swipe}`) +
            twoLineTitle(u, title[0], title[1], f === "portrait" ? 12 : f === "story" ? 15 : 14) +
            `<div style="display:flex;align-items:flex-end;gap:2.2cqmin;margin-top:2.2cqmin">` +
            display(u, "{{coverCount}}", heroSize(f, 22, 18), `;line-height:.8;color:${C.pt}`) +
            `<div style="display:flex;flex-direction:column;gap:1cqmin;padding-bottom:1.2cqmin">${tricolourDash(u)}${display(u, "{{coverLabel}}", 4.6, ";line-height:.95", 800)}</div>` +
            `</div>` +
            meta(u, "{{coverList}}", ";margin-top:2cqmin"),
        ),
        NAME_FOOTER,
      ),
  });
}

const gameDayCover = coverDesign(
  "roundFixtures",
  "game-day-cover",
  "Game Day — Cover",
  ["GAME", "DAY"],
  "SWIPE FOR EVERY GRADE",
);
const weekendWrapCover = coverDesign(
  "weekendWrap",
  "weekend-wrap-cover",
  "Weekend Wrap — Cover",
  ["ROUND", "RESULTS"],
  "SWIPE FOR EVERY RESULT",
);
const teamListsCover = coverDesign(
  "teamListRound",
  "team-lists-cover",
  "Round Team Lists — Cover",
  ["SELECTED", "SIDES"],
  "SWIPE FOR YOUR TEAM",
);

/** Every Club Kit design, in registry order. */
export const CLUB_KIT_DESIGNS: PackDesignEntry[] = [
  matchResult,
  teamList,
  startingXi,
  weekendWrap,
  ladder,
  playerSpotlight,
  milestone,
  debut,
  century,
  fiveFor,
  bigMoment,
  matchDay,
  countdown,
  newSigning,
  premiership,
  record,
  gradeLeaderDesign("Runs"),
  gradeLeaderDesign("Wickets"),
  leadersDesign("Runs", "Runs"),
  leadersDesign("Wickets", "Wickets"),
  leadersDesign("Catches", "Runs"),
  leadersDesign("Dismissals", "Runs"),
  roundFixtures,
  tradingCard,
  juniorHighlights,
  gameDayCover,
  weekendWrapCover,
  teamListsCover,
];
