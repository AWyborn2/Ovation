/**
 * The Posting Plan tab, version 2 (plan 2026-10-15-001 U7): styles, rows,
 * grade picker with junior age groups, the combined-or-separate choice, the
 * junior runs bar, first visit, central-only carousels, saving and the phone
 * layout.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import type { SocialSettings } from "@workspace/api-client-react";
import {
  POSTING_ROWS,
  findPostingStyle,
  planFromStyle,
  type PostingPlan,
} from "@workspace/scorecard/posting-plan";
import { PostingPlanEditor } from "@/components/posting-plan/posting-plan-editor";
import AdminSocialPlan from "@/pages/admin-social-plan";
import { renderAt } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const GRADES = ["A Grade", "B Grade", "Female A Grade", "Under 14", "Under 16"];

function settings(over: Partial<{ plan: PostingPlan; saved: boolean; central: boolean }> = {}) {
  const plan = over.plan ?? planFromStyle(findPostingStyle("every-match", true)!);
  return {
    postingPlan: plan,
    postingPlanSaved: over.saved ?? true,
    centralData: over.central ?? true,
    roundSchedules: {
      gameDay: { mode: "perFixture", day: 4, hour: 18 },
      teamLists: { mode: "perFixture", day: 5, hour: 12 },
      weekendWrap: { mode: "off", day: 0, hour: 19 },
    },
  } as unknown as SocialSettings;
}

function stubPatch(reply: (body: unknown) => Response = () => json({})) {
  const bodies: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET").toUpperCase() === "PATCH") {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        return reply(body);
      }
      return json({});
    }),
  );
  return bodies;
}
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

const table = () => screen.getByRole("table");
/** A row's plain-words summary, read inside that row of the desktop table. */
const summaryOf = (label: string) => {
  const cell = within(table()).getByText(label, { selector: "p.font-medium" });
  return cell.closest("tr")!.querySelector("p.text-xs")!.textContent;
};
const render = (s: SocialSettings) =>
  renderAt(<PostingPlanEditor settings={s} grades={GRADES} />, "/admin/social/plan");
/** Switch a row's grade picker to "Choose grades…" and tick one grade. */
const tickGrade = (label: string, grade: string) => {
  fireEvent.change(within(table()).getByLabelText(`${label}: grades`), {
    target: { value: "custom" },
  });
  fireEvent.click(within(table()).getByLabelText(grade));
};

