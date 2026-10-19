/**
 * Read-time counterpart of pg_temp.jr_norm_club in juniors-etl.sql.
 * Strip age/category suffixes, never team nicknames: Rams and Hornets
 * must remain different. Only a unique longest whole-token prefix wins.
 */
export function normaliseJuniorClubName(raw: string | null | undefined): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(?:under\s*[0-9]+|u[0-9]+|year\s*[0-9]+(?:-[0-9]+)?|yr\s*[0-9]+|y[0-9]+)\b/g, " ")
    .replace(
      /\b(?:cricket|club|clubs|junior|juniors|jcc|cc|inc|association|associations|red|blue|blues|white|whites|black|blacks|green|greens|gold|golds|grey|gray|maroon|navy|yellow|orange|purple|silver|brown|browns|boys|boy|girls|girl|mens|men|womens|women)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function matchJuniorOpponentClub<T extends { id: number; name: string }>(
  opponent: string | null | undefined,
  clubs: readonly T[],
): T | null {
  const name = normaliseJuniorClubName(opponent);
  if (!name) return null;
  const matches = clubs
    .map((club) => ({ club, key: normaliseJuniorClubName(club.name) }))
    .filter(({ key }) => key && (name === key || name.startsWith(`${key} `)))
    .sort((a, b) => b.key.length - a.key.length);
  if (!matches.length || (matches[1] && matches[0].key.length === matches[1].key.length))
    return null;
  return matches[0].club;
}
