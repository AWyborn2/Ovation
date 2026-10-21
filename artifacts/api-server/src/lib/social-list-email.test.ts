import { describe, it, expect } from "vitest";
import {
  assetReadyEmail,
  assetReadyKey,
  digestEmail,
  digestKey,
  draftLabel,
  isMilestoneDraft,
  queueLink,
  socialToggleOn,
} from "./social-list-email";

const draft = (over: object = {}) => ({
  id: 7,
  caption: "Sam Lee 100* v Visitors\n#cricket",
  cardInput: { kind: "milestone" },
  ...over,
});

describe("social list emails", () => {
  it("each toggle switches its own email, off by default", () => {
    expect(socialToggleOn({}, "asset_ready")).toBe(false);
    expect(socialToggleOn({ assetReady: true }, "asset_ready")).toBe(true);
    expect(socialToggleOn({ assetReady: true }, "review_needed")).toBe(false);
    expect(socialToggleOn({ milestone: true }, "milestone")).toBe(true);
  });

  it("keys one card-ready send per draft per list, and a batch on its drafts", () => {
    expect(assetReadyKey(7, 3)).toBe("sa:7:asset_ready:l3");
    expect(digestKey("review_needed", 3, [2, 1])).toBe(digestKey("review_needed", 3, [1, 2]));
    expect(digestKey("review_needed", 3, [1, 2])).not.toBe(digestKey("milestone", 3, [1, 2]));
    expect(digestKey("review_needed", 3, [1, 2])).toMatch(/^sb:review_needed:l3:[0-9a-f]{16}$/);
  });

  it("milestones are the milestone engine and the achievements family", () => {
    expect(isMilestoneDraft({ engine: "milestone", family: null })).toBe(true);
    expect(isMilestoneDraft({ engine: "matchSummary", family: "achievements" })).toBe(true);
    expect(isMilestoneDraft({ engine: "matchSummary", family: "results" })).toBe(false);
  });

  it("labels a card by its caption's first line, else its kind", () => {
    expect(draftLabel(draft())).toBe("Sam Lee 100* v Visitors");
    expect(draftLabel(draft({ caption: null }))).toBe("milestone card #7");
    expect(draftLabel(draft({ caption: "", cardInput: {} }))).toBe("Card #7");
    expect(draftLabel(draft({ caption: "x".repeat(120) }))).toHaveLength(90);
  });

  it("card ready: caption in the body; a queue link instead when the image is missing", () => {
    const link = queueLink("https://club.example", [7]);
    expect(link).toBe("https://club.example/admin/social/queue?ids=7");
    const withImage = assetReadyEmail({ clubName: "Club", draft: draft(), link, attached: true });
    expect(withImage.subject).toBe("Club card ready to post: Sam Lee 100* v Visitors");
    expect(withImage.text).toContain("The image is attached.");
    expect(withImage.text).toContain("Sam Lee 100* v Visitors\n#cricket");
    const without = assetReadyEmail({ clubName: "Club", draft: draft(), link, attached: false });
    expect(without.text.split("\n").slice(0, 2)).toEqual([
      "This card is ready to post. Open the queue to download the image:",
      link,
    ]);
  });

  it("a batch lists every card with one link", () => {
    const drafts = [draft(), draft({ id: 8, caption: "Five-for" })];
    const review = digestEmail({ kind: "review_needed", clubName: "Club", drafts, link: "/q" });
    expect(review.subject).toBe("Club: 2 cards to review");
    expect(review.text).toBe(
      "2 cards are waiting for review:\n\n- Sam Lee 100* v Visitors\n- Five-for\n\n/q",
    );
    const one = digestEmail({ kind: "milestone", clubName: "Club", drafts: [draft()], link: "/q" });
    expect(one.subject).toBe("Club: 1 new milestone card");
  });
});
