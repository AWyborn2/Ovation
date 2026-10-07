/**
 * Card kind templates (plan 2026-10-07-002, U5; ADR-002, ADR-003).
 *
 * One versioned template per tenant and card kind, stored as a
 * `card_templates` row with `source = 'kind'`. Templates are created lazily —
 * from the starter the club's current pack maps to — the first time a draft
 * of the kind needs one, or explicitly from a starter in the editor. Saves are
 * rejected when another admin saved first. Applying a version copies it into
 * the kind's unposted drafts, recording each draft's previous design first.
 *
 * Kind template rows never set `defaultForKinds`: that column carries the
 * club's pack choice, and `clearDefaultKinds` ignores `source` (KTD5).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  adminsTable,
  cardTemplatesTable,
  socialDraftsTable,
  type CardTemplateRow,
  type SocialDraftRow,
} from "@workspace/db";
import {
  emptySizes,
  isRetiredPack,
  kindFields,
  startingDocument,
  starterForPack,
  type StarterId,
  type StarterDocument,
} from "@workspace/scorecard/kind-templates";
import { recordDraftRevision } from "./draft-revisions";

export const KIND_SOURCE = "kind";

/** Draft statuses a template apply may change (R18: never posted). */
export const UNPOSTED_STATUSES = ["awaiting_review", "ready"] as const;

/** The most layers a template may hold; keeps a document from growing without bound. */
export const MAX_TEMPLATE_LAYERS = 300;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class KindTemplateError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly body: Record<string, unknown>,
  ) {
    super(String(body.error ?? "kind template error"));
  }
}

const notFound = (error: string) => new KindTemplateError(404, { error });

/** Whether a kind is one templates support. */
export function isTemplateKind(kind: string): boolean {
  return kindFields(kind) !== null;
}

export type KindTemplateView = {
  kind: string;
  version: number;
  updatedAt: string | null;
  replacedPackId: string | null;
  noticeDismissed: boolean;
  waitingDrafts: number;
  document?: StarterDocument;
  updatedByName?: string | null;
};

/** Unposted drafts of a kind, per kind, for one tenant. */
export async function waitingDraftCounts(tenantId: number): Promise<Map<string, number>> {
  const kindExpr = sql<string>`${socialDraftsTable.cardInput}->>'kind'`;
  const rows = await db
    .select({ kind: kindExpr, n: sql<number>`count(*)::int` })
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        inArray(socialDraftsTable.status, [...UNPOSTED_STATUSES]),
      ),
    )
    .groupBy(kindExpr);
  return new Map(rows.map((r) => [r.kind, Number(r.n)]));
}

export function presentKindTemplate(
  row: CardTemplateRow,
  waitingDrafts: number,
  opts: { withDocument?: boolean; updatedByName?: string | null } = {},
): KindTemplateView {
  const view: KindTemplateView = {
    kind: row.baseKind ?? "",
    version: row.version,
    updatedAt: (row.updatedAt ?? row.createdAt)?.toISOString() ?? null,
    replacedPackId: row.replacedPackId,
    noticeDismissed: row.noticeDismissedAt !== null,
    waitingDrafts,
  };
  if (opts.withDocument) {
    view.document = (row.adjustments ?? { layers: [] }) as StarterDocument;
    view.updatedByName = opts.updatedByName ?? null;
  }
  return view;
}

/** A tenant's kind templates. */
export async function listKindTemplates(tenantId: number): Promise<CardTemplateRow[]> {
  return db
    .select()
    .from(cardTemplatesTable)
    .where(
      and(eq(cardTemplatesTable.tenantId, tenantId), eq(cardTemplatesTable.source, KIND_SOURCE)),
    );
}

/** A tenant's template for a kind, or null when it has none yet. */
export async function loadKindTemplate(
  tenantId: number,
  kind: string,
  tx: typeof db | Tx = db,
): Promise<CardTemplateRow | null> {
  const [row] = await tx
    .select()
    .from(cardTemplatesTable)
    .where(
      and(
        eq(cardTemplatesTable.tenantId, tenantId),
        eq(cardTemplatesTable.source, KIND_SOURCE),
        eq(cardTemplatesTable.baseKind, kind),
      ),
    );
  return row ?? null;
}

