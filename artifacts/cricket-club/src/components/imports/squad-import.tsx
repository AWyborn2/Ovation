import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useImportSquad,
  getListSquadMembersQueryKey,
  type SquadImportResult,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { plural } from "@/lib/plural";

/**
 * Admin → Imports → Squad: the PlayHQ participant export upload that fills the
 * availability squad register (moved here from Availability, admin menu
 * consolidation PR 1). The register itself stays on the Availability page.
 */

const SKIP_REASONS: Record<string, string> = {
  missing_profile_id: "No PlayHQ profile ID",
  missing_name: "No name",
  not_a_player: "Not registered as a player",
  inactive_status: "Registration not active",
  other_season: "Registered for a different season",
  other_organisation: "Registered with a different club",
  duplicate_profile: "Listed more than once in the file",
};

const skipReason = (reason: string) => SKIP_REASONS[reason] ?? reason;

/** The server's own message for a failed request, else the generic admin handling. */
function errorMessage(e: unknown): string | null {
  const status = (e as { status?: number } | null)?.status;
  const data = (e as { data?: unknown } | null)?.data;
  if (status !== 401 && data && typeof data === "object") {
    const msg = (data as { error?: unknown }).error;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return handleAdminMutationError(e);
}

export function ImportSummary({ result }: { result: SquadImportResult }) {
  const counts: [string, number][] = [
    ["Added", result.created],
    ["Updated", result.updated],
    ["Stood down", result.deactivated],
    ["Linked to a club player", result.linked],
    ["Skipped", result.skipped.length],
  ];
  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="import-summary">
      <p className="text-sm font-medium">
        Import finished{result.season ? ` for season ${result.season}` : ""}.
      </p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {counts.map(([label, n]) => (
          <div key={label} className="rounded-md bg-muted/40 p-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      {result.adopted > 0 && (
        <p className="text-sm" data-testid="import-adopted">
          Filled in {plural(result.adopted, "player")} already in the squad from this season&rsquo;s
          games instead of adding them twice.
        </p>
      )}
      {result.contactsKept > 0 && (
        <p className="text-sm" data-testid="import-contacts-kept">
          Kept the contact details {plural(result.contactsKept, "member")} changed from their own
          link. Check them in the register and clear the flag to take the file's details next time.
        </p>
      )}
      {result.skippedByReason.length > 0 && (
        <div>
          <p className="text-sm font-medium">Why rows were skipped</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {result.skippedByReason.map((r) => (
              <li key={r.reason}>
                {skipReason(r.reason)}: {r.count}
              </li>
            ))}
          </ul>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Show skipped rows</summary>
            <ul className="mt-1 space-y-0.5">
              {result.skipped.map((s) => (
                <li key={`${s.line}-${s.reason}`}>
                  Line {s.line}: {s.name || "(no name)"} — {skipReason(s.reason)}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}

export function SquadImportPanel() {
  const queryClient = useQueryClient();
  const importSquad = useImportSquad();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<SquadImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onImport = () => {
    if (!file) return;
    setError(null);
    setSummary(null);
    importSquad.mutate(
      { data: { file } },
      {
        onSuccess: (res) => {
          setSummary(res);
          setFile(null);
          if (fileRef.current) fileRef.current.value = "";
          void queryClient.invalidateQueries({ queryKey: getListSquadMembersQueryKey() });
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Squad</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="squad-file">Upload the PlayHQ participant export (CSV)</Label>
          <p className="text-xs text-muted-foreground">
            Only each person&rsquo;s name, date of birth, registration, grade and contact details
            are kept. Every other column in the file is discarded and never stored. Uploading again
            updates existing players rather than adding them twice.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="squad-file"
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="max-w-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button onClick={onImport} disabled={!file || importSquad.isPending}>
              {importSquad.isPending ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>
        {summary && <ImportSummary result={summary} />}
        {error && (
          <div
            role="alert"
            data-testid="squad-error"
            className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        <p className="text-sm">
          The squad register, contacts and active players are on{" "}
          <Link href="/admin/availability" className="font-semibold text-primary-text underline">
            Availability
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
