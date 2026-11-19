/** The template picker for one post (ADR-011 T5.15). */
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { placeholderDocument } from "@workspace/scorecard/kind-templates";
import { renderAt } from "../../test/render";
import { installApiMock } from "../../test/mock-api";
import { buildPackData } from "@/lib/pack-card-data";
import type { ShareCardInput } from "@/lib/share-card";
import { TemplatePicker, type PickedTemplate } from "./template-picker";

const doc = placeholderDocument("milestone");
const copy = (id: number, isDefault: boolean, name: string) => ({
  id,
  kind: "milestone",
  name,
  version: 3,
  isDefault,
  basedOn: null,
  edited: false,
  updateAvailable: null,
  fitStatus: "pass",
  fitReport: null,
  coverage: { pages: ["card"], sizes: ["square"] },
  updatedAt: null,
  waitingDrafts: 0,
});

function setup(
  onChange: (p: PickedTemplate) => void,
  opts: {
    size?: "portrait" | "story";
    sizes?: Record<number, string[]>;
    onUnpick?: () => void;
  } = {},
) {
  const sized = (c: ReturnType<typeof copy>) =>
    opts.sizes?.[c.id] ? { ...c, coverage: { pages: ["card"], sizes: opts.sizes[c.id]! } } : c;
  installApiMock({
    "/club-templates/11": { ...sized(copy(11, true, "Our milestone")), document: doc },
    "/club-templates/12": { ...sized(copy(12, false, "Spare")), document: doc },
    "/club-templates": {
      templates: [sized(copy(11, true, "Our milestone")), sized(copy(12, false, "Spare"))],
    },
    "/template-library/preview-input": { kind: "milestone", source: "sample", input: null },
    "/template-library": {
      templates: [
        {
          id: 5,
          slug: "club-kit/milestone",
          kind: "milestone",
          name: "Club Kit milestone",
          origin: "bundle",
          authorName: "Ovation",
          look: { id: 1, slug: "club-kit", name: "Club Kit" },
          version: 2,
          coverage: { pages: ["card"], sizes: opts.sizes?.[5] ?? ["square"] },
          fitStatus: "pass",
          fitReport: null,
          listed: true,
          document: doc,
        },
      ],
      nextCursor: null,
    },
  });
  const Harness = () => {
    const [value, setValue] = useState<PickedTemplate | null>(null);
    const [size, setSize] = useState(opts.size);
    return (
      <>
        <button type="button" onClick={() => setSize("story")}>
          Make it a Story
        </button>
        <TemplatePicker
          kind="milestone"
          value={value}
          onChange={(p) => {
            setValue(p);
            onChange(p);
          }}
          input={{ kind: "milestone", playerName: "Sam" } as ShareCardInput}
          data={buildPackData({})}
          size={size}
          onUnpick={() => {
            setValue(null);
            opts.onUnpick?.();
          }}
        />
      </>
    );
  };
  renderAt(<Harness />);
}

describe("TemplatePicker", () => {
  it("preselects the kind's default, and picks a club or library template", async () => {
    const picks: PickedTemplate[] = [];
    setup((p) => picks.push(p));
    await waitFor(() => expect(picks[0]?.ref).toEqual({ copyId: 11, version: 3 }));
    expect(await screen.findByRole("radio", { name: "Our milestone (Default)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("radio", { name: "Club Kit milestone (Club Kit)" }));
    await waitFor(() =>
      expect(picks[picks.length - 1]!.ref).toEqual({ libraryTemplateId: 5, version: 2 }),
    );
    expect(screen.getByRole("radio", { name: "Club Kit milestone (Club Kit)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText(/Your default for this card doesn.t change/)).toBeInTheDocument();
  });

  it('round 9 B13: a look without the size being made shows "No Story size" and can\'t be picked', async () => {
    const picks: PickedTemplate[] = [];
    // The club's default (an OMG T20 look) has no Story; the spare and the library look do.
    setup((p) => picks.push(p), {
      size: "story",
      sizes: {
        11: ["square", "portrait", "landscape"],
        12: ["portrait", "story"],
        5: ["square", "portrait", "story", "landscape"],
      },
    });
    const t20 = await screen.findByRole("radio", { name: "Our milestone (No Story size)" });
    expect(t20).toBeDisabled();
    // The default isn't preselected when it lacks the size: never a silent pick.
    await screen.findByText(/Pick a design that comes in Story \(1080x1920\)\./);
    expect(picks).toEqual([]);
    fireEvent.click(t20);
    expect(picks).toEqual([]);
    const spare = screen.getByRole("radio", { name: "Spare" });
    expect(spare).toBeEnabled();
    await waitFor(() => expect(screen.getByRole("radio", { name: "Spare" })).toBeEnabled());
    fireEvent.click(screen.getByRole("radio", { name: "Club Kit milestone (Club Kit)" }));
    await waitFor(() =>
      expect(picks[picks.length - 1]!.ref).toEqual({ libraryTemplateId: 5, version: 2 }),
    );
  });

  it("round 9 B13: a pick that lacks the size now asked for is dropped, not swapped", async () => {
    const picks: PickedTemplate[] = [];
    let unpicked = 0;
    // The default comes in Portrait only; the set is switched to Story after it's picked.
    setup((p) => picks.push(p), {
      size: "portrait",
      sizes: { 11: ["portrait"], 12: ["portrait", "story"], 5: ["portrait"] },
      onUnpick: () => unpicked++,
    });
    await waitFor(() => expect(picks[0]?.ref).toEqual({ copyId: 11, version: 3 }));
    fireEvent.click(screen.getByRole("button", { name: "Make it a Story" }));
    await waitFor(() => expect(unpicked).toBe(1));
    expect(screen.getByRole("radio", { name: "Our milestone (No Story size)" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(
      screen.getByRole("radio", { name: "Club Kit milestone (No Story size)" }),
    ).toBeDisabled();
    // Nothing else was picked in its place.
    expect(picks).toHaveLength(1);
    expect(screen.getByText(/Pick a design that comes in Story/)).toBeInTheDocument();
  });
});
