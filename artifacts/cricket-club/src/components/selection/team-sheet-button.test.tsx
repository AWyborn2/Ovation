/**
 * The finalised side's "Print team sheet" panel: PlayHQ's details and the
 * remembered overs load first, then the PDF is made with the overs entered.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { renderAt } from "@/test/render";
import { TeamSheetButton } from "./team-sheet-button";

const download = vi.fn();
vi.mock("@/lib/share-card", () => ({ downloadBlob: (...a: unknown[]) => download(...a) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  download.mockReset();
});

const PREVIEW = {
  selectionId: 3,
  section: "senior",
  grade: "A Grade",
  format: "One Day",
  competition: "A Grade Wyllie Cup",
  overs: "50",
  bowlingRulesSource: "PCA Bylaw 5.9",
  missingBirthDates: 2,
};

function stubFetch(onPrint: (body: unknown) => Response) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      if (method === "POST") return onPrint(body);
      return new Response(JSON.stringify(PREVIEW), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return calls;
}

describe("TeamSheetButton", () => {
  it("shows PlayHQ's details and the rules, then downloads the PDF with the overs entered", async () => {
    const calls = stubFetch(
      () =>
        new Response(new Blob(["%PDF-1.7"], { type: "application/pdf" }), {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        }),
    );
    renderAt(<TeamSheetButton selectionId={3} label="A Grade" />);

    fireEvent.click(screen.getByRole("button", { name: /print team sheet/i }));
    expect(await screen.findByText("A Grade Wyllie Cup")).toBeTruthy();
    expect(screen.getByText("One Day")).toBeTruthy();
    expect(screen.getByText(/follow PCA Bylaw 5\.9/)).toBeTruthy();
    expect(screen.getByText(/2 players in the side have no date of birth/)).toBeTruthy();

    const overs = screen.getByLabelText(/overs per innings/i) as HTMLInputElement;
    await waitFor(() => expect(overs.value).toBe("50"));
    fireEvent.change(overs, { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(download.mock.calls[0][1]).toBe("team-sheet-a-grade.pdf");
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toContain("/api/selection/3/team-sheet");
    expect(post.body).toEqual({ overs: "45" });
  });

  it("shows the server's refusal and keeps the panel open", async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: "Finalise the side to print its team sheet." }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
    );
    renderAt(<TeamSheetButton selectionId={3} label="A Grade" />);
    fireEvent.click(screen.getByRole("button", { name: /print team sheet/i }));
    await screen.findByText("A Grade Wyllie Cup");
    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    expect(await screen.findByText("Finalise the side to print its team sheet.")).toBeTruthy();
    expect(download).not.toHaveBeenCalled();
  });
});
