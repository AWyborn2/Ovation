import { and, eq, sql } from "drizzle-orm";
import {
  db,
  socialSettingsTable,
  captionTemplatesTable,
  cardThemesTable,
  cardTemplatesTable,
} from "@workspace/db";
import { getOrCreateSettings } from "./settings";

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
    template:
      "🏆 {player.name} • {stat.tier} • {stat.value} {stat.label} {app.link} {hashtag}",
  },
  {
    engine: "roundup",
    platform: "instagram",
    template:
      "Round-up — top performers this weekend 👇\n\n{app.link}\n\n{hashtag} #ClubCricket",
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
        target: [captionTemplatesTable.tenantId, captionTemplatesTable.engine, captionTemplatesTable.platform],
      });
  }
  return settings;
}

export async function ensureThemes(tenantId: number) {
  const [existing] = await db
    .select()
    .from(cardThemesTable)
    .where(eq(cardThemesTable.tenantId, tenantId))
    .limit(1);
  if (existing) return;
  await db.insert(cardThemesTable).values({
    tenantId,
    name: "Club Classic",
    bgDark: "#322F3D",
    bgPanel: "#3F3C4C",
    accent: "#FBD039",
    textLight: "#F5F2E8",
    isDefault: true,
    displayOrder: 0,
  });
}

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
  await tx
    .update(cardTemplatesTable)
    .set({
      defaultForKinds: sql`COALESCE((
        SELECT array_agg(k)
        FROM unnest(${cardTemplatesTable.defaultForKinds}) AS k
        WHERE k <> ALL(${kinds}::text[])
      ), '{}')`,
    })
    .where(
      and(
        eq(cardTemplatesTable.tenantId, tenantId),
        sql`${cardTemplatesTable.defaultForKinds} && ${kinds}::text[]`,
        exceptId !== undefined ? sql`${cardTemplatesTable.id} <> ${exceptId}` : undefined,
      ),
    );
};

// A publishable / exportable carousel must hold between 2 and 10 slides. The
// upper bound is also enforced by the generated zod body (maxItems: 10); this
// guards the 2-slide floor, which only applies once a set is published.
export const CARD_SET_MIN_SLIDES = 2;
export const CARD_SET_MAX_SLIDES = 10;
