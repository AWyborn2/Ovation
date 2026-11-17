import { describe, expect, it } from "vitest";
import type { SocialDraft } from "@workspace/api-client-react";
import {
  draftCreator,
  draftHeading,
  draftKind,
  draftSource,
} from "@/components/social-queue/draft-meta";

const NOW = new Date("2026-10-06T08:00:00Z");
const draft = (over: Partial<SocialDraft>): SocialDraft =>
  ({
    id: 1,
    engine: "adhoc",
    status: "awaiting_review",
    cardInput: {},
    appPath: "/",
    sourceMatchIsJunior: false,
    createdAt: "2026-10-06T07:49:00Z",
    ...over,
  }) as SocialDraft;

describe("who made a draft", () => {
  it("names the admin after the source for a hand-made card", () => {
    expect(draftSource(draft({ createdBy: "Ash Wyborn" }), NOW)).toBe(
      "adhoc · 11 min ago · by Ash Wyborn",
    );
  });

  it("marks a sweep-made card automatic, and says nothing for an old hand-made one", () => {
    expect(draftCreator(draft({ engine: "matchSummary", createdBy: null }))).toBe("automatic");
    expect(draftCreator(draft({ createdBy: null }))).toBeNull();
    expect(draftSource(draft({ createdBy: null }), NOW)).toBe("adhoc · 11 min ago");
  });
});

describe("draft titles (New Studio retest)", () => {
  it("titles a hand-made card with no name by its kind and match or day, never 'adhoc'", () => {
    expect(draftHeading(draft({ cardInput: { kind: "teamList", grade: "A Grade" } }))).toBe(
      "Team List: A Grade",
    );
    expect(
      draftHeading(
        draft({ cardInput: { kind: "matchDay", grade: "A Grade", opponent: "Pinjarra" } }),
      ),
    ).toBe("Match Day: A Grade v Pinjarra");
    expect(draftHeading(draft({ cardInput: { kind: "ladder" } }))).toBe("Ladder: 6 Oct");
  });

  it("titles a blank design 'Blank design', not its sample headline", () => {
    const blank = draft({
      packId: "blank",
      templateRef: null,
      templateVersion: null,
      cardInput: { kind: "announcement", headline: "Senior registration now open" },
      adjustments: { formatVersion: 2, pages: { card: { layers: [], background: "#FFFFFF" } } },
    });
    expect(draftHeading(blank)).toBe("Blank design");
    // A designed announcement keeps its headline.
    expect(draftHeading({ ...blank, templateVersion: 1 })).toBe("Senior registration now open");
  });

  it("names a carousel by its set type, not its payload's Match Day", () => {
    const set = (setType: string) =>
      draft({
        cardInput: {
          kind: "matchDay",
          weekendCarousel: { version: 3, setType, size: "square", submissionId: "x", slides: [] },
        },
      });
    expect(draftKind(set("teamList"))).toBe("teamList");
    expect(draftKind(set("results"))).toBe("resultsSummary");
    expect(draftKind(draft({ cardInput: { kind: "player" } }))).toBe("player");
  });
});
