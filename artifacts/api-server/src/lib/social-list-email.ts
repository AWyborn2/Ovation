import { createHash } from "node:crypto";
import type { EmailListSettings } from "@workspace/db";

/** Pure parts of the social list emails (email-distribution-lists PR2). */

export type SocialEmailKind = "asset_ready" | "review_needed" | "milestone";

/** The settings toggle that switches each social email on. */
export const SOCIAL_TOGGLE = {
  asset_ready: "assetReady",
  review_needed: "reviewNeeded",
  milestone: "milestone",
} as const satisfies Record<SocialEmailKind, keyof EmailListSettings>;

export const socialToggleOn = (
  settings: EmailListSettings | null | undefined,
  kind: SocialEmailKind,
): boolean => settings?.[SOCIAL_TOGGLE[kind]] === true;

/** One send per draft per list: a re-approve of a ready card queues nothing. */
export const assetReadyKey = (draftId: number, listId: number): string =>
  `sa:${draftId}:asset_ready:l${listId}`;

/** A sweep batch: the same drafts never make a second batch for the list. */
export function digestKey(kind: SocialEmailKind, listId: number, draftIds: number[]): string {
  const ids = [...draftIds].sort((a, b) => a - b).join(",");
  const hash = createHash("sha1").update(ids).digest("hex").slice(0, 16);
  return `sb:${kind}:l${listId}:${hash}`;
}

/** Milestone emails cover the milestone engine and the achievements family. */
export const isMilestoneDraft = (d: { engine: string; family: string | null }): boolean =>
  d.engine === "milestone" || d.family === "achievements";

/** A draft's one-line label: the caption's first line, else its card kind. */
export function draftLabel(d: { id: number; caption: string | null; cardInput: unknown }): string {
  const first = (d.caption ?? "").split("\n")[0]?.trim() ?? "";
  if (first) return first.length > 90 ? `${first.slice(0, 87)}...` : first;
  const kind = (d.cardInput as { kind?: unknown } | null)?.kind;
  return typeof kind === "string" ? `${kind} card #${d.id}` : `Card #${d.id}`;
}

export const queueLink = (origin: string | null, draftIds: number[]): string =>
  `${origin ?? ""}/admin/social/queue?ids=${draftIds.join(",")}`;

/** Subject and body for one card ready to post. */
export function assetReadyEmail(input: {
  clubName: string;
  draft: { id: number; caption: string | null; cardInput: unknown };
  link: string;
  attached: boolean;
}): { subject: string; text: string } {
  const label = draftLabel(input.draft);
  const caption = (input.draft.caption ?? "").trim();
  return {
    subject: `${input.clubName} card ready to post: ${label}`,
    text: [
      input.attached
        ? "This card is ready to post. The image is attached."
        : "This card is ready to post. Open the queue to download the image:",
      ...(input.attached ? [] : [input.link]),
      ...(caption ? ["", "Caption:", caption] : []),
      ...(input.attached ? ["", `Queue: ${input.link}`] : []),
    ].join("\n"),
  };
}

/** Subject and body for a sweep batch (review needed, or milestones). */
export function digestEmail(input: {
  kind: "review_needed" | "milestone";
  clubName: string;
  drafts: { id: number; caption: string | null; cardInput: unknown }[];
  link: string;
}): { subject: string; text: string } {
  const n = input.drafts.length;
  const cards = n === 1 ? "1 card" : `${n} cards`;
  const subject =
    input.kind === "review_needed"
      ? `${input.clubName}: ${cards} to review`
      : `${input.clubName}: ${n === 1 ? "1 new milestone card" : `${n} new milestone cards`}`;
  const intro =
    input.kind === "review_needed"
      ? `${cards} ${n === 1 ? "is" : "are"} waiting for review:`
      : `New milestone and achievement ${n === 1 ? "card" : "cards"}:`;
  return {
    subject,
    text: [intro, "", ...input.drafts.map((d) => `- ${draftLabel(d)}`), "", input.link].join("\n"),
  };
}
