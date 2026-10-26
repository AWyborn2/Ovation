import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderAt } from "../test/render";
import { installApiMock } from "../test/mock-api";
import AdminHatTricks from "./admin-hat-tricks";

describe("Admin → Honours → Hat-tricks (kiosk redesign C2)", () => {
  it("lists the club's hat-tricks and adds one", async () => {
    installApiMock({
      "/hat-tricks": [
        {
          id: 1,
          bowler: "Sam Spinner",
          grade: "A Grade",
          season: "2019/20",
          figures: "5/23",
          opponent: "Mandurah",
        },
      ],
    });
    renderAt(<AdminHatTricks />, "/admin/honours/hat-tricks");
    expect(await screen.findByText("Sam Spinner")).toBeTruthy();

    fireEvent.click(screen.getByTestId("button-new-hat-trick"));
    fireEvent.change(await screen.findByTestId("input-ht-bowler"), {
      target: { value: "Pat Pace" },
    });
    fireEvent.change(screen.getByTestId("input-ht-grade"), { target: { value: "B Grade" } });
    fireEvent.change(screen.getByTestId("input-ht-season"), { target: { value: "2023/24" } });
    fireEvent.change(screen.getByTestId("input-ht-figures"), { target: { value: "6/30" } });
    fireEvent.click(screen.getByTestId("button-save-hat-trick"));

    const fetchMock = vi.mocked(fetch);
    const sent = () =>
      fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    await waitFor(() => expect(sent()).toBeTruthy());
    expect(JSON.parse(String((sent()![1] as RequestInit).body))).toEqual({
      bowler: "Pat Pace",
      grade: "B Grade",
      season: "2023/24",
      figures: "6/30",
      opponent: null,
      playerId: null,
    });
  });
});
