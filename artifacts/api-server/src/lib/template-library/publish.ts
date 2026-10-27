/**
 * Clubs publishing their own templates to every club (template library
 * release 2, ADR-012, R2-B).
 *
 * - A **blank** club template is a private `card_templates` row for a kind,
 *   with the kind's pages and no layers and no library origin.
 * - **Publishing** runs `publishableDocument` on the stored design with the
 *   club's identity loaded here (never the browser's), so its result is the
 *   one that counts. Text that still names the club or a sponsor, and images
 *   the library's asset policy refuses, block it (422). The first publish
 *   creates a library template (`origin 'club'`, `author_tenant_id`), and the
 *   club template remembers it (`published_template_id`); every later one adds
 *   a version. Each version records who confirmed the rights to its artwork.
 * - A version that passes the fit check lists the template automatically
 *   (`listPassedClubVersion`); nobody approves it.
 * - The author can **unlist** it. Publishing again lists it again, unless
 *   Ovation unlisted it.
 */
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  cardTemplatesTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  tenantsTable,
  type CardTemplateRow,
} from "@workspace/db";
import {
  flattenLayers,
  kindPages,
  normaliseDocument,
  primaryPage,
  publishableDocument,
  setTypeOfKind,
  templateDocumentErrors,
  TEMPLATE_SIZE_ORDER,
  TEMPLATE_STYLE_TAGS,
  type PublishChange,
  type PublishFlag,
  type PublishIdentity,
  type TemplateLayerV2,
  type TemplateStyleTag,
} from "@workspace/scorecard/kind-templates";
import { loadActiveSponsors } from "../active-sponsors";
import { getTenantBrand } from "../tenant-brand";
import { isTemplateKind, KIND_SOURCE } from "../kind-templates";
import { logger } from "../logger";
import { libraryAssetPolicyErrors } from "./assets";
import { MAX_TEMPLATE_NAME, loadCopy } from "./copies";
import { documentCoverage } from "./coverage";
import { TemplateLibraryError } from "./errors";
import { initialFit, listPassedClubVersion, requestFit } from "./fit";
import { getOwnLibraryTemplate, type LibraryTemplateView } from "./store";

/** The most style tags one template carries. */
export const MAX_TEMPLATE_TAGS = 4;

/** A photo-led design gives a photo at least this share of its primary page, at some size. */
export const PHOTO_LED_MIN_AREA = 0.3;

/**
 * Below this relative luminance a background reads as dark: the point where
 * white and black text contrast with it equally (WCAG relative luminance).
 */
export const DARK_LUMINANCE = 0.179;

const bad = (error: string) => new TemplateLibraryError(400, { error });

/** "Halls Head Cricket Club" → "Halls Head" (as the editor's `shortClubName`). */
const shortClubName = (name: string) => name.replace(/\s+Cricket Club$/i, "").trim() || name;

/**
 * The club's identity to find in a design: its names (the brand's, the
 * tenant's, each with its short form), crest, active sponsors and brand
 * colours as the editor draws them (`--gold` the accent, `--panel` the club
 * background).
 */
export async function loadPublishIdentity(tenantId: number): Promise<PublishIdentity> {
  const [brand, [tenant], sponsors] = await Promise.all([
    getTenantBrand(tenantId),
    db
      .select({ name: tenantsTable.name, shortName: tenantsTable.shortName })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId)),
    loadActiveSponsors(tenantId, logger),
  ]);
  const names = [brand.name, brand.shortName, tenant?.name, tenant?.shortName].filter(
    (n): n is string => typeof n === "string" && n.trim().length > 0,
  );
  const colours: Record<string, string> = {};
  if (brand.primaryColour) colours["--gold"] = brand.primaryColour;
  if (brand.backgroundColour) colours["--panel"] = brand.backgroundColour;
  return {
    logoUrl: brand.logoUrl || null,
    clubNames: [...new Set(names.flatMap((n) => [n, shortClubName(n)]))],
    sponsorNames: sponsors.map((s) => s.name),
    sponsorLogoUrls: sponsors.map((s) => s.logoUrl),
    colours,
  };
}

// ── Blank canvas ────────────────────────────────────────────────────────────

/** A kind's pages, each with no layers: what a blank canvas starts as. */
export function blankDocument(kind: string): unknown {
  return {
    formatVersion: 2,
    pages: Object.fromEntries(kindPages(kind).map((page) => [page, { layers: [] }])),
  };
}

/** A new private club template for `kind`, blank, never the default and with no origin. */
export async function createBlankCopy(
  tenantId: number,
  body: { kind: string; name?: string },
  adminId: number | null,
): Promise<CardTemplateRow> {
  if (!isTemplateKind(body.kind) || setTypeOfKind(body.kind)) {
    throw bad(`"${body.kind.slice(0, 30)}" isn't a card kind templates cover.`);
  }
  const name = body.name?.trim() || "New design";
  if (name.length > MAX_TEMPLATE_NAME) {
    throw bad(`A template name needs 1 to ${MAX_TEMPLATE_NAME} characters.`);
  }
  const [row] = await db
    .insert(cardTemplatesTable)
    .values({
      tenantId,
      name,
      source: KIND_SOURCE,
      baseKind: body.kind,
      cardKinds: [body.kind],
      adjustments: blankDocument(body.kind),
      version: 1,
      updatedAt: new Date(),
      updatedByAdminId: adminId,
      isKindDefault: false,
      // Nothing to check yet; saving a design asks for the fit check.
      fitStatus: "pass",
      fitReport: null,
    })
    .returning();
  return row!;
}