/** The display name of the admin who last saved, if any. */
export async function updatedByName(row: CardTemplateRow): Promise<string | null> {
  if (row.updatedByAdminId === null) return null;
  const [admin] = await db
    .select({ displayName: adminsTable.displayName, username: adminsTable.username })
    .from(adminsTable)
    .where(and(eq(adminsTable.id, row.updatedByAdminId), eq(adminsTable.tenantId, row.tenantId)));
  return admin ? admin.displayName?.trim() || admin.username : null;
}

/** Reject a document the template can't hold (KTD15). */
export function validateDocument(document: unknown): StarterDocument {
  if (
    typeof document !== "object" ||
    document === null ||
    !Array.isArray((document as StarterDocument).layers)
  ) {
    throw new KindTemplateError(400, { error: "A template needs a list of layers." });
  }
  const doc = document as StarterDocument;
  if (doc.layers.length > MAX_TEMPLATE_LAYERS) {
    throw new KindTemplateError(400, {
      error: `A template can hold at most ${MAX_TEMPLATE_LAYERS} elements.`,
    });
  }
  const empty = emptySizes(doc);
  if (empty.length > 0) {
    throw new KindTemplateError(400, {
      error: `Add at least one element to every size before saving (empty: ${empty.join(", ")}).`,
      emptySizes: empty,
    });
  }
  return doc;
}

const conflict = async (row: CardTemplateRow) =>
  new KindTemplateError(409, {
    error: "Someone else changed this template since you opened it.",
    currentVersion: row.version,
    updatedAt: (row.updatedAt ?? row.createdAt)?.toISOString() ?? null,
    updatedByName: await updatedByName(row),
  });

/**
 * The tenant's template for a kind, created from the starter its current pack
 * maps to when it has none (KTD11). Insert-or-ignore on the partial unique
 * index makes concurrent callers converge on one row. A template replacing a
 * retired pack records it so the Studio can say so (R19).
 */
export async function ensureKindTemplate(
  tenantId: number,
  kind: string,
  currentPackId: string | null,
): Promise<CardTemplateRow> {
  const existing = await loadKindTemplate(tenantId, kind);
  if (existing) return existing;
  const starter = starterForPack(currentPackId);
  await db
    .insert(cardTemplatesTable)
    .values({
      tenantId,
      name: `${kind} template`,
      source: KIND_SOURCE,
      baseKind: kind,
      cardKinds: [kind],
      adjustments: startingDocument(starter, kind),
      version: 1,
      updatedAt: new Date(),
      replacedPackId: isRetiredPack(currentPackId) ? currentPackId : null,
    })
    .onConflictDoNothing();
  const row = await loadKindTemplate(tenantId, kind);
  if (!row) throw new Error(`kind template for ${kind} vanished after insert`);
  return row;
}

/**
 * Start a kind's template from a starter: creates it, or — given the version
 * the admin is looking at — replaces an existing template's design.
 */
export async function startKindTemplate(
  tenantId: number,
  kind: string,
  starter: StarterId,
  baseVersion: number | undefined,
  adminId: number | null,
): Promise<CardTemplateRow> {
  const document = startingDocument(starter, kind);
  const existing = await loadKindTemplate(tenantId, kind);
  if (!existing) {
    await db
      .insert(cardTemplatesTable)
      .values({
        tenantId,
        name: `${kind} template`,
        source: KIND_SOURCE,
        baseKind: kind,
        cardKinds: [kind],
        adjustments: document,
        version: 1,
        updatedAt: new Date(),
        updatedByAdminId: adminId,
      })
      .onConflictDoNothing();
    const row = await loadKindTemplate(tenantId, kind);
    if (!row) throw new Error(`kind template for ${kind} vanished after insert`);
    return row;
  }
  if (baseVersion === undefined || baseVersion !== existing.version) throw await conflict(existing);
  return writeVersion(existing, document, adminId);
}

