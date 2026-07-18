import { useEffect, useRef } from "react";
import { JuniorScorecard } from "@workspace/cricket-club";

// The junior card always brands the tenant side from DEFAULT_BRAND, whose logo
// is the app-served /ovation-logo.svg. The capture server has no app public/
// dir, so swap that one src for an inline copy of the same repo asset
// (artifacts/cricket-club/public/ovation-logo.svg) — identical pixels, no 404.
const OVATION_LOGO_DATA_URI =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4IiByb2xlPSJpbWciIGFyaWEtbGFiZWw9Ik92YXRpb24gcGxhY2Vob2xkZXIgbG9nbyI+CiAgPCEtLSBOZXV0cmFsIHNsYXRlIGJhZGdlLCBtYXRjaGluZyBERUZBVUxUX0JSQU5EJ3MgZmFsbGJhY2sgcGFsZXR0ZSAtLT4KICA8Y2lyY2xlIGN4PSI2NCIgY3k9IjY0IiByPSI2MCIgZmlsbD0iIzMzNDE1NSIvPgogIDxjaXJjbGUgY3g9IjY0IiBjeT0iNjQiIHI9IjYwIiBmaWxsPSJub25lIiBzdHJva2U9IiM5NEEzQjgiIHN0cm9rZS13aWR0aD0iNCIvPgogIDwhLS0gU3R5bGlzZWQgIk8iIHJpbmcgaW4gdGhlIGFtYmVyIGFjY2VudCAoREVGQVVMVF9CUkFORC5hY2NlbnRUb2tlbiksIHB1cmUKICAgICAgIHNoYXBlcyBvbmx5IC0tIG5vIGV4dGVybmFsIGZvbnQgZGVwZW5kZW5jeSBzbyB0aGlzIHJlbmRlcnMgaWRlbnRpY2FsbHkKICAgICAgIGV2ZXJ5d2hlcmUuIERlbGliZXJhdGVseSBhIHBsYWNlaG9sZGVyOiBhIGRlc2lnbmVkIGJyYW5kIGFzc2V0IGNhbgogICAgICAgcmVwbGFjZSB0aGlzIGZpbGUgbGF0ZXIgd2l0aG91dCB0b3VjaGluZyBhbnkgY29kZS4gLS0+CiAgPHBhdGgKICAgIGZpbGwtcnVsZT0iZXZlbm9kZCIKICAgIGNsaXAtcnVsZT0iZXZlbm9kZCIKICAgIGQ9Ik02NCA5MkM3OS40NjQgOTIgOTIgNzkuNDY0IDkyIDY0QzkyIDQ4LjUzNiA3OS40NjQgMzYgNjQgMzZDNDguNTM2IDM2IDM2IDQ4LjUzNiAzNiA2NEMzNiA3OS40NjQgNDguNTM2IDkyIDY0IDkyWk02NCA3NkM3MC42Mjc0IDc2IDc2IDcwLjYyNzQgNzYgNjRDNzYgNTcuMzcyNiA3MC42Mjc0IDUyIDY0IDUyQzU3LjM3MjYgNTIgNTIgNTcuMzcyNiA1MiA2NEM1MiA3MC42Mjc0IDU3LjM3MjYgNzYgNjQgNzZaIgogICAgZmlsbD0iI0ZGQjIzOCIKICAvPgogIDwhLS0gU21hbGwgbW90aW9uIGZsb3VyaXNoIC0tIGEgYnJpZ2h0IGFyYyBzdWdnZXN0aW5nIGFwcGxhdXNlL292YXRpb24gLS0+CiAgPHBhdGgKICAgIGQ9Ik04OCA0MEM5MyAzMyA5MyAyNCA4OCAxNyIKICAgIGZpbGw9Im5vbmUiCiAgICBzdHJva2U9IiNGRkIyMzgiCiAgICBzdHJva2Utd2lkdGg9IjQiCiAgICBzdHJva2UtbGluZWNhcD0icm91bmQiCiAgICBvcGFjaXR5PSIwLjg1IgogIC8+Cjwvc3ZnPgo=";

