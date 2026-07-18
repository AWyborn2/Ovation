import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/cricket-club";

export function SeasonNotes() {
  return (
    <div style={{ padding: 24 }}>
      <Collapsible defaultOpen className="w-[440px] space-y-2">
        <div className="flex items-center justify-between rounded-md border px-4 py-2">
          <span className="text-sm font-semibold">Season 2025/26 — import notes</span>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              Hide ▾
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="space-y-2">
          <div className="rounded-md border px-4 py-2 text-sm text-muted-foreground">
            Round 4 vs Mandurah was abandoned — no scorecard ingested.
          </div>
          <div className="rounded-md border px-4 py-2 text-sm text-muted-foreground">
            Two fill-in players detected in Round 7; excluded from season averages.
          </div>
          <div className="rounded-md border px-4 py-2 text-sm text-muted-foreground">
            Ladder synced from PlayHQ on 14 May.
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
