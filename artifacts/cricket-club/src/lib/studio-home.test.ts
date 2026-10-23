import { describe, expect, it } from "vitest";
import type {
  CardSet,
  ClubTemplateSummary,
  PostingPlan,
  SocialDraft,
} from "@workspace/api-client-react";
import { HOME_KINDS, editedAgo, recentDesigns, splitPostedKinds } from "./studio-home";
import { adoptedLookId } from "@/components/studio-home/templates-strip";
import type { LibraryTemplate } from "@workspace/api-client-react";

const draft = (id: number, over: Partial<SocialDraft> = {}): SocialDraft =>
  ({
    id,
    engine: "ondemand",
    status: "awaiting_review",
    cardInput: { kind: "milestone" },
    appPath: "/",
    sourceMatchIsJunior: false,
    createdAt: "2026-10-20T00:00:00Z",
    editedAt: null,
    designEditedAt: null,
    ...over,
  }) as SocialDraft;

const template = (id: number, updatedAt: string | null): ClubTemplateSummary =>
  ({
    id,
    kind: "matchDay",
    name: `Template ${id}`,
    version: 1,
    isDefault: false,
    basedOn: null,
    edited: true,
    updateAvailable: null,
    fitStatus: "pass",
    fitReport: null,
    coverage: { pages: ["card"], sizes: ["story", "square"] },
    updatedAt,
  }) as ClubTemplateSummary;

const set = (id: number, updatedAt?: string): CardSet =>
  ({
    id,
    name: `Set ${id}`,
    platformSize: "portrait",
    slides: [{}, {}],
    isPublished: false,
    updatedAt,
  }) as unknown as CardSet;

describe("splitPostedKinds", () => {
  it("offers every kind before a plan is saved", () => {
    expect(splitPostedKinds(null, false)).toEqual({ posted: HOME_KINDS, more: [] });
  });

  it("puts kinds whose plan row is off under More, and keeps hand-made kinds", () => {
    const plan = {
      version: 2,
      styleId: null,
      rows: { ladders: { enabled: false }, results: { enabled: true } },
      bigMoments: {},
    } as unknown as PostingPlan;
    const { posted, more } = splitPostedKinds(plan, true);
    expect(more).toEqual(["ladder"]);
    expect(posted).toContain("matchSummary");
    expect(posted).toContain("sponsor");
    expect(posted).toContain("announcement");
  });
});

describe("recentDesigns", () => {
  it("merges drafts, templates and sets newest first, and caps the list", () => {
    const items = recentDesigns(
      {
        drafts: [
          draft(1, { editedAt: "2026-10-22T10:00:00Z" }),
          draft(2, { designEditedAt: "2026-10-21T10:00:00Z" }),
          draft(3, { status: "posted", editedAt: "2026-10-23T00:00:00Z" }),
        ],
        templates: [template(10, "2026-10-22T12:00:00Z"), template(11, null)],
        sets: [set(20, "2026-10-23T01:00:00Z"), set(21)],
      },
      3,
    );
    expect(items.map((d) => `${d.type}:${d.id}`)).toEqual(["set:20", "template:10", "draft:1"]);
    expect(items[0]).toMatchObject({ size: "portrait", href: "/admin/social/sets?open=20" });
    expect(items[1]).toMatchObject({ size: "story", href: "/admin/social/template/10" });
    expect(items[2]).toMatchObject({ kind: "milestone", href: "/admin/social/editor/1" });
  });

  it("leaves out posted and dismissed drafts and queued carousels", () => {
    const items = recentDesigns({
      drafts: [
        draft(1, { status: "dismissed" }),
        draft(2, { cardInput: { kind: "matchDay", weekendCarousel: { version: 3 } } }),
        draft(3),
      ],
    });
    expect(items.map((d) => d.id)).toEqual([3]);
  });
});

describe("editedAgo", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");
  it("reads like Canva's", () => {
    expect(editedAgo("2026-10-23T11:59:40Z", now)).toBe("Edited just now");
    expect(editedAgo("2026-10-23T11:00:00Z", now)).toBe("Edited 1 hour ago");
    expect(editedAgo("2026-10-23T10:00:00Z", now)).toBe("Edited 2 hours ago");
    expect(editedAgo("2026-10-20T12:00:00Z", now)).toBe("Edited 3 days ago");
  });
});

describe("adoptedLookId", () => {
  it("is the look most of the club's templates are based on", () => {
    const lib = [
      { id: 1, look: { id: 7 } },
      { id: 2, look: { id: 7 } },
      { id: 3, look: { id: 8 } },
    ] as unknown as LibraryTemplate[];
    expect(adoptedLookId(lib, [1, 2, 3, undefined])).toBe(7);
    expect(adoptedLookId(lib, [])).toBeNull();
  });
});
