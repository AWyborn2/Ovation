import { describe, expect, it } from "vitest";
import type { SocialDraft } from "@workspace/api-client-react";
import { needsYou, quickPicks } from "./home-v2";

const d = (status: string, junior = false) =>
  ({
    status,
    sourceMatchIsJunior: junior,
    cardInput: { kind: "teamList" },
  }) as unknown as SocialDraft;

describe("New Studio Home", () => {
  it("counts what is waiting for review, seniors and juniors apart", () => {
    expect(
      needsYou([d("awaiting_review"), d("awaiting_review", true), d("ready"), d("posted")]),
    ).toEqual({ seniors: 1, juniors: 1, ready: 1 });
  });

  it("links quick picks into Create, with Junior Team List only for a club with juniors", () => {
    const labels = (j: boolean) => quickPicks(j).map((q) => q.label);
    expect(labels(true)).toContain("Junior Team List");
    expect(labels(false)).not.toContain("Junior Team List");
    expect(quickPicks(true).find((q) => q.label === "Carousel set")!.href).toBe(
      "/admin/social/create?kind=matchDay&mode=many&step=3",
    );
  });
});
