/** The proofs sheet's v2 samples are valid documents that draw (L1-D, T1.24). */
import { describe, expect, it } from "vitest";
import { templateDocumentErrors, worstCaseCard } from "@workspace/scorecard/kind-templates";
import {
  BLANK_PACK_ID,
  brandDefaultTokens,
  renderPackCard,
  resolvePackTokens,
  type CardAdjustments,
} from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { V2_SAMPLES } from "./v2-samples";

const tokens = resolvePackTokens({ brand: brandDefaultTokens(null), theme: null, junior: false });

describe("format v2 samples", () => {
  it.each(V2_SAMPLES.map((s) => [s.id, s] as const))("%s passes the validator", (_id, sample) => {
    expect(templateDocumentErrors(sample.document, sample.kind)).toEqual([]);
  });

  it.each(V2_SAMPLES.map((s) => [s.id, s] as const))(
    "%s draws every layer it should",
    (_id, sample) => {
      const page = sample.kind === "matchDay" ? "fixture" : "card";
      const card = worstCaseCard(sample.kind, {
        page,
        contentKind: sample.kind,
        preset: "full",
        photo: true,
        junior: false,
      });
      const html = renderPackCard(
        card.input as unknown as ShareCardInput,
        "square",
        true,
        tokens,
        false,
        { photoUrl: "https://cdn.example.org/p.jpg" },
        BLANK_PACK_ID,
        sample.document as unknown as CardAdjustments,
        { animate: sample.animate },
      );
      const layers = sample.document.pages[page]!.layers.filter(
        (l) => !l.showWhen || l.showWhen.photo !== false,
      );
      for (const layer of layers) expect(html, layer.id).toContain(`data-layer-id="${layer.id}"`);
    },
  );
});
