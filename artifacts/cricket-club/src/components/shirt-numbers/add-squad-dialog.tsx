import type { ShirtNumberSquadAddResult } from "@workspace/api-client-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { seasonLabel } from "./season";
import type { ShirtNumberSide } from "./api";

/** "3 added, 2 already on the register." */
export function squadAddSummary(result: Pick<ShirtNumberSquadAddResult, "created" | "skipped">) {
  return `${result.created} added, ${result.skipped} already on the register.`;
}

/**
 * "Add squad to register" (R5): confirms the season, then shows what the add
 * did — created, already present (left as they are) and, for juniors, squad
 * members matching none of the club's junior players. The squad comes from
 * the club's squad register (the availability squad import), the one PlayHQ
 * import.
 */
export function AddSquadDialog({
  open,
  onOpenChange,
  side,
  season,
  pending = false,
  result,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: ShirtNumberSide;
  season: number;
  pending?: boolean;
  /** The finished add's outcome; null until it has run. */
  result: ShirtNumberSquadAddResult | null;
  onConfirm: () => void;
}) {
  const label = seasonLabel(season);
  const members = side === "junior" ? "junior squad" : "senior squad";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Add squad to the {label} register</AlertDialogTitle>
          <AlertDialogDescription asChild>
            {result ? (
              <div data-testid="squad-add-summary" className="space-y-2">
                <p className="font-semibold text-foreground">{squadAddSummary(result)}</p>
                {result.unmatched.length > 0 && (
                  <div>
                    <p className="m-0">
                      Not added — no matching junior player ({result.unmatched.length}):
                    </p>
                    <ul className="m-0 list-disc pl-5">
                      {result.unmatched.map((name, i) => (
                        <li key={`${name}-${i}`}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.warnings.map((w, i) => (
                  <p key={`${w.number}-${i}`} className="m-0">
                    Warning: {w.message}
                  </p>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <p>
                  Adds every active member of your club&rsquo;s {members} (from the squad import) to
                  the {label} register.
                </p>
                <p>
                  People already on the {label} register are left as they are. Returning players
                  keep last season&rsquo;s number when your club carries numbers forward; everyone
                  else is added without a number.
                </p>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {result ? (
            <AlertDialogAction onClick={() => onOpenChange(false)}>Close</AlertDialogAction>
          ) : (
            <>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault();
                  onConfirm();
                }}
              >
                {pending ? "Adding…" : "Add squad"}
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
