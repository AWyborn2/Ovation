import { and, arrayOverlaps, eq, sql } from "drizzle-orm";
import {
  db,
  socialSettingsTable,
  captionTemplatesTable,
  cardThemesTable,
  cardTemplatesTable,
} from "@workspace/db";
import { getOrCreateSettings } from "./settings";
import { getTenantBrand } from "./tenant-brand";

/**
 * Shared helpers for the social-cards routes: default caption templates and
 * the per-tenant seed/default-management routines.
 *
 * Extracted from routes/social-cards.ts. They only depend on the db layer and
 * the settings helper — never on a route — so importing them back into the
 * router cannot create a cycle.
 */

export const DEFAULT_TEMPLATES: { engine: string; platform: string; template: string }[] = [
  {
    engine: "ondemand",
    platform: "instagram",
    template:
      "{player.name} — {stat.label}: {stat.value} 🏏\n\nHonour board form. {app.link}\n\n{hashtag} #ClubCricket",
  },
  {
    engine: "ondemand",
    platform: "facebook",
    template:
      "{player.name} now sits on {stat.value} {stat.label}. Follow the full season at {app.link}\n\n{hashtag}",
  },
  {
    engine: "ondemand",
    platform: "twitter",
    template: "{player.name} • {stat.value} {stat.label} {app.link} {hashtag}",
  },
  {
    engine: "milestone",
    platform: "instagram",
    template:
      "🏆 MILESTONE — {player.name}\n{stat.tier}: {stat.value} {stat.label}\n\nCongratulations from everyone at the club. {app.link}\n\n{hashtag}",
  },
  {
    engine: "milestone",
    platform: "facebook",
    template:
      "Milestone alert: {player.name} has joined the {stat.tier} for {stat.label} with {stat.value}. {app.link} {hashtag}",
  },
  {
    engine: "milestone",
    platform: "twitter",
    template: "🏆 {player.name} • {stat.tier} • {stat.value} {stat.label} {app.link} {hashtag}",
  },
  {
    engine: "roundup",
    platform: "instagram",
    template: "Round-up — top performers this weekend 👇\n\n{app.link}\n\n{hashtag} #ClubCricket",
  },
  {
    engine: "roundup",
    platform: "facebook",
    template: "This weekend's top performers across the grades. {app.link} {hashtag}",
  },
  {
    engine: "roundup",
    platform: "twitter",
    template: "Round-up: top performers. {app.link} {hashtag}",
  },
  {
    engine: "recap",
    platform: "instagram",
    template:
      "Season recap — {grade.name} 📋\n\nLeading the way this season. {app.link}\n\n{hashtag}",
  },
  {
    engine: "recap",
    platform: "facebook",
    template: "Season recap: {grade.name} — the players who led the way. {app.link} {hashtag}",
  },
  {
    engine: "recap",
    platform: "twitter",
    template: "Season recap: {grade.name}. {app.link} {hashtag}",
  },
];

/**
 * Instagram captions for the game day, team list and weekend wrap drafts, per
 * match (`matchday`, `teamlist`) and per whole round (round-sets engines).
 * Each draft takes one variation, picked by its source key, so the posts read
 * differently from match to match and round to round, and a refresh keeps the
 * draft's pick. Junior drafts share these, so every line suits any age group.
 * The weekend wrap never quotes its win count: a winless round would read badly.
 */
