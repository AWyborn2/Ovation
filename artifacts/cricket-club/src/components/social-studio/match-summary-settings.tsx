import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useUpdateSocialSettings, type SocialSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";

// ---------------------------------------------------------------------------
// Match summary carousels
// ---------------------------------------------------------------------------

/**
 * Which grades draft a result card, and whether results post on their own or
 * as a round carousel, now live on the Posting Plan tab (plan 2026-10-07-001
 * R2). What stays here is the hand-built carousel set autoseed.
 */
export function MatchSummarySettings({
  settings,
  onSaved,
}: {
  settings: SocialSettings;
  onSaved: () => void;
}) {
  const [autoseedEnabled, setAutoseedEnabled] = useState<boolean>(
    settings.autoseedCarousels === true,
  );
  const [error, setError] = useState<string | null>(null);

  const update = useUpdateSocialSettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        onSaved();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });

  useEffect(() => setAutoseedEnabled(settings.autoseedCarousels === true), [settings]);

  const save = () => {
    setError(null);
    update.mutate({ data: { autoseedCarousels: autoseedEnabled } });
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Match summary carousels</h2>
      <Card>
        <CardContent className="space-y-6 pt-6">
          <p className="text-sm text-muted-foreground">
            Which grades get a result card, and whether results post on their own or as one round
            carousel, are set on the{" "}
            <Link href="/admin/social/plan" className="underline underline-offset-2">
              Posting Plan
            </Link>
            .
          </p>

          {/* Auto-seed carousels toggle (dormant by default). Turns a round's
              APPROVED match-summary drafts into a carousel set. */}
          <div className="flex items-start justify-between gap-3 border rounded p-3">
            <div>
              <div className="font-medium">Auto-Seed Round Carousels</div>
              <div className="text-xs text-muted-foreground">
                When a round&rsquo;s match-summary drafts are approved, assemble them into one
                carousel set (re-running updates the same set)
              </div>
            </div>
            <Switch checked={autoseedEnabled} onCheckedChange={setAutoseedEnabled} />
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}

          <div className="flex justify-end">
            <Button onClick={save} disabled={update.isPending}>
              {update.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
