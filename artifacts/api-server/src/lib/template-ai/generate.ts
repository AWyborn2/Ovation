/**
 * The AI designer's loop (ADR-011 §8, T7.7): one design, from a brief and an
 * optional reference image to a template document.
 *
 * 1. The model returns a document (`prompt.ts`, `provider.ts`).
 * 2. `validate.ts` checks it, plus that every page of the kind is there. Any
 *    errors go back in an appended turn: the model's whole reply (its thinking
 *    included, as Opus 5.5 requires) and a user turn listing them.
 * 3. The fit check draws a valid document with worst-case content; its
 *    warnings go back the same way.
 * 4. At most two retries in all.
 *
 * Pure apart from the provider and the fit check, which are passed in, so
 * the loop is tested without Claude, Chromium or a database (`jobs.ts` saves
 * the result).
 */
import {
  kindPages,
  templateDocumentErrors,
  type TemplateDocumentV2,
  type TemplateFitReport,
} from "@workspace/scorecard/kind-templates";
import {
  addUsage,
  NO_USAGE,
  TEMPLATE_AI_MODEL,
  type TemplateAiMessage,
  type TemplateAiProvider,
  type TemplateAiUsage,
} from "./provider";
import { designRequest, fitRetryTurn, parseReply, retryTurn, type DesignInput } from "./prompt";

/** Retries after the first reply, for validation errors and fit warnings together. */
export const MAX_RETRIES = 2;

export type FitCheckFn = (document: unknown, kind: string) => Promise<TemplateFitReport>;

export type DesignDeps = {
  provider: TemplateAiProvider;
  /** The fit check; null where no render harness runs (validation alone then). */
  fit: FitCheckFn | null;
};

/**
 * - `pass`: valid, and fits (or no fit check could run).
 * - `warnings`: valid, but the fit check still found something after the retries.
 * - `invalid`: no reply validated.
 * - `refused`: the model declined (after the server-side fallback).
 */
export type DesignOutcome = "pass" | "warnings" | "invalid" | "refused";

export type DesignResult = {
  outcome: DesignOutcome;
  /** The last valid document, saved even with warnings; null when none validated. */
  document: TemplateDocumentV2 | null;
  /** The last reply's validation errors, when no reply validated. */
  errors: string[];
  fitReport: TemplateFitReport | null;
  attempts: number;
  /** Whether the first reply was valid and fitted; null when no fit check ran. */
  firstTryFit: boolean | null;
  usage: TemplateAiUsage;
  /** The model that served the last call. */
  model: string;
};

/** Every problem with a reply's document for `kind`: the validator's, and any page it left out. */
export function designErrors(document: unknown, kind: string): string[] {
  const errors = templateDocumentErrors(document, kind);
  const doc = document as Partial<TemplateDocumentV2> | null;
  if (!doc || typeof doc !== "object" || doc.formatVersion !== 2)
    return errors.length ? errors : ["The template must be format v2 (formatVersion: 2, pages)."];
  for (const page of kindPages(kind)) {
    const layers = doc.pages?.[page]?.layers;
    if (!Array.isArray(layers) || layers.length === 0)
      errors.push(`The ${page} page is missing; design every page of the kind.`);
  }
  return errors;
}

export async function designTemplate(input: DesignInput, deps: DesignDeps): Promise<DesignResult> {
  const request = designRequest(input);
  const messages: TemplateAiMessage[] = [...request.messages];
  let usage = NO_USAGE;
  let model = TEMPLATE_AI_MODEL;
  let lastValid: TemplateDocumentV2 | null = null;
  let lastReport: TemplateFitReport | null = null;
  let lastErrors: string[] = [];
  let firstTryFit: boolean | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const reply = await deps.provider.generate({ system: request.system, messages });
    usage = addUsage(usage, reply.usage);
    model = reply.model;
    const done = (outcome: DesignOutcome): DesignResult => ({
      outcome,
      document: lastValid,
      errors: outcome === "invalid" ? lastErrors : [],
      fitReport: lastReport,
      attempts: attempt,
      firstTryFit,
      usage,
      model,
    });
    if (reply.stopReason === "refusal") {
      if (attempt === 1) firstTryFit = false;
      return done("refused");
    }
    const parsed = parseReply(reply.text);
    const errors = parsed.error ? [parsed.error] : designErrors(parsed.value, input.kind);
    if (reply.stopReason === "max_tokens")
      errors.unshift("The reply was cut off before it finished; keep the template smaller.");
    const retry = (turn: string) => {
      messages.push({ role: "assistant", content: reply.content });
      messages.push({ role: "user", content: [{ type: "text", text: turn }] });
    };

    if (errors.length) {
      lastErrors = errors;
      if (attempt === 1) firstTryFit = false;
      if (attempt <= MAX_RETRIES) {
        retry(retryTurn(errors));
        continue;
      }
      return done(lastValid ? "warnings" : "invalid");
    }

    lastValid = parsed.value as TemplateDocumentV2;
    lastErrors = [];
    lastReport = deps.fit ? await deps.fit(lastValid, input.kind) : null;
    const fits = !lastReport || lastReport.status === "pass";
    if (attempt === 1) firstTryFit = lastReport ? fits : null;
    if (fits) return done("pass");
    if (attempt <= MAX_RETRIES) {
      retry(fitRetryTurn(lastReport!.issues));
      continue;
    }
    return done("warnings");
  }
  // Unreachable: the last attempt always returns.
  throw new Error("designTemplate ran out of attempts");
}