export const CAPTION_VARIATIONS: Record<string, readonly string[]> = {
  matchday: [
    "📣 MATCH DAY 📣\n\n{grade.name} take on {opponent.name} 🏏\n📍 {venue}\n🗓️ {date} · ⏰ {stat.value}\n\nBring a chair and bring the noise 🪑🔊\n\n{hashtag} #MatchDay",
    "🏏 Game on! 🏏\n\n{grade.name} v {opponent.name}, {round.label}\nFirst ball {stat.value}, {date} at {venue} ☀️\n\nCome down and get behind the team 🙌\n\n{app.link}\n{hashtag} #MatchDay",
    "🪙 The toss is close…\n\n{grade.name} face {opponent.name} on {date} 🏏\n📍 {venue} · ⏰ {stat.value}\n\nWho's coming down? 👇\n\n{hashtag} #MatchDay #ClubCricket",
    "☀️ Whites on, game face on ☀️\n\n{round.label}: {grade.name} against {opponent.name}\n🗓️ {date} · ⏰ {stat.value}\n📍 {venue}\n\nLet's go! 💪\n\n{hashtag} #MatchDay",
    "🔥 MATCH PREVIEW 🔥\n\n{grade.name} v {opponent.name}, {round.label} 🏏\n⏰ {stat.value} start, {date}\n📍 {venue}\n\nSee you at the ground 🍿\n\n{app.link}\n{hashtag} #MatchDay",
  ],
  teamlist: [
    "📋 TEAM NEWS 📋\n\nYour {grade.name} XI 🏏\n📍 {venue}\n\nWhites washed? Kit bag packed? 🧺 Good luck, team! 💪\n\n{hashtag} #TeamList",
    "🧢 SELECTED 🧢\n\nHere's the {grade.name} side 🏏\n📍 {venue}\n\nTag a teammate who's in 👇\n\n{app.link}\n{hashtag} #TeamList #Selections",
    "✍️ The XI is named! ✍️\n\n{grade.name}\n📍 {venue}\n\nCan't make it? Tell your captain now, not on game morning ⏰😅\n\n{hashtag} #TeamList",
    "🏏 Pads packed, ready to roll 🏏\n\nThe {grade.name} team is in 📋\n📍 {venue}\n\nGet down and get behind them 🙌\n\n{hashtag} #TeamList #ClubCricket",
    "📣 Selection's done 📣\n\n{grade.name}: the side for this weekend 🏏\n📍 {venue}\n\nGood luck, everyone 🍀\n\n{app.link}\n{hashtag} #TeamList",
  ],
  "gameday-round": [
    "📣 GAME DAY · {round.label} 📣\n\n{stat.value} {stat.label} on {date} 🏏\nFind your side, grab a chair and get down to the ground 🪑☀️\n\nSwipe ➡️ for every opponent, venue and start time\n\n{hashtag} #GameDay",
    "🏏 Whites washed? Kit bag packed? 🧺\n\n{round.label} is here: {stat.value} {stat.label} on {date} 🗓️\nSwipe ➡️ to see where every side is playing\n\n{app.link}\n{hashtag} #GameDay #ClubCricket",
    "🗓️ {date}\n\nThe toss is close, so here's the full {round.label} draw: {stat.value} {stat.label} 🪙🏏\nSwipe ➡️ and come cheer on your team 📣\n\n{hashtag} #GameDay",
    "☀️ Sun's out, stumps are in 🏏\n\n{round.label} · {date}\n{stat.value} {stat.label} across the club. Swipe ➡️ for times and grounds ⏰📍\n\nWhich game are you heading to? 👇\n\n{hashtag} #GameDay",
    "🔥 ROUND PREVIEW 🔥\n\n{stat.value} {stat.label}, one club, one goal 💪\n{round.label} · {date}\n\nSwipe ➡️ for the full draw\n{app.link}\n\n{hashtag} #GameDay #UpTheClub",
  ],
  "teamlists-round": [
    "📋 SELECTIONS ARE IN 📋\n\n{round.label} · {date}\nAll {stat.value} {stat.label}, every name 🏏\n\nSwipe ➡️ to find your side. Can't make it? Tell your captain now ⏰\n\n{hashtag} #TeamLists #Selections",
    "🧢 TEAM NEWS 🧢\n\nHere are our {stat.value} {stat.label} for {round.label} ({date}) 🏏\nSwipe ➡️ and tag a teammate who's in 👇\n\n{app.link}\n{hashtag} #TeamLists",
    "🏏 The XIs are named! 🏏\n\n{round.label} · {date}\n{stat.value} {stat.label} ready to go 💪\n\nSwipe ➡️ for every side. Good luck, everyone 🍀\n\n{hashtag} #TeamLists #ClubCricket",
    "✍️ Pencilled in and ready to roll ✍️\n\nThe {round.label} team lists: {stat.value} {stat.label} 🧾\n🗓️ {date}\n\nSwipe ➡️ to check you're in, then pack the kit bag 🧺\n\n{hashtag} #TeamLists",
    "📣 Selection night is done 📣\n\nEvery side for {round.label} on {date}, {stat.value} {stat.label} in all 🏏\nSwipe ➡️ and get behind them this weekend 🙌\n\n{app.link}\n{hashtag} #TeamLists",
  ],
  "weekendwrap-round": [
    "🌯 THE WEEKEND WRAP 🌯\n\n{round.label} · {date}\nEvery result, all in one place 🏏\n\nSwipe ➡️ and shout out the stars from your side 👇\n\n{hashtag} #WeekendWrap #Results",
    "🏁 STUMPS on {round.label} 🏁\n\nHow every side went, {date} 📊\nSwipe ➡️ for results and top performers 🏏🎯\n\n{app.link}\n{hashtag} #WeekendWrap",
    "📝 Scorebook's closed for {round.label} 📝\n\nEvery result and every standout from {date} 🏏\nSwipe ➡️. Who's your player of the round? 🌟\n\n{hashtag} #WeekendWrap #ClubCricket",
    "🏏 That's a wrap on {round.label}! 🎬\n\n{date}\nRuns, wickets and results from across the club. Swipe ➡️\n\nTag a teammate who starred 👇\n\n{hashtag} #WeekendWrap",
    "📊 ROUND REPORT 📊\n\n{round.label} · {date}\nEvery grade, every result, every performer worth a mention 🏏🙌\n\nSwipe ➡️ for the lot\n{app.link}\n\n{hashtag} #WeekendWrap #Results",
  ],
};

