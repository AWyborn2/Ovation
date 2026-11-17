/**
 * A blank design (Create → Blank design) opens on a white page with no fields, so the
 * editor doesn't warn that its key field ("Small line above") is missing. A draft made
 * from a template still gets the note when its key field goes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { TemplateEditorV2, type EditorTemplate } from "@/pages/admin-template-editor";
import { isBlankDesignDraft } from "@/pages/admin-draft-design-editor";
import { blankDesign } from "@/components/studio-home/create-picker";
import { previewSample } from "@/lib/kind-templates/samples";
import { buildPackData } from "@/lib/pack-card-data";
import { BLANK_PACK_ID } from "@/lib/pack-render";
import { renderAt } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function openDraft(blank: boolean) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const payload = /social-settings/.test(url)
        ? { settings: {}, captionTemplates: [], activeSponsors: [] }
        : [];
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  const template: EditorTemplate = {
    id: 5,
    kind: "announcement",
    name: "Blank design",
    version: 1,
    document: blankDesign("announcement"),
    fitStatus: "pass",
  };
  renderAt(
    <TemplateEditorV2
      template={template}
      viewport={{ w: 1440, h: 900 }}
      host={{
        club: true,
        backHref: "/admin/social",
        save: async () => template,
        reload: async () => template,
        status: () => null,
      }}
      draftMode={{
        input: previewSample("announcement", "Test CC") as unknown as Record<string, unknown>,
        data: buildPackData(),
        blank,
      }}
    />,
    "/admin/social/editor/5",
  );
}

describe("a blank design in the editor", () => {
  it("opens without a missing-field warning", async () => {
    openDraft(true);
    await screen.findByRole("button", { name: "Save" });
    expect(screen.queryByText(/no longer shows small line above/i)).toBeNull();
  });

  it("still notes a missing key field on a draft that isn't blank", async () => {
    openDraft(false);
    expect(await screen.findByText(/no longer shows small line above/i)).toBeTruthy();
  });

  it("is told apart from a design made from a template", () => {
    expect(
      isBlankDesignDraft({ packId: BLANK_PACK_ID, templateRef: null, templateVersion: null }),
    ).toBe(true);
    expect(
      isBlankDesignDraft({
        packId: BLANK_PACK_ID,
        templateRef: { libraryTemplateId: 3, version: 2 } as never,
        templateVersion: 2,
      }),
    ).toBe(false);
    expect(
      isBlankDesignDraft({ packId: "club-kit-v1", templateRef: null, templateVersion: null }),
    ).toBe(false);
  });
});
