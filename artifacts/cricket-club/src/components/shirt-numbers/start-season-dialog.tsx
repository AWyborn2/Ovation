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

/** The "Start season" button text, by rollover policy (R3, F4). */
export function startSeasonLabel(rolloverPolicy: "carry" | "blank", fromSeason: number): string {
  return rolloverPolicy === "carry"
    ? `Carry forward from ${seasonLabel(fromSeason)}`
    : "Start season blank";
}

/**
 * Confirms a season start (KTD6): names the source and target seasons and how
 * many entries it creates. Under `blank` nothing is copied.
 */
export function StartSeasonDialog({
  open,
  onOpenChange,
  fromSeason,
  toSeason,
  count,
  rolloverPolicy,
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromSeason: number;
  toSeason: number;
  /** Entries the start will create; null while still counting. */
  count: number | null;
  rolloverPolicy: "carry" | "blank";
  pending?: boolean;
  onConfirm: () => void;
}) {
  const from = seasonLabel(fromSeason);
  const to = seasonLabel(toSeason);
  const entries = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Start the {to} season</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {rolloverPolicy === "carry" ? (
                <>
                  <p>
                    Copies the {from} register into {to}. Returning players keep their {from}{" "}
                    number, which you can change for {to} without touching {from}.
                  </p>
                  <p className="font-semibold text-foreground">
                    {count === null
                      ? "Counting entries…"
                      : count === 0
                        ? `Everyone on the ${from} register is already on ${to}; nothing will be created.`
                        : `This creates ${entries(count)} in ${to}.`}
                  </p>
                  <p>People already on the {to} register are left as they are.</p>
                </>
              ) : (
                <p>
                  Your club starts each season blank, so {to} begins with no entries copied from{" "}
                  {from} (0 entries). Upload a sheet or add people to number them.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || count === null}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {pending ? "Starting…" : "Start season"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
