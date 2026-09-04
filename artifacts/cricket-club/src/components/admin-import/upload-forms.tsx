import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SEASON_OPTIONS, type Mode } from "./resolution";

/** The three-way mode switch shown while no preview is open. */
export function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => onChange(m)}
      className={`px-4 py-1.5 text-sm rounded ${
        mode === m ? "bg-background shadow font-medium" : "text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex rounded-md border p-1 bg-muted/40">
      {tab("csv", "Whole-season CSV")}
      {tab("match", "Single match (.xlsx)")}
      {tab("batch", "Season batch (.xlsx/.zip)")}
    </div>
  );
}

type UploadFormProps = {
  onSubmit: (e: React.FormEvent) => void;
  uploading: boolean;
  error: string | null;
};

export function CsvUploadForm({
  onSubmit,
  onFile,
  season,
  setSeason,
  uploading,
  error,
}: UploadFormProps & {
  onFile: (f: File | null) => void;
  season: number;
  setSeason: (s: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload season CSV</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv">CSV file</Label>
            <Input
              id="csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="season">Season</Label>
            <select
              id="season"
              value={season}
              onChange={(e) => setSeason(parseInt(e.target.value, 10))}
              className="block w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {SEASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={uploading}>
            {uploading ? "Parsing…" : "Upload & Preview"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}

export function MatchUploadForm({
  onSubmit,
  onFile,
  uploading,
  error,
}: UploadFormProps & { onFile: (f: File | null) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload match scorecard</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="xlsx">Scorecard file (.xlsx)</Label>
            <Input
              id="xlsx"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              The grade, season and round are read from the scorecard header — you can confirm or
              correct the round in the preview before committing. Committing adds this match to the
              running season totals.
            </p>
          </div>
          <Button type="submit" disabled={uploading}>
            {uploading ? "Parsing…" : "Upload & Preview"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}

export function BatchUploadForm({
  onSubmit,
  onFiles,
  uploading,
  error,
}: UploadFormProps & { onFiles: (f: FileList | null) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload a season of scorecards</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="batch">Scorecards (.xlsx files and/or a .zip)</Label>
            <Input
              id="batch"
              type="file"
              multiple
              accept=".xlsx,.zip,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => onFiles(e.target.files)}
            />
            <p className="text-xs text-muted-foreground">
              Select every match scorecard for the season (or a single .zip of them). The grade,
              season and round are read from each scorecard's header. Player names are matched once
              across the whole batch, then all valid matches are committed together.
            </p>
          </div>
          <Button type="submit" disabled={uploading}>
            {uploading ? "Parsing…" : "Upload & Preview"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
