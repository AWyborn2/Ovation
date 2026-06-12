import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useBrand } from "@/lib/brand-context";
import { Trophy, Users, ClipboardList, Award, Baby, GitCompare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGetTourContent } from "@workspace/api-client-react";
import {
  hasSeenWelcome,
  markWelcomeSeen,
  launchFanTour,
  resolveWelcomeTitle,
  resolveWelcomeBody,
} from "@/lib/tour";

const CAN_DO: { icon: typeof Users; text: string }[] = [
  { icon: Users, text: "Browse every player and their career stats" },
  { icon: ClipboardList, text: "Read full scorecards for past matches" },
  { icon: Award, text: "Explore records, honour boards & premierships" },
  { icon: GitCompare, text: "Compare players side by side" },
  { icon: Baby, text: "Switch to the juniors side for their results" },
];

// Auto-opening first-visit welcome. Explains what the portal does (and its
// limits) and offers to start the fan walkthrough. Shows once per browser, but
// the tour can always be relaunched from the header Help control.
export function WelcomeGuide() {
  const brand = useBrand();
  const [open, setOpen] = useState(false);
  const [location, navigate] = useLocation();
  const tourContentQ = useGetTourContent();
  const content = tourContentQ.data;

  useEffect(() => {
    if (!hasSeenWelcome()) {
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    markWelcomeSeen();
    setOpen(false);
  };

  const startTour = () => {
    markWelcomeSeen();
    setOpen(false);
    // Let the dialog close before the spotlight overlay mounts.
    window.setTimeout(() => launchFanTour(navigate, location, content), 200);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : dismiss())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <Trophy className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">
              {brand.name}
            </span>
          </div>
          <DialogTitle className="text-2xl">{resolveWelcomeTitle(content)}</DialogTitle>
          <DialogDescription>{resolveWelcomeBody(content)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/80 mb-2">
              What you can do
            </h3>
            <ul className="space-y-2">
              {CAN_DO.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-2 text-sm">
                  <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground/80">Good to know:</strong> stats
            reflect what club admins have recorded after each round, so the very
            latest games may take a little while to appear. Some older seasons
            are still being backfilled and may be incomplete, and a few junior
            players are kept private and hidden.
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={dismiss} data-testid="welcome-dismiss">
            Maybe later
          </Button>
          <Button onClick={startTour} data-testid="welcome-start-tour">
            Take a quick tour
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
