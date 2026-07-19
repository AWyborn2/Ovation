import { useEffect, useRef } from "react";
import { JuniorScorecard } from "@workspace/cricket-club";

// The junior card always brands the tenant side from DEFAULT_BRAND, whose logo
// is the app-served /ovation-logo.svg. The capture server has no app public/
// dir, so swap that src for an inline copy of the same asset. NOTE the on-disk
// asset is invalid XML ("--" inside comments) and fails to decode as an <img>
// even in the real app — this inline copy is the identical drawing with the
// illegal comments stripped (defect recorded in learnings/wave2-H.md).
const OVATION_LOGO_DATA_URI =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4IiByb2xlPSJpbWciIGFyaWEtbGFiZWw9Ik92YXRpb24gcGxhY2Vob2xkZXIgbG9nbyI+CiAgPGNpcmNsZSBjeD0iNjQiIGN5PSI2NCIgcj0iNjAiIGZpbGw9IiMzMzQxNTUiLz4KICA8Y2lyY2xlIGN4PSI2NCIgY3k9IjY0IiByPSI2MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTRBM0I4IiBzdHJva2Utd2lkdGg9IjQiLz4KICA8cGF0aAogICAgZmlsbC1ydWxlPSJldmVub2RkIgogICAgY2xpcC1ydWxlPSJldmVub2RkIgogICAgZD0iTTY0IDkyQzc5LjQ2NCA5MiA5MiA3OS40NjQgOTIgNjRDOTIgNDguNTM2IDc5LjQ2NCAzNiA2NCAzNkM0OC41MzYgMzYgMzYgNDguNTM2IDM2IDY0QzM2IDc5LjQ2NCA0OC41MzYgOTIgNjQgOTJaTTY0IDc2QzcwLjYyNzQgNzYgNzYgNzAuNjI3NCA3NiA2NEM3NiA1Ny4zNzI2IDcwLjYyNzQgNTIgNjQgNTJDNTcuMzcyNiA1MiA1MiA1Ny4zNzI2IDUyIDY0QzUyIDcwLjYyNzQgNTcuMzcyNiA3NiA2NCA3NloiCiAgICBmaWxsPSIjRkZCMjM4IgogIC8+CiAgPHBhdGgKICAgIGQ9Ik04OCA0MEM5MyAzMyA5MyAyNCA4OCAxNyIKICAgIGZpbGw9Im5vbmUiCiAgICBzdHJva2U9IiNGRkIyMzgiCiAgICBzdHJva2Utd2lkdGg9IjQiCiAgICBzdHJva2UtbGluZWNhcD0icm91bmQiCiAgICBvcGFjaXR5PSIwLjg1IgogIC8+Cjwvc3ZnPgo=";

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

// Fictional junior one-dayer, first innings recorded so far. Opponent is
// unmatched to a club record, so the opposition side shows the neutral
// fallback scheme + generated crest; the tenant side shows DEFAULT_BRAND.
// A second-innings variant would clip the capture cell — see learnings.
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
  ],
};

/**
 * Junior innings through the junior view-model adapter: tenant batting card on
 * the DEFAULT_BRAND slate scheme, unmatched opponent's bowling card on the
 * neutral scheme, retired/run-out junior dismissals and ball-notation overs.
 */
export function JuniorInningsPair() {
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