export async function ensureSettings(tenantId: number) {
  const settings = await getOrCreateSettings(socialSettingsTable, tenantId);
  // Seed this tenant's default caption templates if missing.
  for (const t of DEFAULT_TEMPLATES) {
    await db
      .insert(captionTemplatesTable)
      .values({ ...t, tenantId })
      .onConflictDoNothing({
        target: [
          captionTemplatesTable.tenantId,
          captionTemplatesTable.engine,
          captionTemplatesTable.platform,
        ],
      });
  }
  return settings;
}

/**
 * Fallback palette for a tenant whose brand carries no colours. These were the
 * hard-coded seed values for every tenant — they are Halls Head's palette, and
 * because token priority is theme > brand, seeding them made the default theme
 * OVERRIDE each tenant's real brand colours on every card. They are now only a
 * last resort for a brand with nothing set.
 */
const FALLBACK_THEME = {
  bgDark: "#322F3D",
  bgPanel: "#3F3C4C",
  accent: "#FBD039",
  textLight: "#F5F2E8",
} as const;

/** Accept only a strict hex literal; anything else falls back. */
function hexOr(value: string | null | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : fallback;
}

/**
 * Seed the tenant's default card theme FROM ITS OWN BRAND.
 *
 * The seeded theme is what the Studio gallery and every share card resolve
 * tokens through (`resolvePackTokens` priority: junior > override > theme >
 * brand), so a theme seeded from literals silently outranks the tenant's brand
 * colours and every club's cards render in the seed palette. Deriving it from
 * the brand means a new tenant's cards look like that club from the first load,
 * and an admin can still edit or add themes afterwards.
 */
export async function ensureThemes(tenantId: number) {
  const [existing] = await db
    .select()
    .from(cardThemesTable)
    .where(eq(cardThemesTable.tenantId, tenantId))
    .limit(1);
  if (existing) return;
  const brand = await getTenantBrand(tenantId);
  await db.insert(cardThemesTable).values({
    tenantId,
    name: "Club Classic",
    // `primaryColour` is the club's accent (same mapping the renderer's
    // `brandDefaultTokens` uses); `juniorsColour` is its panel.
    bgDark: FALLBACK_THEME.bgDark,
    bgPanel: hexOr(brand.juniorsColour, FALLBACK_THEME.bgPanel),
    accent: hexOr(brand.primaryColour, FALLBACK_THEME.accent),
    textLight: FALLBACK_THEME.textLight,
    isDefault: true,
    displayOrder: 0,
  });
}

/**
 * A `text[]` SQL literal with each element bound as its own parameter:
 * `ARRAY[$1, $2]::text[]`.
 *
 * Interpolating the JS array straight into a template — `${kinds}::text[]` —
 * does NOT do this, and that is what broke every pack selection. Drizzle's
 * `buildQueryFromSourceParams` has an `Array.isArray` branch that expands an
 * array into a parenthesised parameter LIST for `IN (…)` use, so `${kinds}`
 * renders as `($1)` / `($1, $2)`. Postgres then saw `($1)::text[]` and refused
 * it — `cannot cast type text to text[]` for a single kind, and a plain syntax
 * error for two or more. The route has no try/catch, so it surfaced as a bare
 * 500 with the reason only in the server log.
 */
const textArray = (values: string[]) =>
  sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;

// A card kind may be the default for at most one template. Before a template
// claims a set of kinds as its defaults, strip those kinds from every other
// template's `default_for_kinds` array. `exceptId` skips the template being
// written so it can keep kinds it already owns.
export const clearDefaultKinds = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tenantId: number,
  kinds: string[],
  exceptId?: number,
): Promise<void> => {
  // `arrayOverlaps` throws on an empty array, and there is nothing to strip
  // anyway. Callers already guard this; belt and braces because the throw would
  // again present as an opaque 500.
  if (kinds.length === 0) return;
  await tx
    .update(cardTemplatesTable)
    .set({
      defaultForKinds: sql`COALESCE((
        SELECT array_agg(k)
        FROM unnest(${cardTemplatesTable.defaultForKinds}) AS k
        WHERE k <> ALL(${textArray(kinds)})
      ), '{}')`,
    })
    .where(
      and(
        eq(cardTemplatesTable.tenantId, tenantId),
        // Drizzle's own `&&` operator: it binds the array as ONE parameter
        // encoded by the column, which is exactly what the hand-written
        // fragment failed to do.
        arrayOverlaps(cardTemplatesTable.defaultForKinds, kinds),
        exceptId !== undefined ? sql`${cardTemplatesTable.id} <> ${exceptId}` : undefined,
      ),
    );
};

// A publishable / exportable carousel must hold between 2 and 10 slides. The
// upper bound is also enforced by the generated zod body (maxItems: 10); this
// guards the 2-slide floor, which only applies once a set is published.
export const CARD_SET_MIN_SLIDES = 2;
export const CARD_SET_MAX_SLIDES = 10;