// ── Style tags ──────────────────────────────────────────────────────────────

export type TagCheck = { tag: TemplateStyleTag; ok: boolean; reason: string | null };

/** WCAG relative luminance of a 3- or 6-digit hex colour (8-digit: its colour part). */
function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** The largest share of the page one photo layer covers, at any size. */
function largestPhotoShare(layers: readonly TemplateLayerV2[]): number {
  let best = 0;
  for (const layer of flattenLayers(layers)) {
    if (layer.kind !== "photo") continue;
    const geometry = (layer as { geometry?: Record<string, { w?: number; h?: number }> })
      .geometry;
    const sizes = (layer as { sizes?: string[] }).sizes;
    for (const size of TEMPLATE_SIZE_ORDER) {
      if (sizes && !sizes.includes(size)) continue;
      const box = geometry?.[size];
      if (!box || typeof box.w !== "number" || typeof box.h !== "number") continue;
      best = Math.max(best, (Math.min(box.w, 100) / 100) * (Math.min(box.h, 100) / 100));
    }
  }
  return best;
}

/**
 * Whether the design can carry each style tag. `photo-led` needs a photo
 * covering 30% of the primary page at some size; `dark` and `light` need the
 * primary page's background to be a colour of that luminance (a club colour
 * token differs club to club, so it is neither). The others need no check.
 */
export function styleTagChecks(document: unknown, kind: string): TagCheck[] {
  const doc = normaliseDocument(document, kind);
  const page = doc.pages[primaryPage(kind)];
  const background = typeof page?.background === "string" ? page.background : null;
  const lum = background ? luminance(background) : null;
  const toneReason = (tone: "dark" | "light"): string | null => {
    if (!background) return `Give the main page a ${tone} background colour first.`;
    if (lum === null) return "The background takes each club's colours, so it isn't always " + tone + ".";
    const dark = lum < DARK_LUMINANCE;
    if (tone === "dark" ? dark : !dark) return null;
    return `The main page's background is ${dark ? "dark" : "light"}.`;
  };
  return TEMPLATE_STYLE_TAGS.map((tag) => {
    let reason: string | null = null;
    if (tag === "photo-led" && largestPhotoShare(page?.layers ?? []) < PHOTO_LED_MIN_AREA) {
      reason = "A photo needs to cover at least 30% of the main page.";
    } else if (tag === "dark" || tag === "light") {
      reason = toneReason(tag);
    }
    return { tag, ok: reason === null, reason };
  });
}

// ── Preview and publish ─────────────────────────────────────────────────────

export type PublishPreview = {
  document: unknown;
  changes: PublishChange[];
  flags: PublishFlag[];
  assetErrors: string[];
  tagChecks: TagCheck[];
  published: LibraryTemplateView | null;
};

/** The club template as it would be published, refusing what can't be. */
async function publishable(tenantId: number, row: CardTemplateRow) {
  const kind = row.baseKind ?? "";
  if (setTypeOfKind(kind)) throw bad("Set designs can't be published to the library yet.");
  if (row.originTemplateId !== null && row.editedAt === null) {
    throw bad("This is a library template you haven't changed, so there's nothing of yours to publish.");
  }
  const identity = await loadPublishIdentity(tenantId);
  const result = publishableDocument(row.adjustments ?? { layers: [] }, identity);
  return {
    kind,
    ...result,
    assetErrors: libraryAssetPolicyErrors(result.document),
    tagChecks: styleTagChecks(result.document, kind),
  };
}

/** What other clubs would get if this club template were published now. */
export async function publishPreview(tenantId: number, id: number): Promise<PublishPreview> {
  const row = await loadCopy(tenantId, id);
  const { document, changes, flags, assetErrors, tagChecks } = await publishable(tenantId, row);
  return {
    document,
    changes,
    flags,
    assetErrors,
    tagChecks,
    published:
      row.publishedTemplateId === null
        ? null
        : await getOwnLibraryTemplate(tenantId, row.publishedTemplateId).catch(() => null),
  };
}

export type PublishResult = {
  libraryTemplateId: number;
  version: number;
  fitStatus: "pending" | "pass" | "fail";
  listed: boolean;
};

/**
 * Publish a club template: a new library template the first time, a new
 * version after that. The fit check starts once it is written; a pass lists
 * it. Ovation's unlisting stays; the author's is undone.
 */
