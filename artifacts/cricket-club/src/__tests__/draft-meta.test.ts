import { describe, expect, it } from "vitest";
import type { SocialDraft } from "@workspace/api-client-react";
import { draftCreator, draftSource } from "@/components/social-queue/draft-meta";

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
