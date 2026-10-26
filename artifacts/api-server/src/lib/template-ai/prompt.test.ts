/**
 * The AI designer's prompt (T7.5) and the required "no club data reaches the
 * provider" test (T7.10): the outbound request holds only Ovation's own
 * guidance and examples, invented sample content, the brief and the admin's
 * upload. Nothing reads a tenant, a player or a library photo to build it.
 */
import { describe, expect, it } from "vitest";
import { TEMPLATE_CARD_KINDS, WORST } from "@workspace/scorecard/kind-templates";
import { anthropicParams, usageOf } from "./provider";
import {
  designRequest,
  designerSystemText,
  EXAMPLE_TEMPLATES,
  fitRetryTurn,
  parseReply,
  sampleContent,
} from "./prompt";

const image = { mediaType: "image/png" as const, data: "iVBORw0KGgo=" };

describe("designRequest", () => {
  it("caches the guide and the kind's catalogue, and leaves the brief and image uncached", () => {
    const req = designRequest({ kind: "matchDay", brief: "Night-game energy", image });
    expect(req.system.map((b) => b.cache)).toEqual([true, true]);
    expect(req.system[0]!.text).toContain("# The template format (v2)");
    expect(req.system[1]!.text).toContain("## Page sponsors");
    const params = anthropicParams(req);
    expect(params.system).toEqual([
      expect.objectContaining({ cache_control: { type: "ephemeral", ttl: "1h" } }),
      expect.objectContaining({ cache_control: { type: "ephemeral", ttl: "1h" } }),
    ]);
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
    });
    expect(params.output_config).not.toHaveProperty("format");
    const turn = req.messages[0]!;
    expect(turn.role).toBe("user");
    expect(turn.content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: image.data } },
      expect.objectContaining({ type: "text" }),
    ]);
  });

  it("keeps the shared block the same for every kind, so one cache serves them all", () => {
    const a = designRequest({ kind: "milestone", brief: "x" }).system[0]!.text;
    const b = designRequest({ kind: "ladder", brief: "y" }).system[0]!.text;
    expect(a).toBe(b);
    for (const slug of EXAMPLE_TEMPLATES)
      expect(designerSystemText()).toContain(`Example: ${slug}`);
  });

  it.each(TEMPLATE_CARD_KINDS)("sends no club data for %s (T7.10)", (kind) => {
    const brief = "A bold design";
    const request = designRequest({ kind, brief, image });
    const json = JSON.stringify(anthropicParams(request));
    // Only invented content (Ovation's worst case), never a tenant's club or players.
    for (const real of ["Halls Head", "HHCC", "Sample Cricket Club"])
      expect(json).not.toContain(real);
    const sample = sampleContent(kind);
    const text = JSON.stringify(request.messages[0]!.content);
    if (sample) expect(text).toContain(JSON.stringify(JSON.stringify(sample)).slice(1, -1));
    // No image bytes or addresses ride in the text: placeholders are named, not sent.
    expect(text).not.toMatch(/data:image|https?:\/\//);
    // The only image is the admin's upload; no library photo address of any kind.
    expect(json.match(/"type":"image"/g)).toHaveLength(1);
    expect(json).not.toMatch(/library\/|photo-library|\/objects\//);
  });

  it("samples with Ovation's invented worst case", () => {
    const sample = sampleContent("milestone")!;
    expect(sample.playerName).toBe(WORST.player);
    expect(sample.photoUrl).toBe("(image)");
  });
});

describe("replies and retries", () => {
  it("reads a JSON document out of a fenced or chatty reply", () => {
    expect(parseReply('```json\n{"a":1}\n```').value).toEqual({ a: 1 });
    expect(parseReply('Here it is: {"a":1} — enjoy').value).toEqual({ a: 1 });
    expect(parseReply("nothing here").error).toMatch(/no JSON object/);
    expect(parseReply("{oops}").error).toMatch(/isn't valid JSON/);
  });

  it("names the page, size and layer of each fit warning", () => {
    const turn = fitRetryTurn([
      {
        variant: "card.story.full",
        page: "card",
        size: "story",
        reason: "overflow",
        layerId: "name",
      },
    ]);
    expect(turn).toContain("card page, story (card.story.full): overflow in layer name");
  });
});

describe("usageOf", () => {
  it("prices Opus 5.5 at $4/$20, cache reads at $0.20 and 1-hour writes at $8 per million", () => {
    expect(
      usageOf({
        input_tokens: 1_000,
        output_tokens: 10_000,
        cache_read_input_tokens: 5_000,
        cache_creation_input_tokens: 2_000,
      } as never).costMicros,
    ).toBe(1_000 * 4 + 10_000 * 20 + 5_000 * 0.2 + 2_000 * 8);
  });

  it("prices a fallback's iteration at a fallback's price, never less", () => {
    const u = usageOf({
      input_tokens: 0,
      output_tokens: 0,
      iterations: [
        {
          type: "message",
          input_tokens: 100,
          output_tokens: 100,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        {
          type: "fallback_message",
          model: "claude-opus-4-8",
          input_tokens: 100,
          output_tokens: 100,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      ],
    } as never);
    expect(u.costMicros).toBe(100 * 4 + 100 * 20 + 100 * 5 + 100 * 25);
  });
});
