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
