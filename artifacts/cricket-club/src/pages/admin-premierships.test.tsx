import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderAt } from "../test/render";
import { installApiMock } from "../test/mock-api";
import AdminPremierships from "./admin-premierships";

describe("Admin → Honours → Premierships: link the grand final (kiosk redesign C5)", () => {
  it("lists the season's matches, finals first, and links the one picked", async () => {
    installApiMock({
      "/link-match": {},
      "/premierships": [
        {
          id: 7,
          year: 2025,
          grade: "A Grade",
          competition: "A Grade",
          venue: null,
          matchDate: null,
          result: "Premiers",
          mom: null,
          notes: null,
          matchId: null,
          players: [],
        },
      ],
      "/matches": [
        {
          id: 501,
          grade: "A Grade",
          season: 2024,
          round: 9,
          abandoned: false,
          playerCount: 11,
          opponent: "Pinjarra",
          matchDate: "2025-01-11",
        },
        {
          id: 502,
          grade: "A Grade",
          season: 2024,
          stage: "Grand Final",
          abandoned: false,
          playerCount: 11,
          opponent: "Mandurah",
          matchDate: "2025-03-15",
        },
      ],
    });
    renderAt(<AdminPremierships />, "/admin/honours");
    fireEvent.click(await screen.findByText("2025"));

    const select = (await screen.findByTestId("select-gf-match")) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
    // The grand final leads the list.
    expect(select.options[1]!.textContent).toBe("Grand Final · A Grade · v Mandurah · 2025-03-15");

    fireEvent.change(select, { target: { value: "502" } });
    fireEvent.click(screen.getByTestId("button-link-gf"));
    const sent = () =>
      vi
        .mocked(fetch)
        .mock.calls.find(
          ([url, init]) => String(url).includes("/link-match") && init?.method === "POST",
        );
    await waitFor(() => expect(sent()).toBeTruthy());
    expect(String(sent()![0])).toContain("/premierships/7/link-match");
    expect(JSON.parse(String(sent()![1]!.body))).toEqual({ matchId: 502 });
  });
});
