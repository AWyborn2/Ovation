import { useState } from "react";
import { useUpdateJuniorMatch, type JuniorMatchDetail } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useClubShortName } from "@/lib/brand-context";

/** Editable match metadata (scores, result, toss, batted-first, date, round, venue). */
export function MatchMetaForm({
  match,
  onSaved,
  onError,
  clearError,
}: {
  match: JuniorMatchDetail;
  onSaved: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const clubShort = useClubShortName();
  const update = useUpdateJuniorMatch();
  const [team1Score, setTeam1Score] = useState(match.team1Score ?? "");
  const [team2Score, setTeam2Score] = useState(match.team2Score ?? "");
  const [hhResult, setHhResult] = useState(match.hhResult ?? "");
  const [winner, setWinner] = useState(match.winner ?? "");
  const [tossWinner, setTossWinner] = useState(match.tossWinner ?? "");
  const [battedFirst, setBattedFirst] = useState(
    match.hhBattedFirst == null ? "" : match.hhBattedFirst ? "yes" : "no",
  );
  const [status, setStatus] = useState(match.status ?? "");
  const [matchDate, setMatchDate] = useState(match.matchDate ?? "");
  const [round, setRound] = useState(match.round ?? "");
  const [venue, setVenue] = useState(match.venue ?? "");

  const fields: {
    label: string;
    value: string;
    set: (v: string) => void;
    width?: string;
  }[] = [
    { label: `${match.team1 ?? "Team 1"} score`, value: team1Score, set: setTeam1Score },
    { label: `${match.team2 ?? "Team 2"} score`, value: team2Score, set: setTeam2Score },
    { label: `Result (${clubShort})`, value: hhResult, set: setHhResult },
    { label: "Winner", value: winner, set: setWinner },
    { label: "Toss winner", value: tossWinner, set: setTossWinner },
    { label: "Status", value: status, set: setStatus },
    { label: "Match date", value: matchDate, set: setMatchDate },
    { label: "Round", value: round, set: setRound },
    { label: "Venue", value: venue, set: setVenue },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Match details</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3">
          {fields.map((f) => (
            <div key={f.label} className="space-y-1">
              <Label>{f.label}</Label>
              <Input value={f.value} onChange={(e) => f.set(e.target.value)} className="w-44" />
            </div>
          ))}
          <div className="space-y-1">
            <Label>{clubShort} batted first</Label>
            <select
              value={battedFirst}
              onChange={(e) => setBattedFirst(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <Button
            disabled={update.isPending}
            onClick={() => {
              clearError();
              update.mutate(
                {
                  id: match.id,
                  data: {
                    team1Score: team1Score.trim() === "" ? null : team1Score,
                    team2Score: team2Score.trim() === "" ? null : team2Score,
                    hhResult: hhResult.trim() === "" ? null : hhResult,
                    winner: winner.trim() === "" ? null : winner,
                    tossWinner: tossWinner.trim() === "" ? null : tossWinner,
                    hhBattedFirst: battedFirst === "" ? null : battedFirst === "yes",
                    status: status.trim() === "" ? null : status,
                    matchDate: matchDate.trim() === "" ? null : matchDate,
                    round: round.trim() === "" ? null : round,
                    venue: venue.trim() === "" ? null : venue,
                  },
                },
                { onSuccess: onSaved, onError },
              );
            }}
          >
            {update.isPending ? "Saving…" : "Save match details"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
