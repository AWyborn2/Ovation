/**
 * The AI designer's prompt (ADR-011 §8, T7.5).
 *
 * 1. A system block cached for an hour, the same for every kind: who the
 *    designer is, the format's rules (`templateFormatGuide()`, built from
 *    `format.ts` and `validate.ts`, so the model reads exactly the rules it's
 *    checked against) and two example templates from the bundles.
 * 2. A second cached block: the kind's pages and what each can show.
 * 3. The user turn, never cached: an uploaded reference image, the brief, and
 *    sample content for the kind (worst-case content, `worst-case.ts`).
 *
 * No club or player data is ever in it (T7.10): the sample content is
 * Ovation's invented worst case, and the only other inputs are the brief and
 * the admin's own upload.
 */
import { TEMPLATE_BUNDLES } from "@workspace/template-bundles";
import {
  kindPages,
  normaliseDocument,
  pageCatalogueGuide,
  primaryPage,
  templateFormatGuide,
  templateKindFor,
  worstCaseCard,
  type FitIssue,
} from "@workspace/scorecard/kind-templates";
import type { TemplateAiMessage, TemplateAiRequest } from "./provider";

/** A brief is at most this long. */
export const MAX_BRIEF = 2000;

/** The bundle templates the prompt shows as examples (by slug), in order. */
export const EXAMPLE_TEMPLATES = ["club-kit-classic/milestone", "broadcast-classic/ladder"];

const DESIGNER = `You design social media card templates for Ovation, a white-label cricket club platform. A club's posts (match day, results, milestones, ladders, team lists…) are rendered from your template with the club's own data, crest, photos and colours, at four sizes, and posted to Facebook and Instagram.

Design like a strong sports-brand designer: a clear hierarchy (the one thing the card is about is the biggest), generous margins, condensed or display type for headlines, real contrast, and the club's colour tokens for anything that should feel like the club. Every field can be long or missing: give names a text fit, stack blocks that can lose a line so they close up, and use showWhen for anything optional. Keep junior cards free of player photos.`;

/** An example bundle template as format v2, compact. */
function exampleDocument(slug: string): { slug: string; kind: string; json: string } | null {
  const [look, kind] = slug.split("/");
  const template = TEMPLATE_BUNDLES.find((b) => b.slug === look)?.templates.find(
    (t) => t.kind === kind,
  );
  if (!template || !kind) return null;
  const { sourceFormat: _source, ...doc } = normaliseDocument(template.file.document, kind);
  return { slug, kind, json: JSON.stringify(doc) };
}

/** The cached system block shared by every kind. */
export function designerSystemText(): string {
  const examples = EXAMPLE_TEMPLATES.map(exampleDocument)
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .map((e) => `## Example: ${e.slug} (a ${e.kind} template)\n${e.json}`)
    .join("\n\n");
  return `${DESIGNER}\n\n${templateFormatGuide()}\n\n# Examples from Ovation's library\nThese use the plain v1 subset of the format; your designs may use everything above.\n\n${examples}`;
}

/** Image addresses in sample content are only placeholders; the model needs to know an image is there, not its bytes. */
function withoutImages(value: unknown): unknown {
  if (typeof value === "string") return /^(data:|https?:\/\/)/.test(value) ? "(image)" : value;
  if (Array.isArray(value)) return value.map(withoutImages);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withoutImages(v)]));
  return value;
}

/** Ovation's invented worst-case content for the kind's primary page, or null when there is none. */
export function sampleContent(kind: string): Record<string, unknown> | null {
  try {
    const card = worstCaseCard(kind, {
      page: primaryPage(kind),
      contentKind: templateKindFor(kind),
      preset: "standard",
      photo: true,
      sponsors: "max",
      junior: false,
    });
    return withoutImages(card.input) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** A reference image the admin uploaded, already downscaled and stripped (`images.ts`). */
export type ReferenceImage = { mediaType: "image/png" | "image/jpeg"; data: string };

export type DesignInput = { kind: string; brief: string; image?: ReferenceImage | null };

const OUTPUT = `# Output
Return only the template as one JSON document in the format above: no prose, no code fences. Leave out optional fields you don't use.`;

/** The whole first request for a design. */
export function designRequest(input: DesignInput): TemplateAiRequest {
  const pages = kindPages(input.kind);
  const sample = sampleContent(input.kind);
  const text = [
    `Design a ${input.kind} template.`,
    input.brief.trim()
      ? `Brief: ${input.brief.trim().slice(0, MAX_BRIEF)}`
      : "There's no written brief.",
    input.image
      ? "The attached image is a reference for the look: follow its style, not its words."
      : "",
    `Design every page of the kind (${pages.join(", ")}) at all four sizes.`,
    sample
      ? `Sample content for the ${pages[0]} page, at its longest (for sizing only; bind fields with {{tokens}}, never type this text in):\n${JSON.stringify(sample)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const content: TemplateAiMessage["content"] = input.image
    ? [
        {
          type: "image",
          source: { type: "base64", media_type: input.image.mediaType, data: input.image.data },
        },
        { type: "text", text },
      ]
    : [{ type: "text", text }];
  return {
    system: [
      { text: designerSystemText(), cache: true },
      { text: `${pageCatalogueGuide(input.kind)}\n\n${OUTPUT}`, cache: true },
    ],
    messages: [{ role: "user", content }],
  };
}

/** The retry turn after a reply that didn't validate. */
export function retryTurn(errors: string[]): string {
  const shown = errors.slice(0, 40);
  const more = errors.length > shown.length ? `\n…and ${errors.length - shown.length} more.` : "";
  return `The template has these problems:\n${shown.map((e) => `- ${e}`).join("\n")}${more}\n\nReturn the whole corrected template.`;
}

/** The retry turn after the fit check found warnings. */
export function fitRetryTurn(issues: FitIssue[]): string {
  const shown = issues.slice(0, 30);
  const lines = shown.map(
    (i) =>
      `- ${i.page} page, ${i.size}${i.variant ? ` (${i.variant})` : ""}: ${i.reason}${i.layerId ? ` in layer ${i.layerId}` : ""}${i.detail ? ` (${i.detail})` : ""}`,
  );
  const more = issues.length > shown.length ? `\n…and ${issues.length - shown.length} more.` : "";
  return `The template is valid, but the fit check drew it with the longest names and every row, at every size and preset, and found:\n${lines.join("\n")}${more}\n\nFix these (smaller type, text fit, more room, or stacks that close up) and return the whole corrected template.`;
}

/** The JSON document in a reply: code fences stripped, first `{` to last `}`. */
export function parseReply(text: string): { value?: unknown; error?: string } {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) return { error: "The reply holds no JSON object." };
  try {
    return { value: JSON.parse(trimmed.slice(start, end + 1)) };
  } catch (err) {
    return { error: `The reply isn't valid JSON: ${(err as Error).message.slice(0, 120)}` };
  }
}
