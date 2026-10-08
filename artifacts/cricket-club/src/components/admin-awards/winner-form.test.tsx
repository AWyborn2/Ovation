import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WinnerForm } from "./winner-form";
import { WinnerName } from "../awards-tab";

vi.mock("@/components/player-typeahead", () => ({
  PlayerTypeahead: ({
    onChange,
  }: {
    onChange: (p: { id: number; givenName: string; surname: string }) => void;
  }) => (
    <div>
      {[
        { id: 1, givenName: "Alice", surname: "One" },
        { id: 2, givenName: "Bob", surname: "Two" },
      ].map((p) => (
        <button type="button" key={p.id} onClick={() => onChange(p)}>
          Select {p.givenName}
        </button>
      ))}
    </div>
  ),
}));

const initial = { season: 2024, name: "", playerId: null, displayOrder: 0, published: true };
describe("shared winner editor", () => {
  it("adds multiple people, prevents duplicates and preserves a deliberately edited label", () => {
    const save = vi.fn();
    render(
      <WinnerForm
        initial={initial}
        pending={false}
        onSubmit={save}
        onCancel={() => {}}
        submitLabel="Save"
      />,
    );
    fireEvent.click(screen.getByText("Select Alice"));
    fireEvent.click(screen.getByText("Select Bob"));
    const input = screen.getByPlaceholderText("Type a name (auto-filled when a player is linked)");
    expect(input).toHaveValue("Alice One / Bob Two");
    fireEvent.change(input, { target: { value: "Joint winners, including our volunteer" } });
    fireEvent.click(screen.getByText("Select Alice"));
    expect(screen.getByRole("alert")).toHaveTextContent("already linked");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        playerIds: [1, 2],
        name: "Joint winners, including our volunteer",
      }),
    );
    fireEvent.click(screen.getByLabelText("Move Two earlier"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ playerIds: [2, 1] }));
    fireEvent.click(screen.getByLabelText("Remove link to One"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ playerIds: [2] }));
    fireEvent.click(screen.getByLabelText("Remove link to Two"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        playerIds: [],
        playerId: null,
        name: "Joint winners, including our volunteer",
      }),
    );
  });

  it("reopens ordered links and retains free-text/legacy display names when adding a player", () => {
    const save = vi.fn();
    render(
      <WinnerForm
        initial={{ ...initial, name: "Historical label", playerId: 1 }}
        knownName="Alice One"
        pending={false}
        onSubmit={save}
        onCancel={() => {}}
        submitLabel="Save"
      />,
    );
    expect(screen.getByText("Alice One")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Select Bob"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ playerIds: [1, 2], name: "Historical label" }),
    );
  });

  it("shows each public recipient as an independent profile link, retaining the full label", () => {
    render(
      <WinnerName
        winner={{
          id: 1,
          awardId: 1,
          season: 2024,
          displayOrder: 0,
          published: true,
          name: "Alice / Bob / Guest",
          playerId: 1,
          playerIds: [1, 2],
          recipients: [
            { playerId: 1, name: "Alice" },
            { playerId: 2, name: "Bob" },
          ],
        }}
      />,
    );
    expect(screen.getByText("Alice / Bob / Guest")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alice" })).toHaveAttribute("href", "/players/1");
    expect(screen.getByRole("link", { name: "Bob" })).toHaveAttribute("href", "/players/2");
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("does not revive a hidden link when the server supplies an empty recipient list", () => {
    render(
      <WinnerName
        winner={{
          id: 1,
          awardId: 1,
          season: 2024,
          displayOrder: 0,
          published: true,
          name: "Free text",
          playerId: null,
          playerIds: [],
          recipients: [],
        }}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
