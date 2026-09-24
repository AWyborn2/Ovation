/**
 * Social Studio U22 — settings pages on form cards with the sticky save bar:
 * editing shows the bar, saving persists and hides it, Reset restores the
 * loaded values, and leaving with unsaved changes asks first.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, render } from "@testing-library/react";
import AdminRecordsDisplay from "@/pages/admin-records-display";
import AdminMilestoneBoard from "@/pages/admin-milestone-board";
import { SaveBar } from "@/components/admin-ui";
import { renderAt } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Req = { method: string; url: string; body: unknown };

/** A settings endpoint whose PATCH persists, so the refetch returns the saved values. */
function stubSettings(path: RegExp, initial: Record<string, unknown>) {
  let current = { ...initial };
  const requests: Req[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ method, url, body });
      let payload: unknown = [];
      if (path.test(url)) {
        if (method === "PATCH") current = { ...current, ...(body as object) };
        payload = current;
      } else if (/\/api\/grades/.test(url)) {
        payload = [{ grade: "A Grade" }, { grade: "B Grade" }];
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

const RECORDS = {
  defaultTab: "total",
  byGradeDefaultGrade: "",
  partnershipsDefaultGrade: "",
  centuriesSort: "season-desc",
  fiveForSort: "season-desc",
};

const saveBar = () => screen.queryByRole("region", { name: "Unsaved changes" });

describe("Records page display settings", () => {
  it("shows the save bar on edit, and saving persists then hides it", async () => {
    const requests = stubSettings(/\/api\/records-display-settings/, RECORDS);
    renderAt(<AdminRecordsDisplay />, "/admin/settings/records");
    const select = await screen.findByTestId("select-by-grade-default");
    await screen.findAllByRole("option", { name: "B Grade" });
    expect(saveBar()).toBeNull();

    fireEvent.change(select, { target: { value: "B Grade" } });
    expect(saveBar()).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      const patch = requests.find((r) => r.method === "PATCH");
      expect(patch?.body).toMatchObject({ byGradeDefaultGrade: "B Grade" });
    });
    await waitFor(() => expect(saveBar()).toBeNull());
    expect((screen.getByTestId("select-by-grade-default") as HTMLSelectElement).value).toBe(
      "B Grade",
    );
  });

  it("Reset restores the loaded values and hides the bar", async () => {
    stubSettings(/\/api\/records-display-settings/, RECORDS);
    renderAt(<AdminRecordsDisplay />, "/admin/settings/records");
    await screen.findAllByRole("option", { name: "B Grade" });
    fireEvent.click(screen.getByRole("radio", { name: "Centuries" }));
    fireEvent.change(screen.getByTestId("select-centuries-dir"), { target: { value: "asc" } });
    expect(saveBar()).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(saveBar()).toBeNull();
    expect(
      (screen.getByRole("radio", { name: "Total Club Records" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect((screen.getByTestId("select-centuries-dir") as HTMLSelectElement).value).toBe("desc");
  });

  it("a validation error shows in the save bar and nothing is sent", async () => {
    const requests = stubSettings(/\/api\/milestone-board-settings/, {
      displayMode: "recent",
      gamesThreshold: 100,
      runsThreshold: 1000,
      wicketsThreshold: 100,
      recencyWeeks: 4,
      gamesTiers: [100, 150],
      runsTiers: [1000, 2500],
      wicketsTiers: [100, 150],
    });
    renderAt(<AdminMilestoneBoard />, "/admin/settings/milestone-board");
    fireEvent.change(await screen.findByLabelText("Games tiers"), {
      target: { value: "150, 100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const bar = saveBar()!;
    expect(bar.textContent).toMatch(/ascending whole numbers/);
    expect(requests.some((r) => r.method === "PATCH")).toBe(false);
  });
});

describe("Leaving with unsaved changes", () => {
  const Harness = ({ dirty }: { dirty: boolean }) => (
    <div>
      <SaveBar dirty={dirty} onSave={() => {}} onReset={() => {}} />
      <a href="/elsewhere">Elsewhere</a>
    </div>
  );

  /** Click the link; report whether the guard blocked it (then stop jsdom navigating). */
  const clickLink = () => {
    // The guard cancels and stops the click, so a blocked click never reaches here.
    let blocked = true;
    const observe = (e: Event) => {
      blocked = e.defaultPrevented;
      e.preventDefault();
    };
    window.addEventListener("click", observe);
    screen
      .getByText("Elsewhere")
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    window.removeEventListener("click", observe);
    return blocked;
  };

  it("asks before following a link, and stays when declined", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Harness dirty />);
    expect(clickLink()).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("follows the link when confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Harness dirty />);
    expect(clickLink()).toBe(false);
  });

  it("does not ask when there is nothing unsaved", () => {
    const confirm = vi.spyOn(window, "confirm");
    render(<Harness dirty={false} />);
    expect(clickLink()).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks the browser before unloading", () => {
    render(<Harness dirty />);
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});
