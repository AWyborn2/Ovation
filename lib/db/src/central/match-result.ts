/**
 * Did the club win? Central's recorded winner first. When none is recorded, the result
 * text PlayHQ publishes names the winning side ("Claremont-Nedlands - 1s won by 106 runs"),
 * so a "<team> won" naming either side still decides it. Null for a draw, tie or no result.
 */
export function centralClubWon(
  m: {
    winnerClubId: number | null;
    homeClubId: number | null;
    homeTeam: string | null;
    awayTeam: string | null;
    resultText: string | null;
  },
  clubId: number,
): boolean | null {
  if (m.winnerClubId != null) return m.winnerClubId === clubId;
  const winner = /^(.+?)\s+won\b/i.exec(m.resultText?.trim() ?? "")?.[1];
  if (!winner) return null;
  const norm = (t: string | null) => (t ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const clubTeam = m.homeClubId === clubId ? m.homeTeam : m.awayTeam;
  const oppTeam = m.homeClubId === clubId ? m.awayTeam : m.homeTeam;
  if (norm(winner) === norm(clubTeam)) return true;
  if (norm(winner) === norm(oppTeam)) return false;
  return null;
}