const batLine = (
  id: number,
  playerName: string,
  isHallsHead: boolean,
  runs: number,
  balls: number,
  strikeRate: number,
  dismissal: string | null,
) => ({ id, participantId: null, playerName, isHallsHead, isPrivate: false, batOrder: id, runs, balls, fours: null, sixes: null, strikeRate, dismissal });

const bowlLine = (
  id: number,
  playerName: string,
  isHallsHead: boolean,
  overs: number,
  maidens: number,
  runs: number,
  wickets: number,
  economy: number,
  wides: number,
  noBalls: number,
) => ({ id, participantId: null, playerName, isHallsHead, isPrivate: false, overs, maidens, runs, wickets, economy, wides, noBalls });

// Fictional junior fixture. Opponent left unmatched to a club record, so the
// opposition side shows the neutral fallback scheme + generated crest.
const match = {
  id: 301,
  playhqMatchId: null,
  season: "2025/26",
  grade: "Under 14 Gold",
  ageGroup: "U14",
  teamName: "Seacrest CC U14",
  competition: "Junior League",
  association: null,
  round: "Round 6",
  matchDate: "2026-02-08",
  venue: "Foreshore Reserve",
  status: "Completed",
  opponentName: "Estuary Breakers U14",
  hhResult: "Win",
  winner: null,
  tossWinner: null,
  hhBattedFirst: true,
  hhScore: "142/3",
  opponentScore: "126/4",
  opponentClub: null,
  rosters: [],
  innings: [
    {
      innings: 1,
      battingTeam: "Seacrest CC U14",
      isHallsHead: true,
      batting: [
        batLine(1, "Noah Bennett", true, 34, 29, 117.2, "c: Taylor b: Reid"),
        batLine(2, "Olivia Marsh", true, 28, 31, 90.3, "retired not out"),
        batLine(3, "Charlie Doyle", true, 22, 25, 88.0, "b: Sharma"),
        batLine(4, "Ava Thompson", true, 18, 20, 90.0, "run out (Cole)"),
        batLine(5, "Max Whitfield", true, 12, 15, 80.0, null),
      ],
      bowling: [
        bowlLine(1, "Riley Reid", false, 4, 0, 22, 1, 5.5, 4, 1),
        bowlLine(2, "Isla Sharma", false, 4, 1, 18, 1, 4.5, 3, 2),
        bowlLine(3, "Jack Taylor", false, 3.3, 0, 25, 0, 7.14, 5, 1),
      ],
    },
    {
      innings: 2,
      battingTeam: "Estuary Breakers U14",
      isHallsHead: false,
      batting: [
        batLine(6, "Liam Cole", false, 41, 36, 113.9, "c: Marsh b: Bennett"),
        batLine(7, "Sophie Nash", false, 25, 30, 83.3, "b: Doyle"),
        batLine(8, "Jack Taylor", false, 19, 22, 86.4, "run out"),
        batLine(9, "Riley Reid", false, 14, 18, 77.8, null),
        batLine(10, "Isla Sharma", false, 9, 12, 75.0, "lbw: Whitfield"),
      ],
      bowling: [
        bowlLine(4, "Noah Bennett", true, 4, 1, 15, 1, 3.75, 2, 0),
        bowlLine(5, "Charlie Doyle", true, 4, 0, 21, 1, 5.25, 3, 1),
        bowlLine(6, "Max Whitfield", true, 4, 0, 19, 1, 4.75, 2, 0),
        bowlLine(7, "Ava Thompson", true, 3.3, 0, 24, 0, 6.86, 4, 1),
      ],
    },
  ],
};

/**
 * Two-innings junior match through the junior view-model adapter: tenant side
 * on the DEFAULT_BRAND slate scheme, unmatched opponent on the neutral scheme,
 * retired/run-out junior dismissals and ball-notation overs.
 */
export function JuniorTwoInnings() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current
      ?.querySelectorAll<HTMLImageElement>('img[src="/ovation-logo.svg"]')
      .forEach((img) => {
        img.src = OVATION_LOGO_DATA_URI;
      });
  }, []);
  return (
    <div ref={ref} style={{ maxWidth: 620 }}>
      <JuniorScorecard match={match} />
    </div>
  );
}
