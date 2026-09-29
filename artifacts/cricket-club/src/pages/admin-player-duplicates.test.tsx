import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { renderAt } from "../test/render";
import { installApiMock } from "../test/mock-api";
import type { DuplicatePair, DuplicateReview } from "@workspace/api-client-react";
import AdminPlayerDuplicates from "./admin-player-duplicates";

/**
 * Duplicate-player review screen (hybrid stats plan U7): each suggested pair
 * shows both GUIDs' evidence (seasons, grades, games) with Confirm / Reject;
 * confirmed pairs can be undone and rejected ones reopened.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pair = (over: Partial<DuplicatePair>): DuplicatePair => ({
  participantId: "dup-guid",
  keeperParticipantId: "keep-guid",
  status: "suggested",
  updatedAt: "2026-09-29T00:00:00.000Z",
  keeper: {
    participantId: "keep-guid",
    displayName: "Chris Phelps",
    isPrivate: false,
    games: 42,
    seasons: ["2019/20", "2020/21"],
    grades: ["A Grade"],
  },
  duplicate: {
    participantId: "dup-guid",
    displayName: "C Phelps",
    isPrivate: false,
    games: 7,
    seasons: ["2021/22"],
    grades: ["A Grade", "B Grade"],
  },
  seasonGap: 1,
  sharedGrades: ["A Grade"],
  ...over,
});

const REVIEW: DuplicateReview = {
  suggested: [pair({})],
  confirmed: [
    pair({
      participantId: "conf-dup",
      keeperParticipantId: "conf-keep",
      status: "confirmed",
      keeper: { ...pair({}).keeper, participantId: "conf-keep", displayName: "Sam Keeper" },
      duplicate: { ...pair({}).duplicate, participantId: "conf-dup", displayName: "S Keeper" },
    }),
  ],
  rejected: [
    pair({
      participantId: "rej-dup",
      keeperParticipantId: "rej-keep",
      status: "rejected",
      keeper: { ...pair({}).keeper, participantId: "rej-keep", displayName: "Mark Brown" },
      duplicate: { ...pair({}).duplicate, participantId: "rej-dup", displayName: "M Brown" },
    }),
  ],
};

function reviewCalls(calls: string[]): string[] {
  return calls.filter((u) => u.includes("/review"));
}

describe("admin player duplicates", () => {
  it("shows a suggested pair with both players' evidence", async () => {
    installApiMock({ "/player-curation/duplicates": REVIEW });
    renderAt(<AdminPlayerDuplicates />, "/admin/people/duplicates");

    const card = await screen.findByTestId("duplicate-pair-dup-guid");
    const scope = within(card);
    expect(scope.getByText("Chris Phelps")).toBeTruthy();
    expect(scope.getByText("C Phelps")).toBeTruthy();
    expect(scope.getByText("42 games")).toBeTruthy();
    expect(scope.getByText("7 games")).toBeTruthy();
    expect(scope.getByText("2019/20 – 2020/21")).toBeTruthy();
    expect(scope.getByText("2021/22")).toBeTruthy();
    expect(scope.getByText("A Grade, B Grade")).toBeTruthy();
    expect(scope.getByText(/Next season/i)).toBeTruthy();
    expect(scope.getByRole("button", { name: /confirm/i })).toBeTruthy();
    expect(scope.getByRole("button", { name: /reject/i })).toBeTruthy();
  });

  it("confirm asks first, then posts the confirm action", async () => {
    const mock = installApiMock({ "/player-curation/duplicates": REVIEW });
    renderAt(<AdminPlayerDuplicates />, "/admin/people/duplicates");

    const card = await screen.findByTestId("duplicate-pair-dup-guid");
    fireEvent.click(within(card).getByRole("button", { name: /confirm/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Merge players" }));

    await waitFor(() =>
      expect(reviewCalls(mock.calls)).toContain("/api/player-curation/duplicates/dup-guid/review"),
    );
  });

  it("reject posts straight away", async () => {
    const mock = installApiMock({ "/player-curation/duplicates": REVIEW });
    renderAt(<AdminPlayerDuplicates />, "/admin/people/duplicates");
    const card = await screen.findByTestId("duplicate-pair-dup-guid");
    fireEvent.click(within(card).getByRole("button", { name: /reject/i }));
    await waitFor(() => expect(reviewCalls(mock.calls)).toHaveLength(1));
  });

  it("lists confirmed pairs with Undo and rejected pairs with Reopen", async () => {
    const mock = installApiMock({ "/player-curation/duplicates": REVIEW });
    renderAt(<AdminPlayerDuplicates />, "/admin/people/duplicates");

    fireEvent.click(await screen.findByRole("tab", { name: /confirmed/i }));
    const confirmed = await screen.findByTestId("duplicate-pair-conf-dup");
    expect(within(confirmed).getByText("Sam Keeper")).toBeTruthy();
    fireEvent.click(within(confirmed).getByRole("button", { name: /undo/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Split players" }));
    await waitFor(() =>
      expect(reviewCalls(mock.calls)).toContain("/api/player-curation/duplicates/conf-dup/review"),
    );

    fireEvent.click(screen.getByRole("tab", { name: /rejected/i }));
    const rejected = await screen.findByTestId("duplicate-pair-rej-dup");
    expect(within(rejected).getByText("Mark Brown")).toBeTruthy();
    fireEvent.click(within(rejected).getByRole("button", { name: /reopen/i }));
    await waitFor(() =>
      expect(reviewCalls(mock.calls)).toContain("/api/player-curation/duplicates/rej-dup/review"),
    );
  });

  it("shows an empty state when there is nothing to review", async () => {
    installApiMock({
      "/player-curation/duplicates": { suggested: [], confirmed: [], rejected: [] },
    });
    renderAt(<AdminPlayerDuplicates />, "/admin/people/duplicates");
    expect(await screen.findByText(/no likely duplicates/i)).toBeTruthy();
  });
});
