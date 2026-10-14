import type { SelectionMember } from "@workspace/api-client-react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Use the public senior comparison in another tab, leaving the board mounted. */
export function SelectionCompareLink({
  junior,
  member,
}: {
  junior: boolean;
  member?: SelectionMember;
}) {
  const reason = junior
    ? "Player comparison currently supports senior statistics only."
    : member?.isPrivate
      ? "Comparison is unavailable for this private player."
      : member && !member.linkedPlayerId
        ? "No senior statistics profile is linked to this player yet."
        : null;
  const query = member?.linkedPlayerId ? `?a=${member.linkedPlayerId}` : "";
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <div className="space-y-1">
      {reason ? (
        <>
          <Button type="button" variant="outline" size="sm" disabled>
            Compare players
          </Button>
          <p className="max-w-72 text-xs text-muted-foreground">{reason}</p>
        </>
      ) : (
        <Button asChild variant="outline" size="sm">
          <a
            href={`${base}/compare${query}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Opens in a new tab. Your selection board stays open."
          >
            <ArrowLeftRight className="mr-2 h-4 w-4" aria-hidden />
            Compare players<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </Button>
      )}
    </div>
  );
}
