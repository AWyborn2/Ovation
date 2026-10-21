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
  fitStatus: "pass",
  fitReport: null,
  coverage: { pages: ["card"], sizes: ["square"] },
  updatedAt: null,
  waitingDrafts: 0,
});

function setup(onChange: (p: PickedTemplate) => void) {
  installApiMock({
    "/club-templates/11": { ...copy(11, true, "Our milestone"), document: doc },
    "/club-templates/12": { ...copy(12, false, "Spare"), document: doc },
    "/club-templates": { templates: [copy(11, true, "Our milestone"), copy(12, false, "Spare")] },
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
          coverage: { pages: ["card"], sizes: ["square"] },
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
    return (
      <TemplatePicker
        kind="milestone"
        value={value}
        onChange={(p) => {
          setValue(p);
          onChange(p);
        }}
        input={{ kind: "milestone", playerName: "Sam" } as ShareCardInput}
        data={buildPackData({})}
      />
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
});
