import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const create = vi.fn();
const activate = vi.fn();
const update = vi.fn(async () => ({}));
const hits = vi.hoisted(
  () =>
    [] as {
      playerId: number;
      displayName: string;
      lastSeason: string | null;
      alreadyLinkedTo: { memberId: number; name: string } | null;
    }[],
);
vi.mock("@workspace/api-client-react", () => ({
  getGetSelectionBoardQueryKey: () => ["board"],
  getListSelectionRosterQueryKey: () => ["roster"],
  getListSquadMembersQueryKey: () => ["squad"],
  getSearchSquadPlayersQueryKey: (p: unknown) => ["search", p],
  useListSelectionRoster: () => ({
    data: [{ id: 5, firstName: "Sam", lastName: "Poole", active: false }],
    isError: false,
  }),
  useSearchSquadPlayers: () => ({ data: hits, isFetching: false }),
  useActivateSquadMember: () => ({ mutate: activate, isPending: false }),
  useCreateSquadMember: () => ({ mutate: create, isPending: false }),
  useUpdateSquadMember: () => ({ mutateAsync: update, isPending: false }),
}));

import { AddActivePlayer } from "./add-active-player";
import { ConfirmProvider } from "@/components/confirm-dialog";

function setup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConfirmProvider>
        <AddActivePlayer />
      </ConfirmProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByTestId("button-add-active-player"));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  hits.length = 0;
});

describe("AddActivePlayer", () => {
  it("creates a new player and warns when no contact is given", () => {
    setup();
    expect(screen.getByTestId("add-player-nocontact")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Reid" } });
    fireEvent.click(screen.getByText("Add active player", { selector: "button[type=submit]" }));
    expect(create.mock.calls[0]![0]).toEqual({
      data: { firstName: "Ana", lastName: "Reid", section: "senior" },
    });
  });

  it("requires names", () => {
    setup();
    fireEvent.click(screen.getByText("Add active player", { selector: "button[type=submit]" }));
    expect(screen.getByTestId("add-player-error")).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("reactivates an inactive roster member", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Find a past or inactive player"), {
      target: { value: "sam" },
    });
    await waitFor(() => screen.getByText("Reactivate"));
    fireEvent.click(screen.getByText("Reactivate"));
    expect(activate.mock.calls[0]![0]).toEqual({ id: 5 });
  });

  it("adds a historical player with their existing club identity", async () => {
    hits.push({
      playerId: 101,
      displayName: "Alex History",
      lastSeason: "2023/24",
      alreadyLinkedTo: null,
    });
    setup();
    fireEvent.change(screen.getByLabelText("Find a past or inactive player"), {
      target: { value: "alex" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Use" }));
    fireEvent.click(screen.getByText("Add active player", { selector: "button[type=submit]" }));
    expect(create.mock.calls[0]![0]).toEqual({
      data: { firstName: "Alex", lastName: "History", section: "senior", linkedPlayerId: 101 },
    });
  });

  it("reactivates an already-linked historical player instead of creating another row", async () => {
    hits.push({
      playerId: 101,
      displayName: "S Poole",
      lastSeason: "2023/24",
      alreadyLinkedTo: { memberId: 5, name: "Sam Poole" },
    });
    setup();
    fireEvent.change(screen.getByLabelText("Find a past or inactive player"), {
      target: { value: "s poole" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Reactivate" }));
    await waitFor(() => expect(activate.mock.calls[0]![0]).toEqual({ id: 5 }));
    expect(create).not.toHaveBeenCalled();
  });

  it("a player record linked to a family member offers to unlink them and add the player", async () => {
    // Ben Dreckow's player record is linked to his son Noah (one PlayHQ account).
    hits.push({
      playerId: 202,
      displayName: "Ben Dreckow",
      lastSeason: "2025/26",
      alreadyLinkedTo: { memberId: 9, name: "Noah Dreckow" },
    });
    setup();
    fireEvent.change(screen.getByLabelText("Find a past or inactive player"), {
      target: { value: "dreck" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Reactivate" }));
    fireEvent.click(await screen.findByRole("button", { name: "Unlink and add Ben Dreckow" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ id: 9, data: { linkedPlayerId: null } }),
    );
    expect(activate).not.toHaveBeenCalled();
    expect(await screen.findByText(/Linked to club player Ben Dreckow/)).toBeTruthy();
  });
});
