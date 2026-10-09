import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PackCard } from "./pack-card";
import { sampleCardInput } from "@/lib/sample-card-inputs";

vi.mock("@/lib/card-fonts", () => ({ ensureCardFontsLoaded: () => Promise.resolve() }));
vi.mock("@/lib/pack-render/team-name-fit", () => ({
  prepareTeamNames: async (root: HTMLElement) => {
    root.querySelector("[data-xi-fit]")?.setAttribute("data-xi-ready", "true");
  },
}));

describe("fitted PackCard DOM", () => {
  it("survives responsive preview resizing without React replacing fitted markup", async () => {
    const props = { input: sampleCardInput("teamList"), size: "square" as const,
      junior: false, sponsorsOn: false, packId: "club-kit-v1" };
    const view = render(<PackCard {...props} width={480} />);
    await waitFor(() => expect(view.container.querySelector('[data-xi-ready="true"]')).not.toBeNull());
    const list = view.container.querySelector("[data-xi-fit]");
    view.rerender(<PackCard {...props} width={320} />);
    expect(view.container.querySelector("[data-xi-fit]")).toBe(list);
    expect(list?.getAttribute("data-xi-ready")).toBe("true");
    view.rerender(<PackCard {...props} width={320} size="story" />);
    await waitFor(() => expect(view.container.querySelector('[data-xi-ready="true"]')).not.toBeNull());
    expect(view.container.querySelector("[data-xi-fit]")).not.toBe(list);
  });
});
