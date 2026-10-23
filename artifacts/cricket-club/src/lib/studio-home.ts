/**
 * Social Studio home (plan 2026-10-23 studio home): which card kinds the Create
 * row offers, and the club's recent work for Continue designing, newest first.
 * Pure, so the ordering and the posting-plan split are tested on their own.
 */
import type {
  CardSet,
  ClubTemplateSummary,
  PostingPlan,
  SocialDraft,
} from "@workspace/api-client-react";
import { POSTING_ROW_DEFS, type PostingRowId } from "@workspace/scorecard/posting-plan";
import type { CardKind } from "@/lib/social-studio";
import type { CardSize } from "@/lib/share-card";

/** The Create row's card kinds, in the order they show. */
export const HOME_KINDS: CardKind[] = [
  "matchDay",
  "matchSummary",
  "resultsSummary",
  "teamList",
  "milestone",
  "bigMoment",
  "ladder",
  "weekendWrap",
  "sponsor",
  "announcement",
];

/**
 * Split the Create row's kinds into the ones the club posts and the rest
 * ("More"). A kind belongs to a posting-plan row; it's posted when its row is
 * on. Kinds no row covers (Sponsor, Announcement) are made by hand and always
 * show. With no saved plan every kind shows.
 */
export function splitPostedKinds(
  plan: PostingPlan | null | undefined,
  saved: boolean,
): { posted: CardKind[]; more: CardKind[] } {
  if (!plan || !saved) return { posted: [...HOME_KINDS], more: [] };
  const rows = plan.rows as Partial<Record<PostingRowId, { enabled?: boolean }>>;
  const rowOf = (kind: CardKind): PostingRowId | null => {
    for (const [id, def] of Object.entries(POSTING_ROW_DEFS)) {
      if (def.kinds.includes(kind)) return id as PostingRowId;
    }
    return null;
  };
  const posted: CardKind[] = [];
  const more: CardKind[] = [];
  for (const kind of HOME_KINDS) {
    const row = rowOf(kind);
    if (row === null || rows[row]?.enabled !== false) posted.push(kind);
    else more.push(kind);
  }
  return { posted, more };
}

export type RecentDesign =
  | {
      type: "draft";
      id: number;
      kind: string;
      size: CardSize | null;
      editedAt: string;
      href: string;
      draft: SocialDraft;
    }
  | {
      type: "template";
      id: number;
      kind: string;
      name: string;
      size: CardSize | null;
      editedAt: string;
      href: string;
      template: ClubTemplateSummary;
    }
  | {
      type: "set";
      id: number;
      name: string;
      size: CardSize;
      slides: number;
      editedAt: string;
      href: string;
    };

const draftKind = (d: SocialDraft): string =>
  String((d.cardInput as { kind?: unknown } | null)?.kind ?? d.family ?? "card");

/** A draft's last change: a hand edit, else the design edit, else when it was made. */
const draftEditedAt = (d: SocialDraft): string => d.editedAt ?? d.designEditedAt ?? d.createdAt;

/**
 * The club's work, newest first: drafts still in the queue (not posted or
 * dismissed), its own templates and its carousel sets. Carousel posts are
 * left out of drafts; they open from the queue.
 */
export function recentDesigns(
  {
    drafts = [],
    templates = [],
    sets = [],
  }: { drafts?: SocialDraft[]; templates?: ClubTemplateSummary[]; sets?: CardSet[] },
  limit?: number,
): RecentDesign[] {
  const items: RecentDesign[] = [];
  for (const d of drafts) {
    if (d.status === "posted" || d.status === "dismissed") continue;
    // A queued carousel (valid or not) opens from the queue, not the editor.
    const input = d.cardInput as { weekendCarousel?: unknown } | null;
    if (input && typeof input === "object" && input.weekendCarousel != null) continue;
    items.push({
      type: "draft",
      id: d.id,
      kind: draftKind(d),
      size: null,
      editedAt: draftEditedAt(d),
      href: `/admin/social/editor/${d.id}`,
      draft: d,
    });
  }
  for (const t of templates) {
    if (!t.updatedAt) continue;
    items.push({
      type: "template",
      id: t.id,
      kind: t.kind,
      name: t.name,
      size: (t.coverage.sizes[0] as CardSize | undefined) ?? null,
      editedAt: t.updatedAt,
      href: `/admin/social/template/${t.id}`,
      template: t,
    });
  }
  for (const s of sets) {
    if (!s.updatedAt) continue;
    items.push({
      type: "set",
      id: s.id,
      name: s.name,
      size: s.platformSize as CardSize,
      slides: s.slides.length,
      editedAt: s.updatedAt,
      href: `/admin/social/sets?open=${s.id}`,
    });
  }
  items.sort((a, b) => Date.parse(b.editedAt) - Date.parse(a.editedAt));
  return limit === undefined ? items : items.slice(0, limit);
}

/** "Edited 2 hours ago". */
export function editedAgo(iso: string, now: number = Date.now()): string {
  const delta = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(delta / 60_000);
  if (min < 1) return "Edited just now";
  if (min < 60) return `Edited ${min} minute${min === 1 ? "" : "s"} ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `Edited ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Edited ${days} day${days === 1 ? "" : "s"} ago`;
}