describe("Posting Plan", () => {
  it("shows one row per card kind with a plain-words sentence", () => {
    render(settings());
    const rows = within(table()).getAllByRole("row");
    expect(rows).toHaveLength(POSTING_ROWS.length + 1);
    expect(summaryOf("Match result")).toBe("all senior grades · each on its own");
    expect(summaryOf("Big Moment")).toBe("all senior grades · each on its own");
    expect(summaryOf("Ladders")).toBe("off");
  });

  it("choosing a style fills every row; editing one makes it custom", () => {
    render(settings());
    fireEvent.change(screen.getByLabelText("Style"), { target: { value: "round-carousels" } });
    expect(summaryOf("Match result")).toBe("all senior grades · one round carousel");
    expect(screen.getByText("Using “Round carousels + individual highlights”")).toBeTruthy();
    fireEvent.click(
      within(table()).getByRole("switch", { name: "Milestones: draft automatically" }),
    );
    expect(screen.getAllByText("Custom").length).toBeGreaterThan(0);
  });

  it("asks before a style replaces a custom plan, and cancel keeps the edits", async () => {
    const plan = planFromStyle(findPostingStyle("every-match", true)!);
    plan.rows.milestones = { ...plan.rows.milestones, enabled: false };
    render(settings({ plan }));
    fireEvent.change(screen.getByLabelText("Style"), { target: { value: "results-only" } });
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/This replaces your own choices/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(summaryOf("Game day")).toBe("all senior grades · each on its own");
  });

  it("offers only the packaging each row supports, never 'both'", () => {
    render(settings());
    expect(within(table()).queryByLabelText("Milestones: post as")).toBeNull();
    const teamLists = within(table()).getByLabelText("Team lists: post as") as HTMLSelectElement;
    expect(Array.from(teamLists.options).map((o) => o.value)).toEqual(["individual", "round"]);
    const results = within(table()).getByLabelText("Match result: post as") as HTMLSelectElement;
    expect(Array.from(results.options).map((o) => o.value)).not.toContain("both");
  });

  it("keeps results, ladder and leaderboard carousels to central clubs", () => {
    render(settings({ central: false }));
    const results = within(table()).getByLabelText("Match result: post as") as HTMLSelectElement;
    const round = Array.from(results.options).find((o) => o.value === "round")!;
    expect(round.disabled).toBe(true);
    const teamLists = within(table()).getByLabelText("Team lists: post as") as HTMLSelectElement;
    expect(Array.from(teamLists.options).every((o) => !o.disabled)).toBe(true);
    expect(
      (
        within(table()).getByRole("switch", {
          name: "Ladders: draft automatically",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(within(table()).getAllByText(/association database/).length).toBeGreaterThan(0);
  });

  it("saves the whole version 2 plan in one request and shows the API's error", async () => {
    const bodies = stubPatch(() =>
      json({ error: "Milestones can't be posted as one round carousel." }, 400),
    );
    render(settings());
    fireEvent.click(within(table()).getByRole("switch", { name: "Ladders: draft automatically" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    const sent = (bodies[0] as { postingPlan: PostingPlan }).postingPlan;
    expect(sent.version).toBe(2);
    expect(Object.keys(sent.rows)).toEqual([...POSTING_ROWS]);
    expect(sent.rows.ladders.enabled).toBe(true);
    expect(sent.bigMoments).toEqual({ juniorRunsBar: 100 });
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Milestones can't be posted as one round carousel.",
    );
  });

  it("first visit: the default table shows with styles to pick, and no 'keep my current settings'", () => {
    const bodies = stubPatch();
    render(settings({ saved: false }));
    expect(screen.getByText("Choose how your club posts")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Keep my current settings/ })).toBeNull();
    expect(table()).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /Round carousels \+ individual highlights/ }),
    );
    expect(screen.queryByText("Choose how your club posts")).toBeNull();
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toBeTruthy();
    expect(bodies).toHaveLength(0);
  });

  it("grade picker: A Grade only, and junior age groups on rows with junior data", () => {
    render(settings());
    fireEvent.change(within(table()).getByLabelText("Debuts: grades"), {
      target: { value: "aGradeOnly" },
    });
    expect(summaryOf("Debuts")).toBe("A Grade only · each on its own");
    tickGrade("Match result", "Under 14");
    expect(summaryOf("Match result")).toBe("all senior grades, plus Under 14 · each on its own");
  });

  it("offers 'All senior and junior grades' on rows with junior data and lists every junior group", () => {
    const bodies = stubPatch();
    render(settings());
    const results = within(table()).getByLabelText("Match result: grades") as HTMLSelectElement;
    expect(Array.from(results.options).map((o) => o.value)).toEqual([
      "allSenior",
      "allGrades",
      "aGradeOnly",
      "custom",
    ]);
    // Milestones have no junior data: no such choice.
    const milestones = within(table()).getByLabelText("Milestones: grades") as HTMLSelectElement;
    expect(Array.from(milestones.options).map((o) => o.value)).not.toContain("allGrades");

    fireEvent.change(results, { target: { value: "allGrades" } });
    expect(summaryOf("Match result")).toBe("all senior and junior grades · each on its own");
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    return waitFor(() => expect(bodies).toHaveLength(1)).then(() => {
      const sent = (bodies[0] as { postingPlan: PostingPlan }).postingPlan;
      expect(sent.rows.results).toMatchObject({
        others: "seniors",
        grades: { "Under 14": true, "Under 16": true },
      });
    });
  });

  it("milestones offer no junior grades", () => {
    render(settings());
    fireEvent.change(within(table()).getByLabelText("Milestones: grades"), {
      target: { value: "custom" },
    });
    const row = within(table())
      .getByText("Milestones", { selector: "p.font-medium" })
      .closest("tr")!;
    const under14 = within(row).getByLabelText("Under 14") as HTMLInputElement;
    expect(under14.disabled).toBe(true);
    expect(within(row).getByText(/aren.t available for this card/)).toBeTruthy();
  });

  it("a carousel row with a junior grade on offers combined or separate; off hides it", () => {
    render(settings({ plan: planFromStyle(findPostingStyle("round-carousels", true)!) }));
    expect(within(table()).queryByLabelText("Match result: juniors")).toBeNull();
    tickGrade("Match result", "Under 14");
    const juniors = within(table()).getByLabelText("Match result: juniors") as HTMLSelectElement;
    expect(juniors.value).toBe("separate");
    expect(Array.from(juniors.options).map((o) => o.value)).toEqual(["combined", "separate"]);
    fireEvent.change(juniors, { target: { value: "combined" } });
    expect(summaryOf("Match result")).toBe(
      "all senior grades, plus Under 14 · one round carousel, juniors in the same carousel",
    );
    fireEvent.click(within(table()).getByLabelText("Under 14"));
    expect(within(table()).queryByLabelText("Match result: juniors")).toBeNull();
  });

  it("the Big Moment junior runs bar offers 50 and 100, and saving sends the choice", async () => {
    const bodies = stubPatch();
    render(settings());
    expect(screen.queryByLabelText("Big Moment: junior runs bar")).toBeNull();
    tickGrade("Big Moment", "Under 16");
    const bar = screen.getByLabelText("Big Moment: junior runs bar") as HTMLSelectElement;
    expect(Array.from(bar.options).map((o) => o.value)).toEqual(["50", "100"]);
    fireEvent.change(bar, { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    const sent = (bodies[0] as { postingPlan: PostingPlan }).postingPlan;
    expect(sent.bigMoments.juniorRunsBar).toBe(50);
    expect(sent.rows.bigMoments.grades).toEqual({ "Under 16": true });
  });

  it("explains junior auto-publishing and links to the junior team settings", () => {
    render(settings());
    const link = screen.getByRole("link", { name: "Junior matches" });
    expect(link.getAttribute("href")).toBe("/admin/settings/junior-matches");
    expect(screen.getByText(/every team starts on/)).toBeTruthy();
  });

  it("phone layout: summary cards, one open at a time", () => {
    render(settings());
    const list = screen.getByRole("list", { name: "Posting Plan" });
    const [results, bigMoments] = within(list).getAllByRole("button", { expanded: false });
    fireEvent.click(results);
    expect(results.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(bigMoments);
    expect(results.getAttribute("aria-expanded")).toBe("false");
    expect(bigMoments.getAttribute("aria-expanded")).toBe("true");
  });

  it("disables the Save bar while saving", async () => {
    let finish: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
        (init?.method ?? "GET").toUpperCase() === "PATCH"
          ? new Promise<Response>((resolve) => (finish = resolve))
          : Promise.resolve(json({})),
      ),
    );
    render(settings());
    fireEvent.click(within(table()).getByRole("switch", { name: "Ladders: draft automatically" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    const saving = await screen.findByRole("button", { name: /saving/i });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    finish(json({}));
  });

  it("shows the error panel when settings fail to load, and Retry refetches", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/social-settings")) {
          calls++;
          return calls === 1 ? json({ error: "down" }, 500) : json({ settings: settings() });
        }
        return json([]);
      }),
    );
    renderAt(<AdminSocialPlan />, "/admin/social/plan");
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(calls).toBe(2);
  });
});
