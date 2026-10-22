/**
 * The AI designer's loop (T7.7) with a stub provider: retries on validation
 * errors and fit warnings, at most two, append-only, with usage summed.
 */
import { describe, expect, it } from "vitest";
import type { TemplateFitReport } from "@workspace/scorecard/kind-templates";
import { designErrors, designTemplate, MAX_RETRIES, type FitCheckFn } from "./generate";
import {
  NO_USAGE,
  type TemplateAiProvider,
  type TemplateAiRequest,
  type TemplateAiResponse,
} from "./provider";

const box = { x: 10, y: 10, w: 80, h: 20 };
const geometry = { square: box, portrait: box, story: box, landscape: box };
const VALID = {
  formatVersion: 2,
  pages: { card: { layers: [{ id: "name", kind: "text", content: "{{playerName}}", geometry }] } },
};
const INVALID = {
  formatVersion: 2,
  pages: { card: { layers: [{ id: "name", kind: "text", content: "{{secret}}", geometry }] } },
};

const reply = (text: string, over: Partial<TemplateAiResponse> = {}): TemplateAiResponse => ({
  text,
  content: [{ type: "text", text }],
  stopReason: "end_turn",
  model: "claude-opus-5-5",
  fellBack: false,
  usage: { ...NO_USAGE, inputTokens: 10, outputTokens: 100, costMicros: 2040 },
  ...over,
});

/** A provider that answers from a script and records every request. */
function stub(
  replies: TemplateAiResponse[],
): TemplateAiProvider & { requests: TemplateAiRequest[] } {
  const requests: TemplateAiRequest[] = [];
  return {
    requests,
    async generate(request) {
      requests.push(structuredClone(request));
      const next = replies.shift();
      if (!next) throw new Error("no more replies");
      return next;
    },
  };
}

const report = (status: "pass" | "fail"): TemplateFitReport => ({
  kind: "milestone",
  status,
  variants: 4,
  issues:
    status === "pass"
      ? []
      : [
          {
            variant: "card.square",
            page: "card",
            size: "square",
            reason: "overflow",
            layerId: "name",
          },
        ],
  renderer: "test",
  fonts: "test",
  checkedAt: "2026-10-22T00:00:00Z",
});
const fitSequence = (...statuses: Array<"pass" | "fail">): FitCheckFn => {
  const queue = [...statuses];
  return async () => report(queue.shift() ?? "pass");
};

const input = { kind: "milestone", brief: "A gold foil milestone card" };

describe("designTemplate", () => {
  it("returns a valid document that fits on the first try", async () => {
    const provider = stub([reply(JSON.stringify(VALID))]);
    const result = await designTemplate(input, { provider, fit: fitSequence("pass") });
    expect(result).toMatchObject({ outcome: "pass", attempts: 1, firstTryFit: true, errors: [] });
    expect(result.document).toEqual(VALID);
    expect(result.usage.costMicros).toBe(2040);
  });

  it("sends validation errors back, appending the whole reply, and records the miss", async () => {
    const first = reply("```json\n" + JSON.stringify(INVALID) + "\n```", {
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: JSON.stringify(INVALID) },
      ],
    });
    const provider = stub([first, reply(JSON.stringify(VALID))]);
    const result = await designTemplate(input, { provider, fit: fitSequence("pass") });
    expect(result).toMatchObject({ outcome: "pass", attempts: 2, firstTryFit: false });
    expect(result.usage.costMicros).toBe(4080);
    const second = provider.requests[1]!.messages;
    expect(second).toHaveLength(3);
    // Append-only: the first turn unchanged, the model's reply as it came (thinking included).
    expect(second[0]).toEqual(provider.requests[0]!.messages[0]);
    expect(second[1]).toEqual({ role: "assistant", content: first.content });
    expect(JSON.stringify(second[2])).toContain("{{secret}}");
  });

  it("sends fit warnings back, and keeps the last valid document when they persist", async () => {
    const provider = stub([1, 2, 3].map(() => reply(JSON.stringify(VALID))));
    const result = await designTemplate(input, {
      provider,
      fit: fitSequence("fail", "fail", "fail"),
    });
    expect(result).toMatchObject({
      outcome: "warnings",
      attempts: MAX_RETRIES + 1,
      firstTryFit: false,
    });
    expect(result.document).toEqual(VALID);
    expect(result.fitReport?.status).toBe("fail");
    expect(JSON.stringify(provider.requests[1]!.messages.at(-1))).toContain("fit check");
  });

  it("gives up as invalid after two retries", async () => {
    const provider = stub([1, 2, 3].map(() => reply("not json")));
    const result = await designTemplate(input, { provider, fit: null });
    expect(result).toMatchObject({
      outcome: "invalid",
      attempts: 3,
      document: null,
      firstTryFit: false,
    });
    expect(result.errors[0]).toMatch(/no JSON object/);
  });

  it("records a refusal and stops", async () => {
    const provider = stub([reply("", { stopReason: "refusal" })]);
    const result = await designTemplate(input, { provider, fit: null });
    expect(result).toMatchObject({ outcome: "refused", attempts: 1, document: null });
  });

  it("treats a cut-off reply as a failed attempt", async () => {
    const provider = stub([
      reply(JSON.stringify(VALID), { stopReason: "max_tokens" }),
      reply(JSON.stringify(VALID)),
    ]);
    const result = await designTemplate(input, { provider, fit: null });
    expect(result).toMatchObject({ outcome: "pass", attempts: 2, firstTryFit: false });
  });

  it("validates alone, with no first-try fit, where no fit check runs", async () => {
    const provider = stub([reply(JSON.stringify(VALID))]);
    const result = await designTemplate(input, { provider, fit: null });
    expect(result).toMatchObject({ outcome: "pass", firstTryFit: null, fitReport: null });
  });
});

describe("designErrors", () => {
  it("wants format v2 and every page of the kind", () => {
    expect(designErrors({ layers: [] }, "milestone")[0]).toMatch(/format v2/);
    const fixtureOnly = { formatVersion: 2, pages: { fixture: VALID.pages.card } };
    const errors = designErrors(fixtureOnly, "matchDay");
    expect(errors).toContain("The title page is missing; design every page of the kind.");
    expect(errors).toContain("The sponsors page is missing; design every page of the kind.");
  });
});
