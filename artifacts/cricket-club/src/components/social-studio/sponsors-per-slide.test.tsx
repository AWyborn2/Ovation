import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderAt } from "../../test/render";
import { installApiMock } from "../../test/mock-api";
import {
  SponsorsPerSlideControl,
  SponsorsPerSlideSetting,
  sponsorsSplitLabel,
} from "./sponsors-per-slide";

describe("sponsorsSplitLabel", () => {
  it("says how the sponsors share the slides", () => {
    expect(sponsorsSplitLabel(13, 12)).toBe("13 sponsors → 7 + 6 (2 slides)");
    expect(sponsorsSplitLabel(12, 8)).toBe("12 sponsors → 6 + 6 (2 slides)");
    expect(sponsorsSplitLabel(8, 12)).toBe("8 sponsors → 1 slide");
    expect(sponsorsSplitLabel(1, 12)).toBe("1 sponsor → 1 slide");
    expect(sponsorsSplitLabel(0, 12)).toBe("No sponsors to show");
  });
});

describe("SponsorsPerSlideControl", () => {
  const setup = (value: number, sponsorCount = 13) => {
    const onChange = vi.fn();
    renderAt(
      <SponsorsPerSlideControl
        id="s"
        value={value}
        onChange={onChange}
        sponsorCount={sponsorCount}
      />,
    );
    return onChange;
  };

  it("shows the split live, slide by slide", async () => {
    setup(12);
    expect(await screen.findByRole("status")).toHaveTextContent("13 sponsors → 7 + 6 (2 slides)");
    expect(screen.getByText("Slide 1: 7")).toBeTruthy();
    expect(screen.getByText("Slide 2: 6")).toBeTruthy();
  });

  it("steps within 3 to 16", async () => {
    const onChange = setup(16);
    expect(await screen.findByLabelText("More sponsors per slide")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Fewer sponsors per slide"));
    expect(onChange).toHaveBeenCalledWith(15);
  });

  it("keeps a typed value in range", async () => {
    const onChange = setup(12);
    const input = await screen.findByLabelText("Sponsors per slide");
    fireEvent.change(input, { target: { value: "40" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(16);
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(3);
  });
});

describe("SponsorsPerSlideSetting (the club's default)", () => {
  it("shows the saved default and saves a change to the club's settings", async () => {
    installApiMock();
    const base = globalThis.fetch as unknown as (
      i: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>;
    const writes: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? "GET").toUpperCase() === "PATCH") {
          writes.push(JSON.parse(String(init?.body ?? "null")));
          return new Response("{}", {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return base(input, init);
      }),
    );
    renderAt(<SponsorsPerSlideSetting saved={8} sponsorCount={12} />);
    expect(await screen.findByRole("status")).toHaveTextContent("12 sponsors → 6 + 6 (2 slides)");
    fireEvent.click(screen.getByLabelText("More sponsors per slide"));
    await waitFor(() => expect(writes).toEqual([{ sponsorsPerSlide: 9 }]));
  });
});