export async function publishCopy(
  tenantId: number,
  id: number,
  body: { name: string; tags: string[]; rightsConfirmed: boolean },
  adminId: number | null,
): Promise<PublishResult> {
  if (body.rightsConfirmed !== true) {
    throw bad("Confirm your club has the rights to the artwork in this design.");
  }
  const name = body.name.trim();
  if (!name || name.length > MAX_TEMPLATE_NAME) {
    throw bad(`A template name needs 1 to ${MAX_TEMPLATE_NAME} characters.`);
  }
  const tags = [...new Set(body.tags)];
  const unknown = tags.find((t) => !(TEMPLATE_STYLE_TAGS as readonly string[]).includes(t));
  if (unknown !== undefined) throw bad(`"${unknown.slice(0, 30)}" isn't a style tag.`);
  if (tags.length > MAX_TEMPLATE_TAGS) throw bad(`Pick at most ${MAX_TEMPLATE_TAGS} style tags.`);

  const row = await loadCopy(tenantId, id);
  const { kind, document, flags, assetErrors, tagChecks } = await publishable(tenantId, row);
  if (flags.length > 0 || assetErrors.length > 0) {
    throw new TemplateLibraryError(422, {
      error:
        flags.length > 0
          ? "Some text still names your club or a sponsor. Make it a field before publishing."
          : "The design uses images the library can't share.",
      flags,
      assetErrors: assetErrors.slice(0, 20),
    });
  }
  const failing = tagChecks.find((c) => !c.ok && tags.includes(c.tag));
  if (failing) throw bad(`"${failing.tag}" doesn't fit this design: ${failing.reason}`);
  const problems = templateDocumentErrors(document, kind);
  if (problems.length > 0) {
    throw new TemplateLibraryError(400, { error: problems[0], problems: problems.slice(0, 20) });
  }
  const coverage = documentCoverage(document, kind);
  if (coverage.pages.length === 0) throw bad("Add at least one element before publishing.");

  const fit = initialFit();
  const now = new Date();
  const written = await db.transaction(async (tx) => {
    // Lock the club template so two publishes of it can't both create a library template.
    const [locked] = await tx
      .select({ publishedTemplateId: cardTemplatesTable.publishedTemplateId })
      .from(cardTemplatesTable)
      .where(and(eq(cardTemplatesTable.id, row.id), eq(cardTemplatesTable.tenantId, tenantId)))
      .for("update");
    const [existing] =
      locked?.publishedTemplateId != null
        ? await tx
            .select()
            .from(libraryTemplatesTable)
            .where(
              and(
                eq(libraryTemplatesTable.id, locked.publishedTemplateId),
                eq(libraryTemplatesTable.authorTenantId, tenantId),
                eq(libraryTemplatesTable.origin, "club"),
              ),
            )
            .for("update")
        : [];
    let templateId: number;
    let version: number;
    if (existing) {
      templateId = existing.id;
      version = existing.currentVersion + 1;
      const authorUnlisted = existing.unlistedBy === "author";
      await tx
        .update(libraryTemplatesTable)
        .set({
          name,
          tags,
          currentVersion: version,
          updatedAt: now,
          // Publishing again is how the author lists it again.
          ...(authorUnlisted ? { unlistedBy: null, unlistedAt: null, unlistReason: null } : {}),
        })
        .where(eq(libraryTemplatesTable.id, existing.id));
    } else {
      const [created] = await tx
        .insert(libraryTemplatesTable)
        .values({
          kind,
          name,
          origin: "club",
          authorTenantId: tenantId,
          currentVersion: 1,
          tags,
          listed: false,
        })
        .returning({ id: libraryTemplatesTable.id });
      templateId = created!.id;
      version = 1;
      await tx
        .update(cardTemplatesTable)
        .set({ publishedTemplateId: templateId })
        .where(and(eq(cardTemplatesTable.id, row.id), eq(cardTemplatesTable.tenantId, tenantId)));
    }
    await tx.insert(libraryTemplateVersionsTable).values({
      templateId,
      version,
      document,
      coverage,
      publishedByTenantId: tenantId,
      rightsConfirmedByAdminId: adminId,
      rightsConfirmedAt: now,
      ...fit,
    });
    // With no fit job registered the version passes at once (the dev stack).
    if (fit.fitStatus === "pass") await listPassedClubVersion(templateId, version, tx);
    return { templateId, version };
  });
  requestFit(
    { kind: "libraryVersion", templateId: written.templateId, version: written.version },
    document,
    kind,
  );
  const view = await getOwnLibraryTemplate(tenantId, written.templateId);
  return {
    libraryTemplateId: written.templateId,
    version: written.version,
    fitStatus: view.fitStatus,
    listed: view.listed,
  };
}

/**
 * The author takes its template out of the library. One Ovation unlisted
 * stays Ovation's (so publishing again can't list it).
 */
export async function unlistOwnTemplate(
  tenantId: number,
  id: number,
): Promise<LibraryTemplateView> {
  const own = and(
    eq(libraryTemplatesTable.id, id),
    eq(libraryTemplatesTable.authorTenantId, tenantId),
    eq(libraryTemplatesTable.origin, "club"),
  );
  await db
    .update(libraryTemplatesTable)
    .set({ listed: false, unlistedBy: "author", unlistedAt: new Date(), updatedAt: new Date() })
    .where(
      and(own, sql`${libraryTemplatesTable.unlistedBy} is distinct from 'ovation'`),
    );
  return getOwnLibraryTemplate(tenantId, id);
}
