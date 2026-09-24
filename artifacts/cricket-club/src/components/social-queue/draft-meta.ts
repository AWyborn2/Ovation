import type { SocialDraft } from "@workspace/api-client-react";
import type { StatusTone } from "@/components/admin-ui";
import type { ShareCardInput } from "@/lib/share-card";

export type DraftStatus = "awaiting_review" | "ready" | "posted" | "dismissed";

export const STATUS_ORDER: DraftStatus[] = ["awaiting_review", "ready", "posted", "dismissed"];

export const STATUS_LABEL: Record<DraftStatus, string> = {
  awaiting_review: "Awaiting review",
  ready: "Ready",
  posted: "Posted",
  dismissed: "Dismissed",
};

export const STATUS_TONE: Record<DraftStatus, StatusTone> = {
  awaiting_review: "attention",
  ready: "info",
  posted: "success",
  dismissed: "neutral",
};

export const FAMILIES = ["results", "achievements", "roundup", "matchday"] as const;
export type Family = (typeof FAMILIES)[number];

export const FAMILY_LABEL: Record<Family, string> = {
  results: "Match results",
  achievements: "Achievements",
  roundup: "Round wrap & leaders",
  matchday: "Match day & team lists",
};

const ENGINE_LABEL: Record<string, string> = {
  matchSummary: "Results import",
  milestone: "Achievements",
  roundup: "Round wrap",
  recap: "Season recap",
  matchday: "Fixtures",
  teamlist: "Team list",
  ondemand: "Made by hand",
};

export function draftStatus(d: SocialDraft): DraftStatus {
  return (d.status as DraftStatus) ?? "awaiting_review";
}

export function draftInput(d: SocialDraft): ShareCardInput | null {
  return (d.cardInput as ShareCardInput | null) ?? null;
}

export function isJuniorDraft(d: SocialDraft): boolean {
  const input = draftInput(d) as { junior?: boolean } | null;
  return d.sourceMatchIsJunior || !!input?.junior;
}

/** The row title: the match-up for a result, otherwise the player or headline. */
export function draftHeading(d: SocialDraft): string {
  const input = draftInput(d);
  if (input?.kind === "matchSummary") return `${input.club.name} vs ${input.opposition.name}`;
  const loose = input as { playerName?: string; headline?: string; oppositionName?: string } | null;
  return (
    loose?.playerName ??
    loose?.headline ??
    (loose?.oppositionName ? `vs ${loose.oppositionName}` : null) ??
    d.engine
  );
}

/** The row's second line: result, tier, category or grade. */
export function draftSubline(d: SocialDraft): string {
  const input = draftInput(d);
  if (input?.kind === "matchSummary") return `${input.matchTitle} — ${input.result}`;
  const loose = input as {
    tierLabel?: string;
    category?: string;
    grade?: string;
    roundLabel?: string;
  } | null;
  return loose?.tierLabel ?? loose?.category ?? loose?.grade ?? loose?.roundLabel ?? d.appPath;
}

export function draftGrade(d: SocialDraft): string | null {
  const input = draftInput(d) as { grade?: unknown } | null;
  return typeof input?.grade === "string" ? input.grade : null;
}

/** Where the draft came from, e.g. "Results import · 2 hours ago". */
export function draftSource(d: SocialDraft, now: Date = new Date()): string {
  const from = ENGINE_LABEL[d.engine] ?? d.engine;
  const at = d.sourceImportedAt ?? d.createdAt;
  return `${from} · ${relativeTime(at, now)}`;
}

export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const ms = now.getTime() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