async function writeVersion(
  row: CardTemplateRow,
  document: StarterDocument,
  adminId: number | null,
): Promise<CardTemplateRow> {
  const [saved] = await db
    .update(cardTemplatesTable)
    .set({
      adjustments: document,
      version: row.version + 1,
      updatedAt: new Date(),
      updatedByAdminId: adminId,
    })
    .where(and(eq(cardTemplatesTable.id, row.id), eq(cardTemplatesTable.version, row.version)))
    .returning();
  if (!saved) {
    const latest = await loadKindTemplate(row.tenantId, row.baseKind ?? "");
    throw await conflict(latest ?? row);
  }
  return saved;
}

/** Save a new version, unless another admin saved since `baseVersion` (KTD7). */
export async function saveKindTemplate(
  tenantId: number,
  kind: string,
  baseVersion: number,
  document: unknown,
  adminId: number | null,
): Promise<CardTemplateRow> {
  const doc = validateDocument(document);
  const existing = await loadKindTemplate(tenantId, kind);
  if (!existing) throw notFound("This card kind has no template yet.");
  if (existing.version !== baseVersion) throw await conflict(existing);
  return writeVersion(existing, doc, adminId);
}

/** Hide the retired-pack notice for a kind. */
export async function dismissKindTemplateNotice(tenantId: number, kind: string): Promise<void> {
  const row = await loadKindTemplate(tenantId, kind);
  if (!row) throw notFound("This card kind has no template yet.");
  await db
    .update(cardTemplatesTable)
    .set({ noticeDismissedAt: new Date() })
    .where(eq(cardTemplatesTable.id, row.id));
}

/** The kind a draft renders, from its card input. */
const draftKind = (draft: Pick<SocialDraftRow, "cardInput">): string | null => {
  const input = draft.cardInput as { kind?: unknown } | null;
  return typeof input?.kind === "string" ? input.kind : null;
};

/**
 * Copy a saved template version into the kind's unposted drafts (R16, KTD8).
 * Each draft's previous design is recorded as a revision first, status is
 * re-checked under a row lock so a draft posted meanwhile is skipped (R18),
 * and the caption marker `editedAt` is left alone. The draft then owes a
 * layout check render before automation may act on it (KTD10).
 */
export async function applyKindTemplate(
  tenantId: number,
  kind: string,
  version: number,
  /** How many waiting drafts the admin was shown; any shortfall was posted meanwhile. */
  expectedDrafts?: number,
): Promise<{ changed: number; skipped: number }> {
  return db.transaction(async (tx) => {
    const template = await loadKindTemplate(tenantId, kind, tx);
    if (!template) throw notFound("This card kind has no template yet.");
    if (template.version !== version) throw await conflict(template);
    // Lock the unposted drafts: a publish racing this apply waits for it, and
    // a draft already posted is simply not selected (R18).
    const candidates = await tx
      .select()
      .from(socialDraftsTable)
      .where(
        and(
          eq(socialDraftsTable.tenantId, tenantId),
          inArray(socialDraftsTable.status, [...UNPOSTED_STATUSES]),
          sql`${socialDraftsTable.cardInput}->>'kind' = ${kind}`,
        ),
      )
      .for("update");
    let changed = 0;
    for (const draft of candidates) {
      if (draftKind(draft) !== kind) continue;
      await recordDraftRevision(draft, "template", tx);
      await tx
        .update(socialDraftsTable)
        .set({
          adjustments: structuredClone(template.adjustments ?? { layers: [] }),
          packId: "blank",
          templateVersion: template.version,
          designEditedAt: null,
          layoutWarnings: null,
          layoutCheckPending: true,
        })
        .where(eq(socialDraftsTable.id, draft.id));
      changed += 1;
    }
    const skipped = expectedDrafts === undefined ? 0 : Math.max(0, expectedDrafts - changed);
    return { changed, skipped };
  });
}
