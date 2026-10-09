/**
 * The shared field catalogue (lib/scorecard kind-templates/fields.ts) is
 * static data derived from the packs. This test re-derives it from the live
 * pack registry and fails when the two drift apart (plan U3, KTD4/KTD19).
 * If it fails after a deliberate pack change, regenerate the catalogue.
 */
import { describe, expect, it } from "vitest";
import { KIND_FIELDS, TEMPLATE_CARD_KINDS } from "@workspace/scorecard/kind-templates";
import { DEFAULT_PACK_ID, getPackManifest } from "@/lib/pack-templates/registry";
import { CARD_KINDS } from "@/lib/share-card/types";

function derive(kind: string) {
  const ref = getPackManifest(DEFAULT_PACK_ID);
  const clubKit = getPackManifest("club-kit-v1");
  let designs = ref.designs.filter((d) => d.kind === kind);
  let source = ref.packId;
  if (designs.length === 0) {
    designs = clubKit.designs.filter((d) => d.kind === kind);
    source = clubKit.packId;
  }
  const fields = new Map<string, { label: string; type: string }>();
  const repeats = new Map<
    string,
    { label: string; variants: string[]; fields: Map<string, string> }
  >();
  for (const d of designs) {
    for (const f of d.template.fields) if (!fields.has(f.key)) fields.set(f.key, f);
    for (const r of d.template.repeats ?? []) {
      const cur = repeats.get(r.key) ?? {
        label: fields.get(r.key)?.label ?? r.key,
        variants: [],
        fields: new Map<string, string>(),
      };
      for (const v of r.variants ?? []) if (!cur.variants.includes(v)) cur.variants.push(v);
      for (const f of r.fields) if (!cur.fields.has(f.key)) cur.fields.set(f.key, f.label);
      repeats.set(r.key, cur);
    }
  }
  return {
    source,
    fields: [...fields]
      .filter(([, f]) => f.type === "text")
      .map(([key, f]) => ({ key, label: f.label })),
    images: [...fields]
      .filter(([, f]) => f.type === "photo" || f.type === "logo")
      .map(([key, f]) => ({ key, label: f.label, type: f.type })),
    repeats: [...repeats].map(([key, r]) => ({
      key,
      label: r.label,
      variants: r.variants,
      fields: [...r.fields].map(([k, label]) => ({ key: k, label })),
    })),
  };
}

describe("kind field catalogue parity with the packs", () => {
  it("lists the same kinds as the renderer", () => {
    expect([...TEMPLATE_CARD_KINDS]).toEqual(CARD_KINDS);
  });

  for (const kind of CARD_KINDS) {
    it(`${kind} matches its reference design`, () => {
      expect(KIND_FIELDS[kind as keyof typeof KIND_FIELDS]).toEqual(derive(kind));
    });
  }
});
