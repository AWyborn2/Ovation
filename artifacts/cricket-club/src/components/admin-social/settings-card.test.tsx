import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { SocialSettings } from "@workspace/api-client-react";
import { renderAt } from "../../test/render";
import { installApiMock } from "../../test/mock-api";
import { SettingsCard } from "./settings-card";

/**
 * The output-size switches (portrait and story sizes plan, Stage 6): Portrait
 * and Story always; Square and Landscape only while the club has them on,
 * labelled as older sizes; never a club without a feed size.
 */

const settings = (over: Partial<SocialSettings> = {}) =>
  ({
    engineOnDemand: true,
    engineRecap: false,
    sizeSquare: false,
    sizePortrait: true,
    sizeStory: true,
    sizeLandscape: false,
    sponsorsEnabled: true,
    captionsEnabled: true,
    clubHashtag: "",
    clubUrl: "",
    ...over,
  }) as SocialSettings;

/** Records each settings write the card sends. */
function setup(s: SocialSettings) {
  installApiMock();
  const base = globalThis.fetch as unknown as (
    i: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  const writes: Array<{ method: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "GET") {
        writes.push({ method, body: JSON.parse(String(init?.body ?? "null")) });
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return base(input, init);
    }),
  );
  renderAt(<SettingsCard settings={s} onSaved={() => {}} />);
  return writes;
}

const OLDER = "Older size: kept for your existing cards";
const sw = (label: string) => screen.getByRole("switch", { name: label });

describe("SettingsCard output sizes", () => {
  it("shows only Portrait and Story once the older sizes are off", async () => {
    setup(settings());
    expect(await screen.findByRole("switch", { name: "Feed portrait" })).toBeTruthy();
    expect(sw("Story / TikTok")).toBeTruthy();
    // Round 9, D17: Story stays switchable, and says what it does.
    expect(
      screen.getByText(
        "Create offers Story while this is on. Automatic posts go to the feed only.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Feed square" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Landscape (links, X)" })).toBeNull();
    expect(screen.queryByText(OLDER)).toBeNull();
  });

  it("shows Square and Landscape while the club has them on, as older sizes", async () => {
    setup(settings({ sizeSquare: true, sizeLandscape: true }));
    await screen.findByRole("switch", { name: "Feed square" });
    for (const key of ["sizeSquare", "sizeLandscape"]) {
      expect(within(screen.getByTestId(`size-${key}`)).getByText(OLDER)).toBeTruthy();
    }
    for (const key of ["sizePortrait", "sizeStory"]) {
      expect(within(screen.getByTestId(`size-${key}`)).queryByText(OLDER)).toBeNull();
    }
    expect(screen.getAllByText(OLDER)).toHaveLength(2);
  });

  it("switching Square off with Portrait off switches Portrait on, and saves both", async () => {
    const writes = setup(settings({ sizeSquare: true, sizePortrait: false }));
    fireEvent.click(await screen.findByRole("switch", { name: "Feed square" }));
    expect(sw("Feed square")).toHaveAttribute("aria-checked", "false");
    expect(sw("Feed portrait")).toHaveAttribute("aria-checked", "true");
    // Portrait is now the feed size: it can't be switched off.
    expect(sw("Feed portrait")).toBeDisabled();
    expect(screen.getByText("Your feed size, so it stays on.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].body).toMatchObject({ sizeSquare: false, sizePortrait: true });
  });

  it("Portrait can be switched off while Square is still on", async () => {
    setup(settings({ sizeSquare: true, sizePortrait: true }));
    const portrait = await screen.findByRole("switch", { name: "Feed portrait" });
    expect(portrait).not.toBeDisabled();
    fireEvent.click(portrait);
    expect(sw("Feed portrait")).toHaveAttribute("aria-checked", "false");
  });
});
