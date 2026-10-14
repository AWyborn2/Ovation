/**
 * Platform "PlayHQ competitions" page: competitions Ovation can't place in a grade are listed with
 * the clubs and matches affected, can be mapped to a grade or ignored, and decisions can be removed.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import type { GradeDecisionResult } from "@workspace/api-client-react";
import { renderAt } from "@/test/render";
import GradeDecisionsPage, { describeResult } from "./grade-decisions";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const result = (over: Partial<GradeDecisionResult>): GradeDecisionResult => ({
  gradeKey: "peel social shield",
  gradeName: "Peel Social Shield",
  action: "map",
  centralGrade: "Over 45s",
  reason: null,
  setAt: "2026-10-14T01:00:00.000Z",
  applied: true,
  created: 0,
  updated: 0,
  skipped: 0,
  ...over,
});

describe("describeResult", () => {
  it("says how many matches a mapping brought in", () => {
    expect(describeResult(result({ created: 5, updated: 2, skipped: 1 }))).toMatch(
      /mapped to Over 45s: 7 matches projected, 1 skipped/,
    );
    expect(describeResult(result({ created: 1 }))).toMatch(/1 match projected/);
  });

  it("explains that a mapping the projector couldn't apply waits for the next sync", () => {
    expect(describeResult(result({ applied: false }))).toMatch(/next sync/);
  });

  it("confirms an ignore", () => {
    expect(describeResult(result({ action: "ignore", centralGrade: null }))).toMatch(/now ignored/);
  });
});

describe("page", () => {
  function stubApi() {
    const calls: { method: string; url: string; body?: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const method = (init?.method ?? "GET").toUpperCase();
        calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (method === "PUT") {
          return new Response(JSON.stringify(result({ created: 3 })), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (method === "DELETE") return new Response(null, { status: 204 });
        return new Response(
          JSON.stringify({
            projectorConfigured: true,
            mappableGrades: ["A Grade", "Over 45s", "Masters"],
            pending: [
              {
                gradeKey: "peel social shield",
                gradeName: "Peel Social Shield",
                matches: 7,
                seasons: ["2025/26", "2026/27"],
                tenants: [{ id: 1, name: "Pinjarra CC" }],
                reason: "Ovation doesn't recognise this competition name",
              },
            ],
            decisions: [
              {
                gradeKey: "focus cup",
                gradeName: "Focus Cup",
                action: "map",
                centralGrade: "Over 50s",
                reason: null,
                setAt: "2026-10-01T01:00:00.000Z",
              },
              {
                gradeKey: "charity day",
                gradeName: "Charity Day",
                action: "ignore",
                centralGrade: null,
                reason: "one-off",
                setAt: "2026-10-02T01:00:00.000Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    return calls;
  }

  it("lists what needs a decision and the decisions made", async () => {
    stubApi();
    renderAt(<GradeDecisionsPage />, "/platform-admin/grade-decisions");
    const pending = await screen.findByTestId("pending-competitions");
    expect(within(pending).getByText("Peel Social Shield")).toBeTruthy();
    expect(within(pending).getByText(/7 matches · 2025\/26, 2026\/27 · Pinjarra CC/)).toBeTruthy();
    const decided = screen.getByTestId("decided-competitions");
    expect(within(decided).getByText("Over 50s")).toBeTruthy();
    expect(within(decided).getByText("Ignored")).toBeTruthy();
  });

  it("maps a competition to the chosen grade and reports what it projected", async () => {
    const calls = stubApi();
    renderAt(<GradeDecisionsPage />, "/platform-admin/grade-decisions");
    await screen.findByTestId("pending-competitions");
    const mapButton = screen.getByRole("button", { name: "Map" }) as HTMLButtonElement;
    expect(mapButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Grade for Peel Social Shield"), {
      target: { value: "Over 45s" },
    });
    expect(mapButton.disabled).toBe(false);
    fireEvent.click(mapButton);
    await screen.findByText(/mapped to Over 45s: 3 matches projected/);
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body).toEqual({
      gradeName: "Peel Social Shield",
      action: "map",
      centralGrade: "Over 45s",
    });
  });

  it("ignores a competition after confirming", async () => {
    const calls = stubApi();
    renderAt(<GradeDecisionsPage />, "/platform-admin/grade-decisions");
    await screen.findByTestId("pending-competitions");
    fireEvent.click(screen.getByRole("button", { name: "Ignore" }));
    // The row's Ignore button, then the dialog's confirm button (the last one).
    const buttons = await screen.findAllByRole("button", { name: "Ignore" });
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        gradeName: "Peel Social Shield",
        action: "ignore",
      }),
    );
  });

  it("removes a decision after confirming", async () => {
    const calls = stubApi();
    renderAt(<GradeDecisionsPage />, "/platform-admin/grade-decisions");
    const decided = await screen.findByTestId("decided-competitions");
    fireEvent.click(within(decided).getAllByRole("button", { name: "Remove" })[0]!);
    const confirmBtns = await screen.findAllByRole("button", { name: "Remove" });
    fireEvent.click(confirmBtns[confirmBtns.length - 1]!);
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.method === "DELETE" &&
            /grade-decisions\/focus%20cup$|grade-decisions\/focus cup$/.test(c.url),
        ),
      ).toBe(true),
    );
  });
});
