/**
 * The AI designer's model provider (ADR-011 §8, T7.4–T7.6): the only module
 * that imports `@anthropic-ai/sdk`.
 *
 * The request is the one the structured-output spike measured
 * (docs/plans/2026-10-21-template-schema-spike.md): Claude Opus 5.5, streamed
 * to `finalMessage()`, adaptive thinking at effort `high`, no
 * `output_config.format` (no schema of the format compiles), and
 * `fallbacks: "default"` so a policy decline is retried on Anthropic's
 * recommended fallback model inside the same call.
 *
 * Tests swap the provider with `setTemplateAiProvider` (a stub), so nothing
 * ever calls the API in CI.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { env } from "../../config";

export const TEMPLATE_AI_MODEL = "claude-opus-5-5";
/** Room for thinking plus a four-page document (the spike's Match Day used 41–44k). */
export const TEMPLATE_AI_MAX_TOKENS = 64000;
const BETAS = ["server-side-fallback-2026-07-01"];

/** US$ per million tokens. Cache writes are the 1-hour TTL's (2× input). */
export const TEMPLATE_AI_PRICES = {
  [TEMPLATE_AI_MODEL]: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 8 },
} as const satisfies Record<string, Price>;
/** A fallback model is priced at the most any current fallback costs, so cost is never understated. */
const FALLBACK_PRICE: Price = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 10 };

type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };

/** Token counts for one call (or a sum of calls). */
export type TemplateAiUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Cost in millionths of a US dollar. */
  costMicros: number;
};

export const NO_USAGE: TemplateAiUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costMicros: 0,
};

export function addUsage(a: TemplateAiUsage, b: TemplateAiUsage): TemplateAiUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    costMicros: a.costMicros + b.costMicros,
  };
}

/** A system block of the prompt: text, optionally cached for an hour. */
export type TemplateAiSystemBlock = { text: string; cache?: boolean };

/** One turn of the conversation, in the SDK's content-block shapes. */
export type TemplateAiMessage = Anthropic.Beta.BetaMessageParam;

export type TemplateAiRequest = {
  system: TemplateAiSystemBlock[];
  messages: TemplateAiMessage[];
};

export type TemplateAiResponse = {
  /** The reply's text blocks, joined. */
  text: string;
  /** The reply's whole content, to append unchanged before a retry turn (thinking included). */
  content: Anthropic.Beta.BetaContentBlockParam[];
  stopReason: string | null;
  /** The model that answered (a fallback's, if one served the call). */
  model: string;
  fellBack: boolean;
  usage: TemplateAiUsage;
};

export interface TemplateAiProvider {
  generate(request: TemplateAiRequest): Promise<TemplateAiResponse>;
}

/** A failure talking to the provider (network, rate limit, 5xx, a bad request). */
export class TemplateAiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TemplateAiProviderError";
  }
}

type UsageLike = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

const priceOf = (model: string): Price =>
  (TEMPLATE_AI_PRICES as Record<string, Price>)[model] ?? FALLBACK_PRICE;

function tally(model: string, u: UsageLike): TemplateAiUsage {
  const p = priceOf(model);
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: read,
    cacheWriteTokens: write,
    costMicros: Math.round(
      u.input_tokens * p.input +
        u.output_tokens * p.output +
        read * p.cacheRead +
        write * p.cacheWrite,
    ),
  };
}

/**
 * A call's usage and cost, priced per iteration when a fallback model served
 * part of it (`usage.iterations`), else at Opus 5.5's prices. Tokens × US$ per
 * million tokens is exactly micro-dollars.
 */
export function usageOf(usage: Anthropic.Beta.BetaUsage): TemplateAiUsage {
  const iterations = usage.iterations ?? [];
  if (iterations.length === 0) return tally(TEMPLATE_AI_MODEL, usage);
  return iterations.reduce<TemplateAiUsage>((sum, it) => {
    if (it.type === "fallback_message") return addUsage(sum, tally(it.model, it));
    if (it.type === "message") return addUsage(sum, tally(TEMPLATE_AI_MODEL, it));
    return sum;
  }, NO_USAGE);
}

/** The request the designer sends, for a set of system blocks and turns. */
export function anthropicParams(request: TemplateAiRequest): BetaMessageStreamParams {
  return {
    model: TEMPLATE_AI_MODEL,
    max_tokens: TEMPLATE_AI_MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    betas: BETAS,
    fallbacks: "default",
    system: request.system.map((b) => ({
      type: "text" as const,
      text: b.text,
      ...(b.cache ? { cache_control: { type: "ephemeral" as const, ttl: "1h" as const } } : {}),
    })),
    messages: request.messages,
  };
}

/** The live provider: Claude through the official SDK. */
export function anthropicProvider(apiKey: string): TemplateAiProvider {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 20 * 60 * 1000 });
  return {
    async generate(request) {
      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await client.beta.messages.stream(anthropicParams(request)).finalMessage();
      } catch (err) {
        if (err instanceof Anthropic.APIError)
          throw new TemplateAiProviderError(err.message, err.status);
        throw new TemplateAiProviderError(err instanceof Error ? err.message : String(err));
      }
      const fellBack = (message.usage.iterations ?? []).some(
        (it) => it.type === "fallback_message",
      );
      return {
        text: message.content
          .filter((c): c is Anthropic.Beta.BetaTextBlock => c.type === "text")
          .map((c) => c.text)
          .join(""),
        content: message.content as Anthropic.Beta.BetaContentBlockParam[],
        stopReason: message.stop_reason,
        model: message.model,
        fellBack,
        usage: usageOf(message.usage),
      };
    },
  };
}

let override: TemplateAiProvider | null = null;

/** Test seam: a stub provider in place of Claude (`null` puts the live one back). */
export function setTemplateAiProvider(provider: TemplateAiProvider | null): void {
  override = provider;
}

/** The provider to call, or null when the designer isn't configured (no API key). */
export function templateAiProvider(): TemplateAiProvider | null {
  if (override) return override;
  const key = env.ANTHROPIC_API_KEY();
  return key ? anthropicProvider(key) : null;
}
